import io
import json
import logging
import pdfplumber
import docx
import anthropic

logger = logging.getLogger(__name__)
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form
from sqlalchemy.orm import Session
from typing import List, Optional
from pydantic import BaseModel
from app.core.database import get_db
from app.core.config import settings
from app.models.project import Project
from app.models.part import Part, part_interns
from app.models.part_instance import PartInstance
from app.models.task import Task
from app.models.subtask import Subtask
from app.models.user import User
from app.routers.auth import require_admin
from app.services.part_assignments import create_individual_part_task, ensure_part_instances

router = APIRouter(prefix="/projects/{project_id}/analyze", tags=["analyze"])

# ── Schemas ───────────────────────────────────────────────────────────────────

class SuggestedTask(BaseModel):
    title: str
    description: str
    priority: str = "medium"
    task_type: str = "feature"
    story_points: Optional[int] = None
    subtasks: List[str] = []

class AnalyzeResponse(BaseModel):
    suggested_tasks: List[SuggestedTask]
    summary: str
    parts_detected: List[str]

class ProposedPart(BaseModel):
    name: str
    description: str
    recommended_interns: int = 1
    skills_required: List[str] = []
    tasks: List[SuggestedTask] = []

class DetectedTech(BaseModel):
    name: str
    category: str
    source: str = "CDC"
    confidence: str = "high"

class StackConflict(BaseModel):
    ai_suggested: str
    cdc_specifies: List[str]
    category: str
    message: str

class ProposePartsResponse(BaseModel):
    summary: str
    proposed_parts: List[ProposedPart]
    detected_stack: List[DetectedTech] = []
    stack_conflicts: List[StackConflict] = []

# ── Helpers ───────────────────────────────────────────────────────────────────

def extract_text_from_pdf(file_bytes: bytes) -> str:
    text = []
    with pdfplumber.open(io.BytesIO(file_bytes)) as pdf:
        for page in pdf.pages:
            t = page.extract_text()
            if t:
                text.append(t)
    return "\n".join(text)

def extract_text_from_docx(file_bytes: bytes) -> str:
    doc = docx.Document(io.BytesIO(file_bytes))
    return "\n".join(p.text for p in doc.paragraphs if p.text.strip())

def extract_text(filename: str, file_bytes: bytes) -> str:
    name = filename.lower()
    if name.endswith(".pdf"):
        return extract_text_from_pdf(file_bytes)
    elif name.endswith(".docx") or name.endswith(".doc"):
        return extract_text_from_docx(file_bytes)
    else:
        raise HTTPException(status_code=400, detail="Seuls les fichiers PDF et DOCX sont acceptés")

def extract_json(text: str) -> dict:
    text = text.strip()
    # Strip markdown code fences
    if "```" in text:
        for chunk in text.split("```"):
            chunk = chunk.strip()
            if chunk.lower().startswith("json"):
                chunk = chunk[4:].strip()
            if chunk.startswith("{"):
                text = chunk
                break
    # Find outermost { ... } — scan forward to find a valid complete object
    start = text.find("{")
    if start == -1:
        raise json.JSONDecodeError("No JSON object found", text, 0)
    # Try progressively from last } backwards until we get valid JSON
    pos = len(text)
    while True:
        end = text.rfind("}", start, pos)
        if end == -1 or end <= start:
            break
        candidate = text[start:end + 1]
        try:
            return json.loads(candidate)
        except json.JSONDecodeError:
            pos = end  # try a shorter slice
    # Last resort: let it raise naturally with a useful message
    return json.loads(text[start:])

