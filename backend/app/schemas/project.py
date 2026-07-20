from pydantic import BaseModel
from datetime import datetime
from typing import Optional, List
from app.schemas.user import UserOut

class ProjectCreate(BaseModel):
    name: str
    description: Optional[str] = None
    github_url: Optional[str] = None
    start_date: Optional[datetime] = None
    deadline: Optional[datetime] = None

class ProjectUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    github_url: Optional[str] = None
    start_date: Optional[datetime] = None
    deadline: Optional[datetime] = None


class ProjectDuplicate(BaseModel):
    name: str
class PartSummary(BaseModel):
    id: int
    name: str
    assignee: Optional[UserOut]
    task_count: int = 0
    done_count: int = 0

    model_config = {"from_attributes": True}

class ProjectOut(BaseModel):
    id: int
    name: str
    description: Optional[str]
    github_url: Optional[str]
    start_date: Optional[datetime]
    deadline: Optional[datetime]
    created_at: datetime
    created_by: Optional[UserOut]
    parts: List[PartSummary] = []
    architecture: Optional[str] = None
    tech_stack: Optional[str] = None
    architecture_notes: Optional[str] = None

    model_config = {"from_attributes": True}
