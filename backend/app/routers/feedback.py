import json
import anthropic

def extract_json(text: str) -> dict:
    text = text.strip()
    if "```" in text:
        for chunk in text.split("```"):
            chunk = chunk.strip().lstrip("json").lstrip("JSON").strip()
            if chunk.startswith("{"):
                text = chunk
                break
    start = text.find("{")
    end = text.rfind("}")
    if start != -1 and end != -1 and end > start:
        text = text[start:end + 1]
    return json.loads(text)
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from datetime import datetime
from app.core.database import get_db
from app.core.config import settings
from app.models.task import Task, TaskStatus
from app.models.part import Part
from app.models.project import Project
from app.models.user import User
from app.models.subtask import Subtask
from app.routers.auth import get_current_user, require_admin

router = APIRouter(prefix="/feedback", tags=["feedback"])


@router.get("/intern/{intern_id}")
def get_intern_feedback(
    intern_id: int,
    project_id: int = None,
    db: Session = Depends(get_db),
    _: User = Depends(require_admin),
):
    if not settings.ANTHROPIC_API_KEY:
        raise HTTPException(status_code=400, detail="Clé API Anthropic non configurée")

    intern = db.query(User).filter(User.id == intern_id).first()
    if not intern:
        raise HTTPException(status_code=404, detail="Stagiaire introuvable")

    # Get parts assigned to this intern
    parts_query = db.query(Part).filter(Part.assignee_id == intern_id)
    if project_id:
        parts_query = parts_query.filter(Part.project_id == project_id)
    parts = parts_query.all()

    if not parts:
        raise HTTPException(status_code=404, detail="Aucune partie assignée à ce stagiaire")

    now = datetime.utcnow()
    part_ids = [p.id for p in parts]

    tasks = db.query(Task).filter(Task.part_id.in_(part_ids)).all()
    if not tasks:
        raise HTTPException(status_code=404, detail="Aucune tâche trouvée pour ce stagiaire")

    # Build detailed task data
    task_data = []
    for t in tasks:
        subtasks = db.query(Subtask).filter(Subtask.task_id == t.id).all()
        subtask_done = len([s for s in subtasks if s.done])
        is_overdue = t.deadline and t.deadline < now and t.status != TaskStatus.done
        part = next((p for p in parts if p.id == t.part_id), None)
        project = db.query(Project).filter(Project.id == t.project_id).first()

        task_data.append({
            "title": t.title,
            "description": t.description or "",
            "status": t.status.value,
            "priority": t.priority.value if t.priority else "medium",
            "task_type": t.task_type.value if t.task_type else "task",
            "story_points": t.story_points,
            "start_date": t.start_date.strftime("%Y-%m-%d") if t.start_date else None,
            "deadline": t.deadline.strftime("%Y-%m-%d") if t.deadline else None,
            "is_overdue": is_overdue,
            "subtasks_total": len(subtasks),
            "subtasks_done": subtask_done,
            "part": part.name if part else "Inconnu",
            "project": project.name if project else "Inconnu",
        })

    done_tasks = [t for t in task_data if t["status"] == "done"]
    in_progress_tasks = [t for t in task_data if t["status"] == "in_progress"]
    overdue_tasks = [t for t in task_data if t["is_overdue"]]
    todo_tasks = [t for t in task_data if t["status"] == "todo"]

    total_subtasks = sum(t["subtasks_total"] for t in task_data)
    done_subtasks = sum(t["subtasks_done"] for t in task_data)

    stats = {
        "total_tasks": len(task_data),
        "done": len(done_tasks),
        "in_progress": len(in_progress_tasks),
        "overdue": len(overdue_tasks),
        "todo": len(todo_tasks),
        "completion_rate": round(len(done_tasks) / len(task_data) * 100) if task_data else 0,
        "subtask_completion_rate": round(done_subtasks / total_subtasks * 100) if total_subtasks else 0,
        "parts": [p.name for p in parts],
        "projects": list(set(t["project"] for t in task_data)),
    }

    prompt = f"""Tu es un responsable de stage expérimenté. Analyse le travail du stagiaire suivant et génère un feedback détaillé et constructif en français.

Stagiaire: {intern.name}
Parties assignées: {', '.join(stats['parts'])}
Projets: {', '.join(stats['projects'])}

Statistiques:
- Tâches totales: {stats['total_tasks']}
- Terminées: {stats['done']} ({stats['completion_rate']}%)
- En cours: {stats['in_progress']}
- À faire: {stats['todo']}
- En retard: {stats['overdue']}
- Sous-tâches: {done_subtasks}/{total_subtasks} complétées ({stats['subtask_completion_rate']}%)

Détail des tâches:
{json.dumps(task_data, ensure_ascii=False, indent=2)}

Génère un feedback professionnel, bienveillant mais honnête. Réponds en JSON brut:
{{
  "note_globale": 8.5,
  "appreciation": "Très bien | Bien | Satisfaisant | À améliorer | Insuffisant",
  "resume": "Résumé global du travail en 2-3 phrases",
  "points_forts": ["Point fort 1", "Point fort 2", "Point fort 3"],
  "axes_amelioration": ["Axe 1", "Axe 2", "Axe 3"],
  "recommandations": ["Recommandation concrète 1", "Recommandation 2", "Recommandation 3"],
  "analyse_retards": "Analyse des tâches en retard et leur impact (ou 'Aucun retard constaté')",
  "progression": "Évaluation de la progression et de la dynamique de travail",
  "message_motivation": "Message d'encouragement personnalisé adressé directement au stagiaire"
}}"""

    try:
        client = anthropic.Anthropic(api_key=settings.ANTHROPIC_API_KEY)
        message = client.messages.create(
            model="claude-haiku-4-5-20251001",
            max_tokens=2000,
            system="Tu es un responsable de stage. Tu réponds uniquement en JSON brut valide, sans markdown ni explication.",
            messages=[{"role": "user", "content": prompt}],
        )
        result = extract_json(message.content[0].text)
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Erreur génération feedback: {str(e)}")

    return {
        "intern_name": intern.name,
        "intern_email": intern.email,
        "stats": stats,
        "feedback": result,
        "generated_at": now.strftime("%d/%m/%Y à %H:%M"),
    }