def call_claude(prompt: str, model: str = "claude-haiku-4-5-20251001", max_tokens: int = 8000) -> dict:
    import time
    client = anthropic.Anthropic(api_key=settings.ANTHROPIC_API_KEY)
    last_exc = None
    for attempt in range(3):
        try:
            message = client.messages.create(
                model=model,
                max_tokens=max_tokens,
                system=(
                    "Tu es un chef de projet senior expert en développement logiciel. "
                    "IMPORTANT: Tu réponds UNIQUEMENT avec un objet JSON brut valide. "
                    "JAMAIS de markdown, JAMAIS de ```json, JAMAIS de texte avant ou après le JSON. "
                    "Commence ta réponse directement par { et termine par }. "
                    "Tu génères toujours des tâches et sous-tâches très détaillées en français."
                ),
                messages=[{"role": "user", "content": prompt}],
            )
            raw = message.content[0].text
            logger.debug("CLAUDE STOP_REASON: %s", message.stop_reason)
            logger.debug("CLAUDE RAW first 500: %s", raw[:500])
            return extract_json(raw)
        except json.JSONDecodeError as e:
            logger.warning("CLAUDE JSON parse error (attempt %d): %s", attempt + 1, e)
            last_exc = e
            time.sleep(2 ** attempt)
        except Exception as e:
            http_status = getattr(e, "status_code", None)
            logger.warning("CLAUDE API error (attempt %d, status %s): %s", attempt + 1, http_status, e)
            if http_status in (529, 500, 503):
                last_exc = e
                time.sleep(2 ** attempt)
            else:
                raise
    raise last_exc

def build_part_prompt(cdc_text: str, project_name: str, part_name: str) -> str:
    return f"""Tu es un chef de projet senior analysant un cahier des charges (CDC) pour la partie "{part_name}" du projet "{project_name}".

Ta mission : décomposer ce CDC en tâches de développement TRÈS détaillées et actionnables pour un stagiaire.

RÈGLES STRICTES:
- Générer entre 5 et 10 tâches selon la complexité.
- Chaque tâche = 2 à 6 heures de travail maximum
- Chaque tâche doit avoir exactement 3 sous-tâches concrètes
- Titres courts et impératifs (ex: "Créer le formulaire de connexion")
- Descriptions claires expliquant EXACTEMENT ce qui doit être fait
- Toujours en FRANÇAIS

Champs de chaque tâche:
- title: phrase impérative courte (max 8 mots)
- description: 2-3 phrases précises sur ce qui doit être fait
- priority: "low" | "medium" | "high"
- task_type: "task" | "bug" | "feature" | "story"
- story_points: 1 | 2 | 3 | 5 | 8
- subtasks: liste de 3 à 6 étapes concrètes de réalisation

Réponds UNIQUEMENT en JSON brut (commence par {{):
{{
  "summary": "Résumé de 3-4 phrases du CDC de cette partie",
  "parts_detected": ["fonctionnalité1", "fonctionnalité2"],
  "suggested_tasks": [
    {{
      "title": "Configurer l'environnement du chatbot",
      "description": "Installer et configurer les dépendances nécessaires au chatbot IA incluant les bibliothèques NLP et l'accès à l'API.",
      "priority": "high",
      "task_type": "task",
      "story_points": 2,
      "subtasks": [
        "Créer le fichier requirements.txt avec les dépendances",
        "Configurer les variables d'environnement",
        "Tester la connexion à l'API"
      ]
    }}
  ]
}}

CDC de la partie "{part_name}":
{cdc_text[:14000]}"""

# ── Tech stack keyword detection ──────────────────────────────────────────────

