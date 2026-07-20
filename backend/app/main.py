from fastapi import FastAPI, Depends
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session
from app.core.database import Base, engine, get_db
from app.core.config import settings
from app.routers import auth, users, projects, tasks
from app.routers.audit import router as audit_router
from app.routers.notifications import router as notifications_router
from app.routers.resources import router as resources_router
from app.routers.comments import router as comments_router
from app.routers.parts import router as parts_router
from app.routers.labels import router as labels_router
from app.routers.subtasks import router as subtasks_router
from app.routers.analyze import router as analyze_router
from app.routers.reports import router as reports_router
from app.routers.feedback import router as feedback_router
from app.routers.health import router as health_router
from app.core.security import hash_password
from app.models.user import User, Role
from app.models.resource import ProjectResource  # noqa: ensure table created
from app.models.part_instance import PartInstance  # noqa: ensure table created
from app.models.task import Task, TaskStatus
from app.models.project import Project
from app.routers.auth import require_admin
from datetime import datetime

Base.metadata.create_all(bind=engine)

# ── Safe column/table migrations (run on every deploy, idempotent) ────────────
def run_migrations():
    from sqlalchemy import text
    migrations = [
        "ALTER TABLE projects ADD COLUMN IF NOT EXISTS architecture TEXT",
        "ALTER TABLE projects ADD COLUMN IF NOT EXISTS tech_stack TEXT",
        "ALTER TABLE projects ADD COLUMN IF NOT EXISTS architecture_notes TEXT",
        "ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS session_duration INTEGER",
        """CREATE TABLE IF NOT EXISTS part_interns (
            part_id INTEGER REFERENCES parts(id) ON DELETE CASCADE,
            user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
            PRIMARY KEY (part_id, user_id)
        )""",
        """CREATE TABLE IF NOT EXISTS project_resources (
            id SERIAL PRIMARY KEY,
            project_id INTEGER REFERENCES projects(id) ON DELETE CASCADE NOT NULL,
            name VARCHAR NOT NULL,
            resource_type VARCHAR NOT NULL,
            url VARCHAR,
            file_data BYTEA,
            file_mime VARCHAR,
            note_text TEXT,
            uploaded_by_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
            created_at TIMESTAMP DEFAULT NOW()
        )""",
        """CREATE TABLE IF NOT EXISTS notifications (
            id SERIAL PRIMARY KEY,
            user_id INTEGER REFERENCES users(id) ON DELETE CASCADE NOT NULL,
            message VARCHAR NOT NULL,
            task_id INTEGER REFERENCES tasks(id) ON DELETE SET NULL,
            read BOOLEAN DEFAULT FALSE,
            created_at TIMESTAMP DEFAULT NOW()
        )""",
        """CREATE TABLE IF NOT EXISTS task_assignees (
            task_id INTEGER REFERENCES tasks(id) ON DELETE CASCADE,
            user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
            PRIMARY KEY (task_id, user_id)
        )""",
        "ALTER TABLE parts ADD COLUMN IF NOT EXISTS assignment_mode VARCHAR DEFAULT 'collaborative'",
        """CREATE TABLE IF NOT EXISTS part_instances (
            id SERIAL PRIMARY KEY,
            part_id INTEGER REFERENCES parts(id) ON DELETE CASCADE,
            intern_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
            created_at TIMESTAMP DEFAULT NOW(),
            UNIQUE(part_id, intern_id)
        )""",
        "ALTER TABLE tasks ADD COLUMN IF NOT EXISTS instance_id INTEGER REFERENCES part_instances(id) ON DELETE CASCADE",
    ]
    # Use AUTOCOMMIT so each statement runs in its own transaction.
    # In PostgreSQL a failed statement poisons the whole transaction,
    # so without AUTOCOMMIT a single error silently skips all later migrations.
    with engine.connect().execution_options(isolation_level="AUTOCOMMIT") as conn:
        for sql in migrations:
            try:
                conn.execute(text(sql))
                print(f"Migration OK: {sql[:60].strip()}")
            except Exception as e:
                pg = getattr(e.__cause__, "pgcode", None) or getattr(e, "pgcode", None)
                if pg in ("42701", "42P07"):  # column/table already exists — safe to skip
                    print(f"Migration skip (déjà appliquée): {sql[:60].strip()}")
                else:
                    print(f"Migration ERREUR: {e}")
                    raise

