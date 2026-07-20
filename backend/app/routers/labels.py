from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List
from pydantic import BaseModel
from app.core.database import get_db
from app.models.label import Label
from app.models.user import User
from app.schemas.task import LabelOut
from app.routers.auth import get_current_user, require_admin

router = APIRouter(prefix="/projects/{project_id}/labels", tags=["labels"])

class LabelCreate(BaseModel):
    name: str
    color: str = "#6366f1"

@router.get("/", response_model=List[LabelOut])
def list_labels(project_id: int, db: Session = Depends(get_db), _: User = Depends(get_current_user)):
    return db.query(Label).filter(Label.project_id == project_id).all()

@router.post("/", response_model=LabelOut)
def create_label(project_id: int, data: LabelCreate, db: Session = Depends(get_db), _: User = Depends(require_admin)):
    label = Label(name=data.name, color=data.color, project_id=project_id)
    db.add(label)
    db.commit()
    db.refresh(label)
    return label

@router.delete("/{label_id}")
def delete_label(project_id: int, label_id: int, db: Session = Depends(get_db), _: User = Depends(require_admin)):
    label = db.query(Label).filter(Label.id == label_id, Label.project_id == project_id).first()
    if label:
        db.delete(label)
        db.commit()
    return {"ok": True}
