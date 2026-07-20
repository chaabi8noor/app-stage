from fastapi import APIRouter, Depends, Request
from sqlalchemy.orm import Session
from typing import Optional
from app.core.database import get_db
from app.models.audit import AuditLog
from app.models.user import User
from app.routers.auth import require_admin

router = APIRouter(prefix="/audit", tags=["audit"])


def log_action(
    db: Session,
    action: str,
    user: User,
    entity_type: Optional[str] = None,
    entity_name: Optional[str] = None,
    ip_address: Optional[str] = None,
):
    entry = AuditLog(
        action=action,
        entity_type=entity_type,
        entity_name=entity_name,
        user_id=user.id,
        user_name=user.name,
        ip_address=ip_address,
    )
    db.add(entry)
    db.commit()


@router.get("/")
def get_audit_logs(
    page: int = 1,
    limit: int = 50,
    db: Session = Depends(get_db),
    _: User = Depends(require_admin),
):
    offset = (page - 1) * limit
    total = db.query(AuditLog).count()
    logs = (
        db.query(AuditLog)
        .order_by(AuditLog.created_at.desc())
        .offset(offset)
        .limit(limit)
        .all()
    )
    return {
        "total": total,
        "page": page,
        "limit": limit,
        "pages": (total + limit - 1) // limit,
        "logs": [
            {
                "id": l.id,
                "action": l.action,
                "entity_type": l.entity_type,
                "entity_name": l.entity_name,
                "user_name": l.user_name,
                "ip_address": l.ip_address,
                "created_at": l.created_at.isoformat(),
            }
            for l in logs
        ],
    }
