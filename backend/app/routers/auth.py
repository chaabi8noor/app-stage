from fastapi import APIRouter, Depends, HTTPException, Request, status
from fastapi.security import OAuth2PasswordBearer, OAuth2PasswordRequestForm
from sqlalchemy.orm import Session
from app.core.database import get_db
from app.core.security import verify_password, create_access_token, decode_token, hash_password
from app.models.user import User
from app.models.audit import AuditLog
from app.schemas.user import Token, UserOut, UserCreate
from jose import JWTError

router = APIRouter(prefix="/auth", tags=["auth"])
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/auth/login")

def get_current_user(token: str = Depends(oauth2_scheme), db: Session = Depends(get_db)) -> User:
    try:
        payload = decode_token(token)
        user_id = int(payload.get("sub"))
    except (JWTError, TypeError):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token")
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token")
    if not user.is_active:
        raise HTTPException(status_code=403, detail="Compte désactivé")
    return user

def require_admin(current_user: User = Depends(get_current_user)) -> User:
    if current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")
    return current_user

@router.post("/login", response_model=Token)
def login(request: Request, form: OAuth2PasswordRequestForm = Depends(), db: Session = Depends(get_db)):
    ip = request.client.host if request.client else None
    user = db.query(User).filter(User.email == form.username).first()

    # Always run bcrypt to prevent email enumeration via timing side-channel
    _dummy = "$2b$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/LeuYzKCRZqGXrZwm."
    password_ok = verify_password(form.password, user.hashed_password if user else _dummy)

    if not user or not password_ok:
        if user:
            db.add(AuditLog(action="login_failed", entity_type="auth", user_id=user.id, user_name=user.name, ip_address=ip))
            db.commit()
        raise HTTPException(status_code=401, detail="Identifiants invalides")

    if not user.is_active:
        raise HTTPException(status_code=403, detail="Compte désactivé")

    db.add(AuditLog(action="login", entity_type="auth", user_id=user.id, user_name=user.name, ip_address=ip))
    db.commit()

    token = create_access_token({"sub": str(user.id)})
    return {"access_token": token, "user": user}

@router.post("/logout")
def logout(session_duration: int = 0, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    db.add(AuditLog(
        action="logout",
        entity_type="auth",
        user_id=current_user.id,
        user_name=current_user.name,
        session_duration=session_duration if session_duration > 0 else None,
    ))
    db.commit()
    return {"ok": True}

@router.post("/register", response_model=UserOut)
def register(data: UserCreate, db: Session = Depends(get_db), current_user: User = Depends(require_admin)):
    if db.query(User).filter(User.email == data.email).first():
        raise HTTPException(status_code=400, detail="Email already registered")
    user = User(name=data.name, email=data.email, hashed_password=hash_password(data.password), role=data.role)
    db.add(user)
    db.commit()
    db.refresh(user)
    db.add(AuditLog(action="user_created", entity_type="user", entity_name=user.name, user_id=current_user.id, user_name=current_user.name))
    db.commit()
    return user