run_migrations()

app = FastAPI(title="Intern Manager API")

_origins = [o.strip() for o in settings.FRONTEND_URL.split(",") if o.strip() and o.strip() != "*"]

app.add_middleware(
    CORSMiddleware,
    allow_origins=_origins if _origins else ["*"],
    allow_origin_regex=r".*" if not _origins else None,
    allow_credentials=bool(_origins),
    allow_methods=["*"],
    allow_headers=["*"],
)


app.include_router(auth.router)
app.include_router(users.router)
app.include_router(projects.router)
app.include_router(tasks.router)
app.include_router(comments_router)
app.include_router(parts_router)
app.include_router(labels_router)
app.include_router(subtasks_router)
app.include_router(analyze_router)
app.include_router(reports_router)
app.include_router(feedback_router)
app.include_router(audit_router)
app.include_router(notifications_router)
app.include_router(resources_router)
app.include_router(health_router)

@app.on_event("startup")
def seed_admin():
    import os
    if not os.getenv("SEED_ADMIN"):
        return
    db = Session(bind=engine)
    try:
        if not db.query(User).filter(User.email == "admin@intern.app").first():
            seed_password = os.getenv("SEED_ADMIN_PASSWORD", "")
            if not seed_password:
                print("SEED_ADMIN=1 mais SEED_ADMIN_PASSWORD non défini — seed ignoré")
                return
            db.add(User(
                name="Admin",
                email="admin@intern.app",
                hashed_password=hash_password(seed_password),
                role=Role.admin,
            ))
            db.commit()
            print("Compte admin seedé")
    finally:
        db.close()

@app.get("/stats")
def get_stats(db: Session = Depends(get_db), _: User = Depends(require_admin)):
    from sqlalchemy import func, case
    now = datetime.utcnow()

    # Single GROUP BY query for intern stats
    rows = (
        db.query(
            User.id, User.name, User.email,
            func.count(Task.id).label("total"),
            func.sum(case((Task.status == TaskStatus.done, 1), else_=0)).label("done"),
            func.sum(case((Task.status == TaskStatus.in_progress, 1), else_=0)).label("in_progress"),
            func.sum(case((Task.status == TaskStatus.todo, 1), else_=0)).label("todo"),
            func.sum(case(
                (Task.deadline != None, case((Task.deadline < now, case((Task.status != TaskStatus.done, 1), else_=0)), else_=0)),
                else_=0
            )).label("overdue"),
        )
        .outerjoin(Task, Task.assignee_id == User.id)
        .filter(User.role == "intern")
        .group_by(User.id, User.name, User.email)
        .all()
    )
    intern_stats = [
        {"id": r.id, "name": r.name, "email": r.email,
         "total_tasks": r.total or 0, "done": r.done or 0,
         "in_progress": r.in_progress or 0, "todo": r.todo or 0, "overdue": r.overdue or 0}
        for r in rows
    ]

    # Single GROUP BY query for project stats
    proj_rows = (
        db.query(
            Project.id, Project.name,
            func.count(Task.id).label("total"),
            func.sum(case((Task.status == TaskStatus.done, 1), else_=0)).label("done"),
        )
        .outerjoin(Task, Task.project_id == Project.id)
        .group_by(Project.id, Project.name)
        .all()
    )
    project_stats = [
        {"id": r.id, "name": r.name, "total": r.total or 0, "done": r.done or 0,
         "progress": round(((r.done or 0) / r.total * 100) if r.total else 0)}
        for r in proj_rows
    ]

    return {"interns": intern_stats, "projects": project_stats}

@app.get("/")
def root():
    return {"status": "ok"}
