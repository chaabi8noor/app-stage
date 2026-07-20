from fastapi import APIRouter, Depends, HTTPException, Form
from sqlalchemy.orm import Session
from typing import List
from app.core.database import get_db
from app.models.project import Project, ProjectMember
from app.models.part import Part, part_interns
from app.models.task import Task, TaskStatus
from app.models.label import Label
from app.models.subtask import Subtask
from app.models.resource import ProjectResource
from app.models.user import User
from app.schemas.project import ProjectCreate, ProjectUpdate, ProjectOut, PartSummary, ProjectDuplicate
from app.models.audit import AuditLog
from app.routers.auth import get_current_user, require_admin

router = APIRouter(prefix="/projects", tags=["projects"])

def enrich_project(project: Project, db: Session) -> dict:
    parts = db.query(Part).filter(Part.project_id == project.id).all()
    part_summaries = []
    for part in parts:
        tasks = db.query(Task).filter(Task.part_id == part.id).all()
        done = sum(1 for t in tasks if t.status == TaskStatus.done)
        part_summaries.append(PartSummary(
            id=part.id,
            name=part.name,
            assignee=part.assignee,
            task_count=len(tasks),
            done_count=done,
        ))
    data = _clone_columns(project, {"created_by_id"})
    data["created_by"] = project.created_by
    data["parts"] = part_summaries
    return data


def _clone_columns(source , exclude :set) -> dict:
    """Copy all scalar columns from source to a dict, excluding those in exclude"""
    return {c.name: getattr(source, c.name) for c in source.__table__.columns if c.name not in exclude}


