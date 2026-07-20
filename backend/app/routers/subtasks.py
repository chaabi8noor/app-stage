from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List
from pydantic import BaseModel
from app.core.database import get_db
from app.models.subtask import Subtask
from app.models.user import User
from app.schemas.task import SubtaskOut
from app.routers.auth import get_current_user

router = APIRouter(prefix="/tasks/{task_id}/subtasks", tags=["subtasks"])

class SubtaskCreate(BaseModel):
    title: str

class SubtaskUpdate(BaseModel):
    done: bool

@router.post("/", response_model=SubtaskOut)
def create_subtask(task_id: int, data: SubtaskCreate, db: Session = Depends(get_db), _: User = Depends(get_current_user)):
    s = Subtask(title=data.title, task_id=task_id)
    db.add(s)
    db.commit()
    db.refresh(s)
    return s

@router.put("/{subtask_id}", response_model=SubtaskOut)
def toggle_subtask(task_id: int, subtask_id: int, data: SubtaskUpdate, db: Session = Depends(get_db), _: User = Depends(get_current_user)):
    s = db.query(Subtask).filter(Subtask.id == subtask_id, Subtask.task_id == task_id).first()
    if not s:
        raise HTTPException(status_code=404, detail="Subtask not found")
    s.done = data.done
    db.commit()
    db.refresh(s)
    return s

@router.delete("/{subtask_id}")
def delete_subtask(task_id: int, subtask_id: int, db: Session = Depends(get_db), _: User = Depends(get_current_user)):
    s = db.query(Subtask).filter(Subtask.id == subtask_id, Subtask.task_id == task_id).first()
    if s:
        db.delete(s)
        db.commit()
    return {"ok": True}
