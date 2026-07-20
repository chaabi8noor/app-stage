from pydantic import BaseModel
from datetime import datetime
from app.schemas.user import UserOut

class CommentCreate(BaseModel):
    content: str

class CommentOut(BaseModel):
    id: int
    content: str
    created_at: datetime
    author: UserOut

    model_config = {"from_attributes": True}

class ActivityOut(BaseModel):
    id: int
    action: str
    created_at: datetime
    user: UserOut

    model_config = {"from_attributes": True}
