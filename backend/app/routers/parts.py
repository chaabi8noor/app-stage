from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List, Optional
from app.core.database import get_db
from app.models.part import Part
from app.models.part_instance import PartInstance
from app.models.task import Task
from app.models.user import User
from app.schemas.part import PartCreate, PartUpdate, PartOut, PartInstanceOut
from app.schemas.task import TaskCreate, TaskOut
from app.routers.auth import get_current_user, require_admin
from app.services.part_assignments import create_individual_part_task, ensure_part_instances
from app.schemas.part import PartOut
router = APIRouter(prefix="/projects/{project_id}/parts", tags=["parts"])


def _sync_interns(db: Session, part: Part, intern_ids: List[int]):
    if intern_ids:
        interns = db.query(User).filter(User.id.in_(intern_ids)).all()
        part.interns = interns
        if interns:
            part.assignee_id = interns[0].id
    else:
        part.interns = []




@router.get("/", response_model=List[PartOut])
def list_parts(project_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    query = db.query(Part).filter(Part.project_id == project_id)
    if current_user.role == "intern":
        from sqlalchemy import or_
        from app.models.part import part_interns
        assigned_part_ids = [
            row[0] for row in db.execute(
                part_interns.select().where(part_interns.c.user_id == current_user.id)
            ).fetchall()
        ]
        query = query.filter(
            or_(Part.assignee_id == current_user.id, Part.id.in_(assigned_part_ids))
        )
        parts = query.all()

        results = []
        for part in parts:
            part_out = PartOut.model_validate(part)  # snapshot, decoupled from ORM object
            if part.assignment_mode == "individual":
                instance = db.query(PartInstance).filter(
                    PartInstance.part_id == part.id,
                    PartInstance.intern_id == current_user.id
                ).first()
                visible_tasks = (
                    db.query(Task).filter(Task.instance_id == instance.id).all()
                    if instance else []
                )
                part_out.tasks = [TaskOut.model_validate(t) for t in visible_tasks]
            results.append(part_out)
        return results

    return query.all()

@router.post("/", response_model=PartOut)
def create_part(project_id: int, data: PartCreate, db: Session = Depends(get_db), _: User = Depends(require_admin)):
    print(f"[create_part] assignment_mode={data.assignment_mode} intern_ids={data.intern_ids}")
    part = Part(
        name=data.name,
        description=data.description,
        assignee_id=data.assignee_id,
        assignment_mode=data.assignment_mode,
        project_id=project_id,
    )
    db.add(part)
    db.flush()
    _sync_interns(db, part, data.intern_ids)
    db.flush()
    # All intern IDs that should have instances
    intern_ids_for_instances = list(dict.fromkeys(data.intern_ids or ([data.assignee_id] if data.assignee_id else [])))
    if data.assignment_mode == "individual" and intern_ids_for_instances:
        ensure_part_instances(db, part.id, intern_ids_for_instances)
    db.commit()
    db.refresh(part)
    return part


@router.put("/{part_id}", response_model=PartOut)
def update_part(project_id: int, part_id: int, data: PartUpdate, db: Session = Depends(get_db), _: User = Depends(require_admin)):
    part = db.query(Part).filter(Part.id == part_id, Part.project_id == project_id).first()
    if not part:
        raise HTTPException(status_code=404, detail="Part not found")
    print(f"[update_part] received assignment_mode={data.assignment_mode} intern_ids={data.intern_ids}")

    if data.assignment_mode is not None:
        part.assignment_mode = data.assignment_mode
    for k, v in data.model_dump(exclude_unset=True, exclude={"intern_ids", "assignment_mode"}).items():
        setattr(part, k, v)

    # Collect intern IDs before syncing (explicit list, no lazy loading)
    if data.intern_ids is not None:
        _sync_interns(db, part, data.intern_ids)
        intern_ids_for_instances = list(set(data.intern_ids))
    else:
        # Get current interns from DB directly (no lazy load)
        from app.models.part import part_interns as pj
        intern_ids_for_instances = [
            row[1] for row in db.execute(pj.select().where(pj.c.part_id == part_id)).fetchall()
        ]
        if part.assignee_id and part.assignee_id not in intern_ids_for_instances:
            intern_ids_for_instances.append(part.assignee_id)

    db.flush()

    new_mode = part.assignment_mode
    print(f"[update_part] new_mode={new_mode} intern_ids_for_instances={intern_ids_for_instances}")
    if new_mode == "individual" and intern_ids_for_instances:
        ensure_part_instances(db, part_id, intern_ids_for_instances)

    db.commit()
    db.refresh(part)
    return part


@router.delete("/{part_id}")
def delete_part(project_id: int, part_id: int, db: Session = Depends(get_db), _: User = Depends(require_admin)):
    part = db.query(Part).filter(Part.id == part_id, Part.project_id == project_id).first()
    if part:
        db.delete(part)
        db.commit()
    return {"ok": True}


@router.get("/{part_id}/instances", response_model=List[PartInstanceOut])
def list_part_instances(project_id: int, part_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    part = db.query(Part).filter(Part.id == part_id, Part.project_id == project_id).first()
    if not part:
        raise HTTPException(status_code=404, detail="Part not found")
    if current_user.role == "intern":
        return db.query(PartInstance).filter(
            PartInstance.part_id == part_id, PartInstance.intern_id == current_user.id
        ).all()
    return db.query(PartInstance).filter(PartInstance.part_id == part_id).all()


@router.post("/{part_id}/tasks", response_model=TaskOut)
def add_task_to_part(project_id: int, part_id: int, data: TaskCreate, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    part = db.query(Part).filter(Part.id == part_id, Part.project_id == project_id).first()
    if not part:
        raise HTTPException(status_code=404, detail="Part not found")
    if current_user.role == "intern":
        intern_ids = [u.id for u in part.interns]
        if current_user.id not in intern_ids and part.assignee_id != current_user.id:
            raise HTTPException(status_code=403, detail="Cette partie ne vous est pas assignée")

    if part.assignment_mode == "individual" and current_user.role == "admin":
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
            assignee_id=part.assignee_id,
        )
        db.commit()
        db.refresh(template)
        return template

    task = Task(
        title=data.title, description=data.description, priority=data.priority,
        task_type=data.task_type, story_points=data.story_points,
        start_date=data.start_date, deadline=data.deadline,
        assignee_id=part.assignee_id, project_id=project_id,
        part_id=part_id, created_by_id=current_user.id,
    )
    db.add(task)
    db.commit()
    db.refresh(task)
    return task
