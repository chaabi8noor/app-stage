from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime
from app.schemas.user import UserOut
from app.schemas.task import TaskOut

class PartCreate(BaseModel):
    name: str
    description: Optional[str] = None
    assignee_id: Optional[int] = None
    intern_ids: List[int] = []
    assignment_mode: str = "collaborative"

class PartUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    assignee_id: Optional[int] = None
    intern_ids: Optional[List[int]] = None
    assignment_mode: Optional[str] = None

class PartOut(BaseModel):
    id: int
    name: str
    description: Optional[str]
    cdc_text: Optional[str] = None
    cdc_filename: Optional[str] = None
    assignment_mode: str = "collaborative"
    project_id: int
    assignee: Optional[UserOut]
    interns: List[UserOut] = []
    tasks: List[TaskOut] = []

    model_config = {"from_attributes": True}

class PartInstanceOut(BaseModel):
    id: int
    part_id: int
    intern_id: int
    created_at: datetime
    intern: UserOut
    tasks: List[TaskOut] = []

    model_config = {"from_attributes": True}
