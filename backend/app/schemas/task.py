from pydantic import BaseModel
from datetime import datetime
from typing import Optional, List
from app.models.task import TaskStatus, TaskPriority, TaskType
from app.schemas.user import UserOut

class LabelOut(BaseModel):
    id: int
    name: str
    color: str
    model_config = {"from_attributes": True}

class SubtaskOut(BaseModel):
    id: int
    title: str
    done: bool
    model_config = {"from_attributes": True}

class TaskCreate(BaseModel):
    title: str
    description: Optional[str] = None
    priority: TaskPriority = TaskPriority.medium
    task_type: TaskType = TaskType.task
    story_points: Optional[int] = None
    start_date: Optional[datetime] = None
    deadline: Optional[datetime] = None
    assignee_id: Optional[int] = None
    project_id: int
    part_id: Optional[int] = None

class TaskUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    status: Optional[TaskStatus] = None
    priority: Optional[TaskPriority] = None
    task_type: Optional[TaskType] = None
    story_points: Optional[int] = None
    start_date: Optional[datetime] = None
    deadline: Optional[datetime] = None
    assignee_id: Optional[int] = None
    part_id: Optional[int] = None
    label_ids: Optional[List[int]] = None

class TaskOut(BaseModel):
    id: int
    title: str
    description: Optional[str]
    status: TaskStatus
    priority: TaskPriority
    task_type: TaskType
    story_points: Optional[int]
    start_date: Optional[datetime]
    deadline: Optional[datetime]
    created_at: datetime
    project_id: int
    part_id: Optional[int]
    instance_id: Optional[int] = None
    assignee_id: Optional[int]
    assignee: Optional[UserOut]
    assignees: List[UserOut] = []
    created_by: Optional[UserOut]
    labels: List[LabelOut] = []
    subtasks: List[SubtaskOut] = []

    model_config = {"from_attributes": True}