_TECH_KEYWORDS = {
    # Frontend
    "react": ("React", "Frontend"),
    "reactjs": ("React", "Frontend"),
    "vue.js": ("Vue.js", "Frontend"),
    "vuejs": ("Vue.js", "Frontend"),
    " vue ": ("Vue.js", "Frontend"),
    "angular": ("Angular", "Frontend"),
    "next.js": ("Next.js", "Frontend"),
    "nextjs": ("Next.js", "Frontend"),
    "nuxt": ("Nuxt.js", "Frontend"),
    "svelte": ("Svelte", "Frontend"),
    "tailwind": ("Tailwind CSS", "Frontend"),
    "bootstrap": ("Bootstrap", "Frontend"),
    "typescript": ("TypeScript", "Frontend"),
    "javascript": ("JavaScript", "Frontend"),
    # Backend
    "fastapi": ("FastAPI", "Backend"),
    "django": ("Django", "Backend"),
    "flask": ("Flask", "Backend"),
    "node.js": ("Node.js", "Backend"),
    "nodejs": ("Node.js", "Backend"),
    "express": ("Express.js", "Backend"),
    "spring boot": ("Spring Boot", "Backend"),
    "laravel": ("Laravel", "Backend"),
    "nestjs": ("NestJS", "Backend"),
    "ruby on rails": ("Ruby on Rails", "Backend"),
    "python": ("Python", "Backend"),
    " java ": ("Java", "Backend"),
    "golang": ("Go", "Backend"),
    "rust": ("Rust", "Backend"),
    # Database
    "postgresql": ("PostgreSQL", "Database"),
    "postgres": ("PostgreSQL", "Database"),
    "mysql": ("MySQL", "Database"),
    "mariadb": ("MariaDB", "Database"),
    "mongodb": ("MongoDB", "Database"),
    "sqlite": ("SQLite", "Database"),
    "redis": ("Redis", "Database"),
    "elasticsearch": ("Elasticsearch", "Database"),
    "supabase": ("Supabase", "Database"),
    "firebase": ("Firebase", "Database"),
    # AI/ML
    "openai": ("OpenAI", "AI"),
    "claude": ("Claude API", "AI"),
    "anthropic": ("Claude API", "AI"),
    "langchain": ("LangChain", "AI"),
    "tensorflow": ("TensorFlow", "AI"),
    "pytorch": ("PyTorch", "AI"),
    "hugging face": ("Hugging Face", "AI"),
    # Mobile
    "react native": ("React Native", "Mobile"),
    "flutter": ("Flutter", "Mobile"),
    "kotlin": ("Kotlin", "Mobile"),
    "swift": ("Swift", "Mobile"),
}

