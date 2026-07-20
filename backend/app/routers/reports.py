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
from typing import Optional, List
from datetime import datetime, timedelta
from pydantic import BaseModel
from app.core.database import get_db
from app.core.config import settings
from app.models.task import Task, TaskStatus
from app.models.part import Part
from app.models.project import Project
from app.models.user import User
from app.routers.auth import get_current_user, require_admin

router = APIRouter(prefix="/reports", tags=["reports"])

class InternReport(BaseModel):
    intern_name: str
    part_name: str
    project_name: str
    completed_this_week: int
    in_progress: int
    overdue: int
    todo: int
    summary: str
    blockers: str

class WeeklyReport(BaseModel):
    week_label: str
    project_name: str
    interns: List[InternReport]
    global_summary: str

@router.get("/weekly")
def generate_weekly_report(
    project_id: Optional[int] = None,
    db: Session = Depends(get_db),
    _: User = Depends(require_admin),
):
    if not settings.ANTHROPIC_API_KEY:
        raise HTTPException(status_code=400, detail="Clé API Anthropic non configurée")

    now = datetime.utcnow()
    week_start = now - timedelta(days=7)

    query = db.query(Task)
    if project_id:
        query = query.filter(Task.project_id == project_id)
    tasks = query.all()

    if not tasks:
        raise HTTPException(status_code=404, detail="Aucune tâche trouvée")

    # Group tasks by intern (deduped by assignee_id across all parts)
    intern_groups = {}  # assignee_id -> {intern, parts, tasks}
    for task in tasks:
        if not task.part_id:
            continue
        part = db.query(Part).filter(Part.id == task.part_id).first()
        if not part:
            continue
        intern_id = part.assignee_id or 0
        intern_name = part.assignee.name if part.assignee else "Non assigné"
        if intern_id not in intern_groups:
            intern_groups[intern_id] = {"intern": intern_name, "parts": set(), "tasks": []}
        intern_groups[intern_id]["parts"].add(part.name)
        intern_groups[intern_id]["tasks"].append(task)

    # Build data for Claude
    intern_data = []
    for intern_id, group in intern_groups.items():
        group_tasks = group["tasks"]
        project = db.query(Project).filter(Project.id == group_tasks[0].project_id).first()
        completed_week = [t for t in group_tasks if t.status == TaskStatus.done and t.created_at >= week_start]
        in_progress = [t for t in group_tasks if t.status == TaskStatus.in_progress]
        overdue = [t for t in group_tasks if t.deadline and t.deadline < now and t.status != TaskStatus.done]
        todo = [t for t in group_tasks if t.status == TaskStatus.todo]

        intern_data.append({
            "intern": group["intern"],
            "part": ", ".join(sorted(group["parts"])),
            "project": project.name if project else "Inconnu",
            "completed_this_week": [t.title for t in completed_week],
            "in_progress": [t.title for t in in_progress],
            "overdue": [t.title for t in overdue],
            "todo_count": len(todo),
        })

    prompt = f"""Tu es un chef de projet. Génère un rapport hebdomadaire en français pour la semaine du {week_start.strftime('%d %B %Y')}.

Données des stagiaires:
{json.dumps(intern_data, ensure_ascii=False, indent=2)}

Pour chaque stagiaire, génère:
- Un résumé de 2-3 phrases de son avancement
- Les blockers détectés (tâches en retard ou en cours depuis trop longtemps)
- Un résumé global du projet

Réponds en JSON brut:
{{
  "global_summary": "Résumé global du projet en 2-3 phrases",
  "interns": [
    {{
      "intern_name": "...",
      "part_name": "...",
      "project_name": "...",
      "completed_this_week": 3,
      "in_progress": 2,
      "overdue": 1,
      "todo": 5,
      "summary": "Résumé de 2-3 phrases",
      "blockers": "Description des blockers ou 'Aucun blocker détecté'"
    }}
  ]
}}"""

    try:
        client = anthropic.Anthropic(api_key=settings.ANTHROPIC_API_KEY)
        message = client.messages.create(
            model="claude-haiku-4-5-20251001",
            max_tokens=3000,
            system="Tu es un chef de projet. Tu réponds uniquement en JSON brut valide, sans markdown.",
            messages=[{"role": "user", "content": prompt}],
        )
        result = extract_json(message.content[0].text)
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Erreur génération rapport: {str(e)}")

    project_name = "Tous les projets"
    if project_id:
        p = db.query(Project).filter(Project.id == project_id).first()
        if p:
            project_name = p.name

    return {
        "week_label": f"Semaine du {week_start.strftime('%d %B %Y')} au {now.strftime('%d %B %Y')}",
        "project_name": project_name,
        "global_summary": result.get("global_summary", ""),
        "interns": result.get("interns", []),
    }
