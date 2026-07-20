from typing import Iterable

from sqlalchemy.orm import Session

from app.models.part import Part
from app.models.part_instance import PartInstance
from app.models.subtask import Subtask
from app.models.task import Task


def _clone_task_for_instance(
    db: Session,
    template_task: Task,
    *,
    assignee_id: int | None,
    instance_id: int,
    created_by_id: int | None = None,
):
    clone = Task(
        title=template_task.title,
        description=template_task.description,
        status=template_task.status,
        priority=template_task.priority,
        task_type=template_task.task_type,
        story_points=template_task.story_points,
        start_date=template_task.start_date,
        deadline=template_task.deadline,
        project_id=template_task.project_id,
        part_id=template_task.part_id,
        assignee_id=assignee_id,
        created_by_id=created_by_id or template_task.created_by_id,
        instance_id=instance_id,
    )
    clone.labels = list(template_task.labels)
    db.add(clone)
    db.flush()

    for subtask in template_task.subtasks:
        db.add(Subtask(title=subtask.title, done=subtask.done, task_id=clone.id))

    return clone


def ensure_part_instances(db: Session, part_id: int, intern_ids: Iterable[int]):
    intern_ids = list(dict.fromkeys(uid for uid in intern_ids if uid is not None))
    if not intern_ids:
        return []

    template_tasks = db.query(Task).filter(
        Task.part_id == part_id,
        Task.instance_id.is_(None),
    ).all()

    created_instances = []
    for intern_id in intern_ids:
        existing = db.query(PartInstance).filter(
            PartInstance.part_id == part_id,
            PartInstance.intern_id == intern_id,
        ).first()
        if existing:
            continue

        instance = PartInstance(part_id=part_id, intern_id=intern_id)
        db.add(instance)
        db.flush()
        created_instances.append(instance)

        for template_task in template_tasks:
            _clone_task_for_instance(
                db,
                template_task,
                assignee_id=intern_id,
                instance_id=instance.id,
                created_by_id=template_task.created_by_id,
            )

    return created_instances


def create_individual_part_task(
    db: Session,
    part: Part,
    *,
    created_by_id: int,
    title: str,
    description: str | None,
    priority,
    task_type,
    story_points: int | None,
    start_date=None,
    deadline=None,
    subtasks: Iterable[str] | None = None,
    assignee_id: int | None = None,
):
    template = Task(
        title=title,
        description=description,
        priority=priority,
        task_type=task_type,
        story_points=story_points,
        start_date=start_date,
        deadline=deadline,
        project_id=part.project_id,
        part_id=part.id,
        assignee_id=assignee_id or part.assignee_id,
        created_by_id=created_by_id,
        instance_id=None,
    )
    db.add(template)
    db.flush()

    for subtask_title in subtasks or []:
        db.add(Subtask(title=subtask_title, task_id=template.id))

    instances = db.query(PartInstance).filter(PartInstance.part_id == part.id).all()
    for instance in instances:
        _clone_task_for_instance(
            db,
            template,
            assignee_id=instance.intern_id,
            instance_id=instance.id,
            created_by_id=created_by_id,
        )

    return template