def detect_stack_from_cdc(cdc_text: str) -> list:
    """Multi-language detection for Frontend, Backend, Database, AI/LLM"""
    if not cdc_text:
        return []
    
    text_lower = " " + cdc_text.lower() + " "
    detected = {}

    TECH_KEYWORDS = {
        # Frontend
        "angular": ("Angular", "Frontend"),
        "react": ("React", "Frontend"),
        "vue": ("Vue.js", "Frontend"),
        "next.js": ("Next.js", "Frontend"),
        # Backend
        "spring boot": ("Spring Boot", "Backend"),
        "springboot": ("Spring Boot", "Backend"),
        "java spring": ("Spring Boot", "Backend"),
        "fastapi": ("FastAPI", "Backend"),
        "django": ("Django", "Backend"),
        "node.js": ("Node.js", "Backend"),
        "nodejs": ("Node.js", "Backend"),
        "laravel": ("Laravel", "Backend"),
        # Database
        "postgresql": ("PostgreSQL", "Database"),
        "postgres": ("PostgreSQL", "Database"),
        "mysql": ("MySQL", "Database"),
        "mongodb": ("MongoDB", "Database"),
        "mariadb": ("MariaDB", "Database"),
        "sqlite": ("SQLite", "Database"),
        "redis": ("Redis", "Database"),
        # AI / LLM
        "openai": ("OpenAI", "AI/LLM"),
        "claude": ("Claude / Anthropic", "AI/LLM"),
        "anthropic": ("Claude / Anthropic", "AI/LLM"),
        "langchain": ("LangChain", "AI/LLM"),
        "llm": ("LLM API", "AI/LLM"),
        "gpt": ("OpenAI GPT", "AI/LLM"),
    }

    for keyword, (name, category) in TECH_KEYWORDS.items():
        if keyword in text_lower and name not in detected:
            detected[name] = {
                "name": name,
                "category": category,
                "source": "CDC",
                "confidence": "high"
            }

    # Special Stack section boost (French common)
    if any(word in text_lower for word in ["stack", "techno", "frontend", "backend", "base de données", "ia", "llm"]):
        # Boost high confidence
        for name in ["Angular", "Spring Boot", "PostgreSQL", "OpenAI"]:
            if name.lower() in text_lower or any(k in text_lower for k in ["angular", "spring", "postgres", "openai", "claude"]):
                if name in [d["name"] for d in detected.values()]:
                    # Already detected, just boost
                    pass

    return list(detected.values())
    """Multi-language stack detection (FR, EN, AR, etc.)"""
    if not cdc_text:
        return []
    
    text_lower = " " + cdc_text.lower() + " "
    
    # Expanded multi-language keywords
    TECH_KEYWORDS_MULTI = {
        # Frontend
        "angular": ("Angular", "Frontend"),
        "angularjs": ("Angular", "Frontend"),
        "react": ("React", "Frontend"),
        "vue": ("Vue.js", "Frontend"),
        # Backend
        "spring boot": ("Spring Boot", "Backend"),
        "springboot": ("Spring Boot", "Backend"),
        "spring": ("Spring Boot", "Backend"),           # French/English
        "boot spring": ("Spring Boot", "Backend"),
        "java spring": ("Spring Boot", "Backend"),
        # Others
        "fastapi": ("FastAPI", "Backend"),
        "django": ("Django", "Backend"),
        "node.js": ("Node.js", "Backend"),
        "nodejs": ("Node.js", "Backend"),
        "laravel": ("Laravel", "Backend"),
        "flutter": ("Flutter", "Mobile"),
        "react native": ("React Native", "Mobile"),
    }

    detected = {}
    for keyword, (name, category) in TECH_KEYWORDS_MULTI.items():
        if keyword in text_lower and name not in detected:
            detected[name] = {
                "name": name,
                "category": category,
                "source": "CDC",
                "confidence": "high"
            }

    # Special detection for "Stack" section (very common in French CDCs)
    stack_section_patterns = [
        "stack", "techno", "technologie", "frontend", "backend", 
        "front-end", "back-end", "architecture"
    ]
    
    has_stack_section = any(pattern in text_lower for pattern in stack_section_patterns)
    
    if has_stack_section:
        # Boost known technologies
        if "angular" in text_lower:
            detected["Angular"] = {"name": "Angular", "category": "Frontend", "source": "CDC", "confidence": "very_high"}
        if any(x in text_lower for x in ["spring boot", "springboot", "spring"]):
            detected["Spring Boot"] = {"name": "Spring Boot", "category": "Backend", "source": "CDC", "confidence": "very_high"}

    return list(detected.values())

def validate_stack_conflicts(detected_cdc: list, ai_tech_stack: list) -> list:
    """
    Compare AI-suggested tech with CDC-detected tech.
    Returns list of conflict warnings when AI suggests something that conflicts with CDC.
    Conflicts are detected within the same category (e.g., AI suggests MongoDB but CDC says PostgreSQL).
    """
    cdc_by_cat: dict = {}
    for t in detected_cdc:
        cdc_by_cat.setdefault(t["category"], []).append(t["name"])

    # Flatten AI stack (handles nested category/technologies format)
    ai_flat: list = []
    for entry in ai_tech_stack:
        if isinstance(entry, dict):
            if "technologies" in entry:
                for tech in entry.get("technologies", []):
                    ai_flat.append({"name": tech.get("name", ""), "category": entry.get("category", "Other")})
            elif "name" in entry:
                ai_flat.append(entry)

    conflicts = []
    for ai_tech in ai_flat:
        cat = ai_tech.get("category", "")
        name = ai_tech.get("name", "")
        cdc_names = cdc_by_cat.get(cat, [])
        if cdc_names and name not in cdc_names:
            conflicts.append({
                "ai_suggested": name,
                "cdc_specifies": cdc_names,
                "category": cat,
                "message": f"L'IA a suggéré {name} mais le CDC mentionne {', '.join(cdc_names)} ({cat}).",
            })
    return conflicts


