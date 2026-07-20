from sqlalchemy import Column, Integer, String, Text, DateTime, ForeignKey
from sqlalchemy.orm import relationship
from app.core.database import Base
from datetime import datetime

class Project(Base):
    __tablename__ = "projects"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False)
    description = Column(String)
    github_url = Column(String)
    start_date = Column(DateTime, nullable=True)
    deadline = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    created_by_id = Column(Integer, ForeignKey("users.id"))

    # AI-generated architecture fields
    architecture = Column(Text, nullable=True)
    tech_stack = Column(Text, nullable=True)   # JSON string: ["React", "FastAPI", ...]
    architecture_notes = Column(Text, nullable=True)

    created_by = relationship("User", foreign_keys=[created_by_id])
    tasks = relationship("Task", back_populates="project", cascade="all, delete")
    parts = relationship("Part", back_populates="project", cascade="all, delete")
    members = relationship("ProjectMember", back_populates="project", cascade="all, delete")
    labels = relationship("Label", back_populates="project", cascade="all, delete")
    resources = relationship("ProjectResource", back_populates="project", cascade="all, delete")

class ProjectMember(Base):
    __tablename__ = "project_members"

    id = Column(Integer, primary_key=True)
    project_id = Column(Integer, ForeignKey("projects.id"))
    user_id = Column(Integer, ForeignKey("users.id"))

    project = relationship("Project", back_populates="members")
    user = relationship("User", back_populates="projects")
