from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session
from typing import List, Optional
from app.core.database import get_db
from sqlalchemy import or_
from app.models.task import Task, task_assignees
from app.models.part import Part, part_interns
from app.models.part_instance import PartInstance
from app.models.label import Label
from app.models.activity import Activity
from app.models.audit import AuditLog
from app.models.user import User
from app.schemas.task import TaskCreate, TaskUpdate, TaskOut
from app.routers.auth import get_current_user, require_admin
from app.routers.notifications import create_notification
from app.services.part_assignments import create_individual_part_task

router = APIRouter(prefix="/tasks", tags=["tasks"])

def get_intern_part_ids(db: Session, user_id: int) -> list:
    """Return all part IDs this intern is assigned to (via assignee_id OR part_interns table)."""
    by_assignee = [p.id for p in db.query(Part).filter(Part.assignee_id == user_id).all()]
    by_junction = [
        row[0] for row in
        db.execute(part_interns.select().where(part_interns.c.user_id == user_id)).fetchall()
    ]
    return list(set(by_assignee + by_junction))

@router.get("/")
def list_tasks(
    project_id: Optional[int] = None,
    page: Optional[int] = None,
    page_size: Optional[int] = None,
    status: Optional[str] = None,
    priority: Optional[str] = None,
    task_type: Optional[str] = None,
    assignee_id: Optional[int] = None,
    part_id: Optional[int] = None,
    search: Optional[str] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    query = db.query(Task)
    if current_user.role == "intern":
        from sqlalchemy import and_
        intern_part_ids = get_intern_part_ids(db, current_user.id)
        individual_part_ids = []
        collaborative_part_ids = []
        for pid in intern_part_ids:
            p = db.query(Part).filter(Part.id == pid).first()
            if p and p.assignment_mode == "individual":
                individual_part_ids.append(pid)
            else:
                collaborative_part_ids.append(pid)
        my_instance_ids = [
            inst.id for inst in db.query(PartInstance).filter(
                PartInstance.part_id.in_(individual_part_ids),
                PartInstance.intern_id == current_user.id
            ).all()
        ] if individual_part_ids else []

        conditions = []

        # 1. Tasks directly assigned, but NOT template tasks (instance_id=NULL) of individual parts
        if individual_part_ids:
            conditions.append(and_(
                Task.assignee_id == current_user.id,
                Task.part_id.notin_(individual_part_ids)
            ))
        else:
            conditions.append(Task.assignee_id == current_user.id)

        # 2. Collaborative part tasks
        if collaborative_part_ids:
            conditions.append(Task.part_id.in_(collaborative_part_ids))

        # 3. Individual mode: ONLY own instance tasks (excludes template instance_id=NULL automatically)
        if my_instance_ids:
            conditions.append(Task.instance_id.in_(my_instance_ids))

        query = query.filter(or_(*conditions))
    if project_id:
        query = query.filter(Task.project_id == project_id)
    if status:
        query = query.filter(Task.status == status)
    if priority:
        query = query.filter(Task.priority == priority)
    if task_type:
        query = query.filter(Task.task_type == task_type)
    if assignee_id:
        query = query.filter(Task.assignee_id == assignee_id)
    if part_id:
        query = query.filter(Task.part_id == part_id)
    if search:
        query = query.filter(Task.title.ilike(f"%{search}%"))

    def _serialize(t):
        return TaskOut.model_validate(t).model_dump(mode="json")

    if page is not None and page_size is not None and page_size > 0:
        from math import ceil
        total = query.count()
        tasks = query.offset((page - 1) * page_size).limit(page_size).all()
        return {
            "items": [_serialize(t) for t in tasks],
            "page": page,
            "page_size": page_size,
            "total": total,
            "pages": ceil(total / page_size),
        }
    return [_serialize(t) for t in query.all()]

@router.post("/", response_model=TaskOut)
def create_task(data: TaskCreate, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    part = None
    if data.part_id:
        part = db.query(Part).filter(Part.id == data.part_id).first()
        if not part:
            raise HTTPException(status_code=404, detail="Partie introuvable")

    if current_user.role == "intern":
        if not data.part_id:
            raise HTTPException(status_code=400, detail="Les stagiaires doivent spécifier une partie")
        allowed_part_ids = get_intern_part_ids(db, current_user.id)
        if data.part_id not in allowed_part_ids:
            raise HTTPException(status_code=403, detail="Cette partie ne vous est pas assignée")
        task_data = data.model_dump(exclude={"label_ids"})
        task_data["assignee_id"] = current_user.id
        task_data["project_id"] = part.project_id
        if part.assignment_mode == "individual":
            instance = db.query(PartInstance).filter(
                PartInstance.part_id == part.id,
                PartInstance.intern_id == current_user.id,
            ).first()
            if not instance:
                raise HTTPException(status_code=409, detail="Votre instance de partie n'existe pas encore")
            task_data["instance_id"] = instance.id
    else:
        if part and part.assignment_mode == "individual":
            template = create_individual_part_task(
                db,
                part,
                created_by_id=current_user.id,
                title=data.title,
                description=data.description,
                priority=data.priority,
                task_type=data.task_type,
                story_points=data.story_points,
                start_date=data.start_date,
                deadline=data.deadline,
                subtasks=[],
                assignee_id=data.assignee_id,
            )
            db.add(Activity(action="created this task", task_id=template.id, user_id=current_user.id))
            db.add(AuditLog(action="task_created", entity_type="task", entity_name=template.title, user_id=current_user.id, user_name=current_user.name))
            db.commit()
            db.refresh(template)
            return template
        task_data = data.model_dump(exclude={"label_ids"})
    task = Task(**task_data, created_by_id=current_user.id)
    db.add(task)
    db.flush()  # get task.id without committing yet
    db.add(Activity(action="created this task", task_id=task.id, user_id=current_user.id))
    db.add(AuditLog(action="task_created", entity_type="task", entity_name=task.title, user_id=current_user.id, user_name=current_user.name))
    db.commit()
    db.refresh(task)
    return task

@router.put("/{task_id}", response_model=TaskOut)
def update_task(task_id: int, data: TaskUpdate, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    task = db.query(Task).filter(Task.id == task_id).first()
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    if current_user.role == "intern":
        intern_part_ids = get_intern_part_ids(db, current_user.id)
        # Also allow if task belongs to intern's own instance (individual mode)
        my_instance = db.query(PartInstance).filter(
            PartInstance.part_id == task.part_id,
            PartInstance.intern_id == current_user.id
        ).first() if task.part_id else None
        task_belongs = (
            (task.assignee_id == current_user.id)
            or (task.part_id in intern_part_ids and task.instance_id is None)
            or (my_instance and task.instance_id == my_instance.id)
        )
        if not task_belongs:
            raise HTTPException(status_code=403, detail="Not your task")
        allowed = {"status"}
        if data.model_dump(exclude_unset=True).keys() - allowed:
            raise HTTPException(status_code=403, detail="Interns can only update status")
    updates = data.model_dump(exclude_unset=True)
    label_ids = updates.pop("label_ids", None)
    for k, v in updates.items():
        if k == "status" and getattr(task, "status") != v:
            db.add(Activity(action=f"changed status to {v.replace('_', ' ')}", task_id=task_id, user_id=current_user.id))
            if current_user.role == "intern":
                status_label = {"todo": "À faire", "in_progress": "En cours", "review": "En révision", "done": "Terminé"}.get(v, v)
                admins = db.query(User).filter(User.role == "admin").all()
                for admin in admins:
                    create_notification(db, user_id=admin.id, message=f"{current_user.name} a mis à jour « {task.title} » → {status_label}", task_id=task_id)
        elif k == "assignee_id" and v:
            db.add(Activity(action="reassigned task", task_id=task_id, user_id=current_user.id))
            if v != current_user.id:
                create_notification(db, user_id=v, message=f"Vous avez été assigné à la tâche : {task.title}", task_id=task_id)
        elif k == "part_id":
            db.add(Activity(action="moved to different part", task_id=task_id, user_id=current_user.id))
        setattr(task, k, v)
    if label_ids is not None:
        task.labels = db.query(Label).filter(Label.id.in_(label_ids)).all()
    db.commit()
    db.refresh(task)
    return task

def _get_part_member_ids(db: Session, part_id: int) -> list:
    rows = db.execute(part_interns.select().where(part_interns.c.part_id == part_id)).fetchall()
    ids = [row[1] for row in rows]
    part = db.query(Part).filter(Part.id == part_id).first()
    if part and part.assignee_id and part.assignee_id not in ids:
        ids.append(part.assignee_id)
    return ids

def _sync_primary_assignee(task: Task):
    """Keep assignee_id in sync: first in assignees list, or None."""
    task.assignee_id = task.assignees[0].id if task.assignees else None

class AssignRequest(BaseModel):
    user_id: int

@router.post("/{task_id}/assign", response_model=TaskOut)
def add_task_assignee(task_id: int, data: AssignRequest, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    task = db.query(Task).filter(Task.id == task_id).first()
    if not task:
        raise HTTPException(status_code=404, detail="Tâche introuvable")
    if not task.part_id:
        raise HTTPException(status_code=400, detail="Cette tâche n'appartient à aucune partie")
    if current_user.role != "admin":
        intern_part_ids = get_intern_part_ids(db, current_user.id)
        if task.part_id not in intern_part_ids:
            raise HTTPException(status_code=403, detail="Vous n'êtes pas membre de cette partie")
    part_member_ids = _get_part_member_ids(db, task.part_id)
    if data.user_id not in part_member_ids and current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Ce stagiaire n'est pas membre de cette partie")
    target = db.query(User).filter(User.id == data.user_id).first()
    if not target:
        raise HTTPException(status_code=404, detail="Utilisateur introuvable")
    if target not in task.assignees:
        task.assignees.append(target)
        _sync_primary_assignee(task)
        db.add(Activity(action=f"a assigné {target.name} à cette tâche", task_id=task.id, user_id=current_user.id))
        create_notification(db, user_id=data.user_id, message=f"Vous avez été assigné à la tâche : {task.title}", task_id=task.id)
    db.commit()
    db.refresh(task)
    return task

@router.delete("/{task_id}/assign/{user_id}", response_model=TaskOut)
def remove_task_assignee(task_id: int, user_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    task = db.query(Task).filter(Task.id == task_id).first()
    if not task:
        raise HTTPException(status_code=404, detail="Tâche introuvable")
    if current_user.role != "admin":
        intern_part_ids = get_intern_part_ids(db, current_user.id)
        if task.part_id not in intern_part_ids:
            raise HTTPException(status_code=403, detail="Vous n'êtes pas membre de cette partie")
    target = db.query(User).filter(User.id == user_id).first()
    if target and target in task.assignees:
        task.assignees.remove(target)
        _sync_primary_assignee(task)
        db.add(Activity(action=f"a retiré {target.name} de cette tâche", task_id=task.id, user_id=current_user.id))
    db.commit()
    db.refresh(task)
    return task

@router.delete("/{task_id}")
def delete_task(task_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    task = db.query(Task).filter(Task.id == task_id).first()
    if not task:
        raise HTTPException(status_code=404, detail="Tâche introuvable")
    if current_user.role == "intern" and task.created_by_id != current_user.id:
        raise HTTPException(status_code=403, detail="Vous ne pouvez supprimer que vos propres tâches")
    db.add(AuditLog(action="task_deleted", entity_type="task", entity_name=task.title, user_id=current_user.id, user_name=current_user.name))
    db.delete(task)
    db.commit()
    return {"ok": True}
