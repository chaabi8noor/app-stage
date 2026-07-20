from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from app.core.database import get_db
from app.models.user import User
from app.schemas.user import UserOut
from app.routers.auth import get_current_user, require_admin
from typing import List, Optional
from pydantic import BaseModel, EmailStr

class UserUpdate(BaseModel):
    name: Optional[str] = None
    email: Optional[EmailStr] = None

router = APIRouter(prefix="/users", tags=["users"])

@router.get("/me", response_model=UserOut)
def me(current_user: User = Depends(get_current_user)):
    return current_user

@router.get("/", response_model=List[UserOut])
def list_users(db: Session = Depends(get_db), _: User = Depends(require_admin)):
    return db.query(User).all()

@router.put("/{user_id}", response_model=UserOut)
def update_user(user_id: int, data: UserUpdate, db: Session = Depends(get_db), _: User = Depends(require_admin)):
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="Utilisateur introuvable")
    if data.name is not None:
        user.name = data.name.strip()
    if data.email is not None:
        new_email = data.email.strip().lower()
        existing = db.query(User).filter(User.email == new_email, User.id != user_id).first()
        if existing:
            raise HTTPException(status_code=400, detail="Cet email est déjà utilisé")
        user.email = new_email
    db.commit()
    db.refresh(user)
    return user

@router.delete("/{user_id}")
def delete_user(user_id: int, db: Session = Depends(get_db), _: User = Depends(require_admin)):
    from sqlalchemy import text
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        return {"ok": True}
    # Nullify FK references so PostgreSQL doesn't block the delete
    db.execute(text("UPDATE tasks SET assignee_id = NULL WHERE assignee_id = :uid"), {"uid": user_id})
    db.execute(text("UPDATE tasks SET created_by_id = NULL WHERE created_by_id = :uid"), {"uid": user_id})
    db.execute(text("UPDATE parts SET assignee_id = NULL WHERE assignee_id = :uid"), {"uid": user_id})
    db.execute(text("DELETE FROM part_interns WHERE user_id = :uid"), {"uid": user_id})
    db.execute(text("UPDATE audit_logs SET user_id = NULL WHERE user_id = :uid"), {"uid": user_id})
    # notifications.user_id has ON DELETE CASCADE — rows auto-deleted by PostgreSQL
    db.execute(text("UPDATE project_resources SET uploaded_by_id = NULL WHERE uploaded_by_id = :uid"), {"uid": user_id})
    db.flush()
    db.delete(user)
    db.commit()
    return {"ok": True}
