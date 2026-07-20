from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form
from fastapi.responses import Response
from sqlalchemy.orm import Session
from typing import Optional
from app.core.database import get_db
from app.models.resource import ProjectResource
from app.models.user import User
from app.routers.auth import get_current_user, require_admin

router = APIRouter(prefix="/projects/{project_id}/resources", tags=["resources"])

MAX_FILE_SIZE = 5 * 1024 * 1024  # 5 MB


@router.get("/")
def list_resources(project_id: int, db: Session = Depends(get_db), _: User = Depends(get_current_user)):
    resources = db.query(ProjectResource).filter(ProjectResource.project_id == project_id).order_by(ProjectResource.created_at.desc()).all()
    return [_serialize(r) for r in resources]


@router.post("/file")
async def upload_file(
    project_id: int,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    data = await file.read()
    if len(data) > MAX_FILE_SIZE:
        raise HTTPException(status_code=413, detail="Fichier trop volumineux (max 5 Mo)")
    r = ProjectResource(
        project_id=project_id,
        name=file.filename,
        resource_type="file",
        file_data=data,
        file_mime=file.content_type or "application/octet-stream",
        uploaded_by_id=current_user.id,
    )
    db.add(r)
    db.commit()
    db.refresh(r)
    return _serialize(r)


@router.post("/link")
def add_link(
    project_id: int,
    name: str = Form(...),
    url: str = Form(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    r = ProjectResource(project_id=project_id, name=name, resource_type="link", url=url, uploaded_by_id=current_user.id)
    db.add(r)
    db.commit()
    db.refresh(r)
    return _serialize(r)


@router.post("/note")
def add_note(
    project_id: int,
    name: str = Form(...),
    note_text: str = Form(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    r = ProjectResource(project_id=project_id, name=name, resource_type="note", note_text=note_text, uploaded_by_id=current_user.id)
    db.add(r)
    db.commit()
    db.refresh(r)
    return _serialize(r)


@router.get("/{resource_id}/download")
def download_file(project_id: int, resource_id: int, db: Session = Depends(get_db), _: User = Depends(get_current_user)):
    r = db.query(ProjectResource).filter(ProjectResource.id == resource_id, ProjectResource.project_id == project_id).first()
    if not r or r.resource_type != "file" or not r.file_data:
        raise HTTPException(status_code=404, detail="Fichier introuvable")
    return Response(content=r.file_data, media_type=r.file_mime, headers={"Content-Disposition": f'attachment; filename="{r.name}"'})


@router.delete("/{resource_id}")
def delete_resource(project_id: int, resource_id: int, db: Session = Depends(get_db), _: User = Depends(require_admin)):
    r = db.query(ProjectResource).filter(ProjectResource.id == resource_id, ProjectResource.project_id == project_id).first()
    if r:
        db.delete(r)
        db.commit()
    return {"ok": True}


def _serialize(r: ProjectResource):
    return {
        "id": r.id,
        "name": r.name,
        "resource_type": r.resource_type,
        "url": r.url,
        "file_mime": r.file_mime,
        "note_text": r.note_text,
        "uploaded_by": r.uploaded_by.name if r.uploaded_by else None,
        "created_at": r.created_at.isoformat(),
    }