@router.get("/", response_model=List[ProjectOut])
def list_projects(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    if current_user.role == "admin":
        projects = db.query(Project).all()
    else:
        memberships = db.query(ProjectMember).filter(ProjectMember.user_id == current_user.id).all()
        project_ids = [m.project_id for m in memberships]
        # include projects where intern is assigned via assignee_id OR part_interns junction
        by_assignee = [p.project_id for p in db.query(Part).filter(Part.assignee_id == current_user.id).all()]
        junction_part_ids = [
            row[0] for row in db.execute(
                part_interns.select().where(part_interns.c.user_id == current_user.id)
            ).fetchall()
        ]
        by_junction = [
            p.project_id for p in db.query(Part).filter(Part.id.in_(junction_part_ids)).all()
        ] if junction_part_ids else []
        part_project_ids = list(set(by_assignee + by_junction))
        all_ids = list(set(project_ids + part_project_ids))
        projects = db.query(Project).filter(Project.id.in_(all_ids)).all()
    return [ProjectOut.model_validate(enrich_project(p, db)) for p in projects]
@router.post("/{project_id}/duplicate", response_model=ProjectOut)
def duplicate_project(
    project_id: int,
    data: ProjectDuplicate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    original = db.query(Project).filter(Project.id == project_id).first()
    if not original:
        raise HTTPException(status_code=404, detail="Project not found")

    # ── 1. Clone the project itself ──
    project_data = _clone_columns(
        original,
        exclude={"id", "created_at", "created_by_id"},
    )
    project_data["name"] = data.name
    new_project = Project(**project_data, created_by_id=current_user.id)
    db.add(new_project)
    db.flush()  # get new_project.id

    # ── 2. Clone labels first, keep old_id → new_label map ──
    labels = db.query(Label).filter(Label.project_id == project_id).all()
    label_map = {}
    for label in labels:
        label_data = _clone_columns(label, exclude={"id", "project_id"})
        new_label = Label(**label_data, project_id=new_project.id)
        db.add(new_label)
        db.flush()
        label_map[label.id] = new_label

    # ── 3. Clone parts + their tasks (+ subtasks + labels) ──
    parts = db.query(Part).filter(Part.project_id == project_id).all()
    for part in parts:
        part_data = _clone_columns(
            part,
            exclude={"id", "project_id", "assignee_id"},
        )
        new_part = Part(**part_data, project_id=new_project.id, assignee_id=None)
        db.add(new_part)
        db.flush()  # get new_part.id
        # interns intentionally left empty — assign the new group manually

        tasks_to_clone = [task for task in part.tasks if task.instance_id is None] if part.assignment_mode == "individual" else list(part.tasks)
        for task in tasks_to_clone:
            _clone_task(db, task, new_project.id, new_part.id, current_user.id, label_map)

    # ── 4. Clone unassigned tasks (part_id is null, still belong to project) ──
    unassigned_tasks = db.query(Task).filter(
        Task.project_id == project_id, Task.part_id.is_(None)
    ).all()
    for task in unassigned_tasks:
        _clone_task(db, task, new_project.id, None, current_user.id, label_map)

    # ── 5. Clone resources (files, links, notes) ──
    resources = db.query(ProjectResource).filter(ProjectResource.project_id == project_id).all()
    for res in resources:
        res_data = _clone_columns(
            res,
            exclude={"id", "project_id", "created_at", "uploaded_by_id"},
        )
        db.add(ProjectResource(
            **res_data,
            project_id=new_project.id,
            uploaded_by_id=current_user.id,
        ))

    db.add(AuditLog(
        action="project_duplicated",
        entity_type="project",
        entity_name=new_project.name,
        user_id=current_user.id,
        user_name=current_user.name,
    ))
    db.commit()
    db.refresh(new_project)
    return ProjectOut.model_validate(enrich_project(new_project, db))


def _clone_task(db: Session, task: Task, new_project_id: int, new_part_id, created_by_id: int, label_map: dict):
    task_data = _clone_columns(
        task,
        exclude={"id", "status", "project_id", "part_id", "assignee_id", "created_by_id", "created_at"},
    )
    new_task = Task(
        **task_data,
        status=TaskStatus.todo,
        project_id=new_project_id,
        part_id=new_part_id,
        assignee_id=None,
        created_by_id=created_by_id,
    )
    # Labels: point to the cloned labels for this new project, not the originals
    new_task.labels = [label_map[l.id] for l in task.labels if l.id in label_map]
    db.add(new_task)
    db.flush()

    # Subtasks: copy title, reset done to False
    for sub in task.subtasks:
        db.add(Subtask(title=sub.title, done=False, task_id=new_task.id))
@router.post("/", response_model=ProjectOut)
def create_project(data: ProjectCreate, db: Session = Depends(get_db), current_user: User = Depends(require_admin)):
    project = Project(**data.model_dump(), created_by_id=current_user.id)
    db.add(project)
    db.flush()  # get project.id without committing yet
    db.add(AuditLog(action="project_created", entity_type="project", entity_name=project.name, user_id=current_user.id, user_name=current_user.name))
    db.commit()
    db.refresh(project)
    return ProjectOut.model_validate(enrich_project(project, db))

@router.get("/{project_id}", response_model=ProjectOut)
def get_project(project_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    project = db.query(Project).filter(Project.id == project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    # Interns may only view projects they belong to
    if current_user.role != "admin":
        is_member = db.query(ProjectMember).filter_by(project_id=project_id, user_id=current_user.id).first()
        has_part = db.query(Part).filter(
            Part.project_id == project_id,
            Part.assignee_id == current_user.id
        ).first()
        junction_rows = db.execute(
            part_interns.select().where(part_interns.c.user_id == current_user.id)
        ).fetchall()
        part_ids = [r[0] for r in junction_rows]
        has_junction = db.query(Part).filter(
            Part.project_id == project_id, Part.id.in_(part_ids)
        ).first() if part_ids else None
        if not (is_member or has_part or has_junction):
            raise HTTPException(status_code=403, detail="Accès non autorisé")
    return ProjectOut.model_validate(enrich_project(project, db))

@router.get("{project_id}/stack-note",response_model=str)
def get_stack_note(project_id : int , db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    project = db.query(Project).filter(Project.id == project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    # Interns may only view projects they belong to
    if current_user.role != "admin":
        is_member = db.query(ProjectMember).filter_by(project_id=project_id, user_id=current_user.id).first()
        has_part = db.query(Part).filter(
            Part.project_id == project_id,
            Part.assignee_id == current_user.id
        ).first()
        junction_rows = db.execute(
            part_interns.select().where(part_interns.c.user_id == current_user.id)
        ).fetchall()
        part_ids = [r[0] for r in junction_rows]
        has_junction = db.query(Part).filter(
            Part.project_id == project_id, Part.id.in_(part_ids)
        ).first() if part_ids else None
        if not (is_member or has_part or has_junction):
            raise HTTPException(status_code=403, detail="Accès non autorisé")
    return project.stack_note

@router.put("/{project_id}/stack-note")
def update_stack_note(
    project_id : int,
    manual_stack_note : str = Form(...),
    db: Session = Depends(get_db),
    _ : User = Depends(require_admin)
):
    project = db.query(Project).filter(Project.id == project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    project.stack_note = manual_stack_note
    db.commit()
    return {"ok": True}

@router.put("/{project_id}", response_model=ProjectOut)
def update_project(project_id: int, data: ProjectUpdate, db: Session = Depends(get_db), _: User = Depends(require_admin)):
    project = db.query(Project).filter(Project.id == project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    for k, v in data.model_dump(exclude_unset=True).items():
        setattr(project, k, v)
    db.commit()
    db.refresh(project)
    return ProjectOut.model_validate(enrich_project(project, db))

@router.delete("/{project_id}")
def delete_project(project_id: int, db: Session = Depends(get_db), current_user: User = Depends(require_admin)):
    project = db.query(Project).filter(Project.id == project_id).first()
    if project:
        db.add(AuditLog(action="project_deleted", entity_type="project", entity_name=project.name, user_id=current_user.id, user_name=current_user.name))
        db.delete(project)
        db.commit()
    return {"ok": True}

@router.post("/{project_id}/members/{user_id}")
def add_member(project_id: int, user_id: int, db: Session = Depends(get_db), _: User = Depends(require_admin)):
    existing = db.query(ProjectMember).filter_by(project_id=project_id, user_id=user_id).first()
    if not existing:
        db.add(ProjectMember(project_id=project_id, user_id=user_id))
        db.commit()
    return {"ok": True}

@router.delete("/{project_id}/members/{user_id}")
def remove_member(project_id: int, user_id: int, db: Session = Depends(get_db), _: User = Depends(require_admin)):
    db.query(ProjectMember).filter_by(project_id=project_id, user_id=user_id).delete()
    db.commit()
    return {"ok": True}