def build_global_prompt(cdc_text: str, project_name: str) -> str:
    return (
        f'Tu es un architecte logiciel senior. Décompose le projet "{project_name}" en modules indépendants pour des stagiaires.\n\n'
        "RÈGLES STRICTES:\n"
        "- 3 à 5 modules maximum, découpés par domaine métier (pas par couche technique).\n"
        "- Interdit comme nom de module: 'Backend', 'Frontend', 'Base de données', 'Navigation', 'Intégration', 'Tests', 'Sécurité'.\n"
        "- Correct: 'Gestion des utilisateurs', 'Module paiement', 'Messagerie', etc.\n"
        "- Chaque module est full-stack (frontend + backend + BDD) et développable sans attendre les autres.\n"
        "- Si le CDC mentionne des commerciaux terrain, application mobile, ou travail sans connexion : créer un module 'Synchronisation et mode hors-ligne'.\n"
        "- 3 à 5 tâches par module, chacune = 2-6h de travail concret et précis pour un stagiaire.\n"
        "- Interdit dans les tâches: 'vérifier si l'endpoint existe', 'voir si...', 'éventuellement'. Chaque tâche CRÉE ou MODIFIE quelque chose de précis.\n"
        "- Chaque module qui expose des données utilisateur doit contenir UNE tâche de sécurité (validation ownership, test retour 403).\n"
        "- Les tâches optionnelles ont story_points=1 et leur title commence par '[Optionnel]'.\n"
        "- 2 sous-tâches par tâche (étapes concrètes, pas vagues).\n"
        "- Exclure: DevOps, Docker, CI/CD, déploiement, infrastructure.\n"
        "- priority: low|medium|high. task_type: task|feature|bug|story. Tout en français.\n"
        "- Commence DIRECTEMENT par { sans texte avant.\n\n"
        "Format JSON (respecte exactement cette structure):\n"
        '{"summary":"...","proposed_parts":[{"name":"...","description":"...","recommended_interns":1,"skills_required":["..."],'
        '"tasks":[{"title":"...","description":"...","priority":"medium","task_type":"feature","story_points":3,"subtasks":["...","..."]}]}]}\n\n'
        "CDC:\n"
        + cdc_text[:8000]
    )

# ── Endpoint Mode 1 : CDC par partie ─────────────────────────────────────────

@router.post("/part", response_model=AnalyzeResponse)
async def analyze_part_cdc(
    project_id: int,
    file: UploadFile = File(...),
    part_id: int = Form(...),
    db: Session = Depends(get_db),
    _: User = Depends(require_admin),
):
    if not settings.ANTHROPIC_API_KEY:
        raise HTTPException(status_code=400, detail="Clé API Anthropic non configurée")

    project = db.query(Project).filter(Project.id == project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="Projet introuvable")

    part = db.query(Part).filter(Part.id == part_id, Part.project_id == project_id).first()
    if not part:
        raise HTTPException(status_code=404, detail="Partie introuvable")

    file_bytes = await file.read()
    if len(file_bytes) > 10 * 1024 * 1024:
        raise HTTPException(status_code=413, detail="Le fichier dépasse la limite de 10 Mo")
    try:
        cdc_text = extract_text(file.filename, file_bytes)
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=422, detail=f"Impossible de lire le fichier: {str(e)}")

    if not cdc_text.strip():
        raise HTTPException(status_code=422, detail="Le document semble vide ou illisible")

    # Save CDC to part
    part.cdc_text = cdc_text
    part.cdc_filename = file.filename
    db.commit()

    try:
        result = call_claude(build_part_prompt(cdc_text, project.name, part.name))
    except json.JSONDecodeError:
        raise HTTPException(status_code=502, detail="L'IA a retourné un JSON invalide. Réessayez.")
    except Exception:
        logger.error("Erreur Claude API (analyze/part)", exc_info=True)
        raise HTTPException(status_code=502, detail="Service IA temporairement indisponible. Réessayez.")

    tasks = []
    for t in result.get("suggested_tasks", []):
        tasks.append(SuggestedTask(
            title=t.get("title", "Tâche sans titre"),
            description=t.get("description", ""),
            priority=t.get("priority", "medium") if t.get("priority") in ["low","medium","high"] else "medium",
            task_type=t.get("task_type", "feature") if t.get("task_type") in ["task","bug","feature","story"] else "feature",
            story_points=t.get("story_points"),
            subtasks=t.get("subtasks", []),
        ))

    return AnalyzeResponse(
        suggested_tasks=tasks,
        summary=result.get("summary", ""),
        parts_detected=result.get("parts_detected", []),
    )

