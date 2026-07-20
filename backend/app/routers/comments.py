from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List
from app.core.database import get_db
from app.models.comment import Comment
from app.models.activity import Activity
from app.models.task import Task
from app.models.user import User
from app.schemas.comment import CommentCreate, CommentOut, ActivityOut
from app.routers.auth import get_current_user

router = APIRouter(prefix="/tasks/{task_id}", tags=["comments"])

def get_task_or_404(task_id: int, db: Session) -> Task:
    task = db.query(Task).filter(Task.id == task_id).first()
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    return task

@router.get("/comments", response_model=List[CommentOut])
def list_comments(task_id: int, db: Session = Depends(get_db), _: User = Depends(get_current_user)):
    get_task_or_404(task_id, db)
    return db.query(Comment).filter(Comment.task_id == task_id).order_by(Comment.created_at).all()

@router.post("/comments", response_model=CommentOut)
def add_comment(task_id: int, data: CommentCreate, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    get_task_or_404(task_id, db)
    comment = Comment(content=data.content, task_id=task_id, author_id=current_user.id)
    db.add(comment)
    db.add(Activity(action=f"commented: \"{data.content[:60]}\"", task_id=task_id, user_id=current_user.id))
    db.commit()
    db.refresh(comment)
    return comment

@router.delete("/comments/{comment_id}")
def delete_comment(task_id: int, comment_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    comment = db.query(Comment).filter(Comment.id == comment_id, Comment.task_id == task_id).first()
    if not comment:
        raise HTTPException(status_code=404, detail="Comment not found")
    if comment.author_id != current_user.id and current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Not allowed")
    db.delete(comment)
    db.commit()
    return {"ok": True}

@router.get("/activity", response_model=List[ActivityOut])
def get_activity(task_id: int, db: Session = Depends(get_db), _: User = Depends(get_current_user)):
    get_task_or_404(task_id, db)
    return db.query(Activity).filter(Activity.task_id == task_id).order_by(Activity.created_at.desc()).all()