# ── Endpoint Mode 2 : CDC Global → proposer les parties ──────────────────────

@router.post("/global", response_model=ProposePartsResponse)
async def analyze_global_cdc(
    project_id: int,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    _: User = Depends(require_admin),
):
    if not settings.ANTHROPIC_API_KEY:
        raise HTTPException(status_code=400, detail="Clé API Anthropic non configurée")

    project = db.query(Project).filter(Project.id == project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="Projet introuvable")

    file_bytes = await file.read()
    if len(file_bytes) > 10 * 1024 * 1024:
        raise HTTPException(status_code=413, detail="Le fichier dépasse la limite de 10 Mo")
    try:
        cdc_text = extract_text(file.filename, file_bytes)
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=422, detail=f"Impossible de lire le fichier: {str(e)}")

    if not cdc_text.strip():
        raise HTTPException(status_code=422, detail="Le document semble vide ou illisible")

    # Detect tech stack from CDC text before calling AI
    detected_cdc = detect_stack_from_cdc(cdc_text)

    try:
        result = call_claude(build_global_prompt(cdc_text, project.name), model="claude-haiku-4-5-20251001", max_tokens=8192)
    except json.JSONDecodeError:
        raise HTTPException(status_code=502, detail="L'IA a retourné un JSON invalide. Réessayez.")
    except Exception:
        logger.error("Erreur Claude API (analyze/global)", exc_info=True)
        raise HTTPException(status_code=502, detail="Service IA temporairement indisponible. Réessayez.")

    parts = []
    for p in result.get("proposed_parts", []):
        task_list = []
        for t in p.get("tasks", []):
            task_list.append(SuggestedTask(
                title=t.get("title", "Tâche sans titre"),
                description=t.get("description", ""),
                priority=t.get("priority", "medium") if t.get("priority") in ["low","medium","high"] else "medium",
                task_type=t.get("task_type", "feature") if t.get("task_type") in ["task","bug","feature","story"] else "feature",
                story_points=t.get("story_points"),
                subtasks=t.get("subtasks", []),
            ))
        parts.append(ProposedPart(
            name=p.get("name", "Partie"),
            description=p.get("description", ""),
            recommended_interns=p.get("recommended_interns", 1),
            skills_required=p.get("skills_required", []),
            tasks=task_list,
        ))

    ai_tech_stack = result.get("tech_stack", [])
    conflicts = validate_stack_conflicts(detected_cdc, ai_tech_stack) if detected_cdc else []

    return ProposePartsResponse(
        summary=result.get("summary", ""),
        proposed_parts=parts,
        detected_stack=[DetectedTech(**t) for t in detected_cdc],
        stack_conflicts=[StackConflict(**c) for c in conflicts],
    )

# ── Endpoint : Créer parties + tâches depuis la proposition ──────────────────

class CreatePartTask(BaseModel):
    title: str
    description: str
    priority: str = "medium"
    task_type: str = "feature"
    story_points: Optional[int] = None
    subtasks: List[str] = []

class CreatePartData(BaseModel):
    name: str
    description: str
    assignee_id: Optional[int] = None
    intern_ids: List[int] = []
    assignment_mode: str = "collaborative"
    tasks: List[CreatePartTask] = []

class CreateFromProposalRequest(BaseModel):
    parts: List[CreatePartData]

@router.post("/create-from-proposal")
def create_from_proposal(
    project_id: int,
    data: CreateFromProposalRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    project = db.query(Project).filter(Project.id == project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="Projet introuvable")

    created_parts = 0
    created_tasks = 0
    created_subtasks = 0

    for part_data in data.parts:
        # Resolve intern list — intern_ids takes priority over single assignee_id
        intern_ids = part_data.intern_ids or ([part_data.assignee_id] if part_data.assignee_id else [])
        primary_assignee = intern_ids[0] if intern_ids else None

        part = Part(
            name=part_data.name,
            description=part_data.description,
            assignee_id=primary_assignee,
            assignment_mode=part_data.assignment_mode,
            project_id=project_id,
        )
        db.add(part)
        db.flush()

        # Sync part_interns junction table
        if intern_ids:
            interns = db.query(User).filter(User.id.in_(intern_ids)).all()
            part.interns = interns

        if part.assignment_mode == "individual" and intern_ids:
            ensure_part_instances(db, part.id, intern_ids)

        # Distribute tasks round-robin across all interns
        for idx, task_data in enumerate(part_data.tasks):
            assigned_to = intern_ids[idx % len(intern_ids)] if intern_ids else None
            if part.assignment_mode == "individual":
                task = create_individual_part_task(
                    db,
                    part,
                    created_by_id=current_user.id,
                    title=task_data.title,
                    description=task_data.description,
                    priority=task_data.priority,
                    task_type=task_data.task_type,
                    story_points=task_data.story_points,
                    subtasks=task_data.subtasks,
                    assignee_id=assigned_to or part.assignee_id,
                )
                individual_instances = db.query(PartInstance).filter(PartInstance.part_id == part.id).count()
                created_tasks += 1 + individual_instances
                created_subtasks += len(task_data.subtasks) * (1 + individual_instances)
                continue
            else:
                task = Task(
                    title=task_data.title,
                    description=task_data.description,
                    priority=task_data.priority,
                    task_type=task_data.task_type,
                    story_points=task_data.story_points,
                    assignee_id=assigned_to,
                    project_id=project_id,
                    part_id=part.id,
                    created_by_id=current_user.id,
                )
                db.add(task)
                db.flush()

            for subtask_title in task_data.subtasks:
                db.add(Subtask(title=subtask_title, task_id=task.id))
                created_subtasks += 1

            created_tasks += 1
        created_parts += 1

    db.commit()
    return {
        "ok": True,
        "created_parts": created_parts,
        "created_tasks": created_tasks,
        "created_subtasks": created_subtasks,
    }

# ── Endpoint: Create tasks from Mode 1 review ────────────────────────────────

class ApproveTasksRequest(BaseModel):
    part_id: int
    tasks: List[CreatePartTask]

@router.post("/approve-tasks")
def approve_tasks(
    project_id: int,
    data: ApproveTasksRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    part = db.query(Part).filter(Part.id == data.part_id, Part.project_id == project_id).first()
    if not part:
        raise HTTPException(status_code=404, detail="Partie introuvable")

    # Collect all interns for this part (junction table first, fallback to primary assignee)
    from sqlalchemy import select as sa_select
    junction_rows = db.execute(
        part_interns.select().where(part_interns.c.part_id == part.id)
    ).fetchall()
    intern_ids = [row[1] for row in junction_rows]
    if not intern_ids and part.assignee_id:
        intern_ids = [part.assignee_id]

    created = 0
    for idx, task_data in enumerate(data.tasks):
        assigned_to = intern_ids[idx % len(intern_ids)] if intern_ids else None
        if part.assignment_mode == "individual":
            task = create_individual_part_task(
                db,
                part,
                created_by_id=current_user.id,
                title=task_data.title,
                description=task_data.description,
                priority=task_data.priority,
                task_type=task_data.task_type,
                story_points=task_data.story_points,
                subtasks=task_data.subtasks,
                assignee_id=assigned_to or part.assignee_id,
            )
            created += 1 + db.query(PartInstance).filter(PartInstance.part_id == part.id).count()
            continue
        else:
            task = Task(
                title=task_data.title,
                description=task_data.description,
                priority=task_data.priority,
                task_type=task_data.task_type,
                story_points=task_data.story_points,
                assignee_id=assigned_to,
                project_id=project_id,
                part_id=part.id,
                created_by_id=current_user.id,
            )
            db.add(task)
            db.flush()
        for sub in task_data.subtasks:
            db.add(Subtask(title=sub, task_id=task.id))
        created += 1

    db.commit()
    return {"ok": True, "created_tasks": created}


# ── Endpoint: Suggest architecture + tech stack ───────────────────────────────

@router.post("/suggest-architecture")
def suggest_architecture(
    project_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(require_admin),
):
    project = db.query(Project).filter(Project.id == project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="Projet introuvable")

    parts = db.query(Part).filter(Part.project_id == project_id).all()
    parts_summary = "\n".join(f"- {p.name}: {p.description or ''}" for p in parts)
    cdc_samples = "\n\n".join(
        f"[{p.name}]: {p.cdc_text[:2000]}" for p in parts if p.cdc_text
    )

    cdc_section = ("Extraits du CDC :\n" + cdc_samples) if cdc_samples else ""
    json_template = """{
  "architecture": "Description de l'architecture globale en 2-4 paragraphes.",
  "tech_stack": [
    {"category": "Frontend", "technologies": [{"name": "React", "reason": "..."}]},
    {"category": "Backend",  "technologies": [{"name": "FastAPI", "reason": "..."}]},
    {"category": "Database", "technologies": [{"name": "PostgreSQL", "reason": "..."}]}
  ],
  "skills_required": ["React", "Python", "SQL"],
  "complexity_level": "Débutant | Intermédiaire | Avancé",
  "architecture_notes": "Points d'attention et bonnes pratiques pour les stagiaires."
}"""
    prompt = (
        "Tu es un architecte logiciel senior spécialisé dans les projets développés par des équipes de stagiaires.\n\n"
        "Analyse ce projet et propose une architecture technique réaliste et adaptée.\n\n"
        f"Projet : {project.name}\n\n"
        f"Description : {project.description or 'Non renseignée'}\n\n"
        f"Parties du projet :\n{parts_summary or 'Aucune partie définie pour l instant.'}\n\n"
        f"{cdc_section}\n\n"
        "RÈGLES:\n"
        "- Maximum 3 à 5 technologies principales par catégorie.\n"
        "- Adapte les choix à une équipe de stagiaires.\n"
        "- Favorise des solutions simples et maintenables.\n"
        "- Réponds uniquement en français.\n\n"
        "Retourne uniquement un JSON valide avec cette structure :\n"
        + json_template
    )

    try:
        result = call_claude(prompt)
    except json.JSONDecodeError:
        raise HTTPException(status_code=502, detail="L'IA a retourné une réponse invalide. Réessayez.")
    except Exception:
        logger.error("Erreur Claude API (suggest-architecture)", exc_info=True)
        raise HTTPException(status_code=502, detail="Service IA temporairement indisponible. Réessayez.")

    import json as _json
    project.architecture = result.get("architecture", "")
    project.tech_stack = _json.dumps(result.get("tech_stack", []), ensure_ascii=False)
    project.architecture_notes = result.get("architecture_notes", "")
    db.commit()

    return {
        "architecture": project.architecture,
        "tech_stack": result.get("tech_stack", []),
        "architecture_notes": project.architecture_notes,
    }


@router.put("/architecture")
def save_architecture(
    project_id: int,
    data: dict,
    db: Session = Depends(get_db),
    _: User = Depends(require_admin),
):
    import json as _json
    project = db.query(Project).filter(Project.id == project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="Projet introuvable")
    if "architecture" in data:
        project.architecture = data["architecture"]
    if "tech_stack" in data:
        project.tech_stack = _json.dumps(data["tech_stack"], ensure_ascii=False)
    if "architecture_notes" in data:
        project.architecture_notes = data["architecture_notes"]
    db.commit()
    return {"ok": True}
