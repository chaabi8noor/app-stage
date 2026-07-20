from sqlalchemy import Column, Integer, String, Boolean, Enum
from sqlalchemy.orm import relationship
from app.core.database import Base
import enum

class Role(str, enum.Enum):
    admin = "admin"
    intern = "intern"

class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False)
    email = Column(String, unique=True, index=True, nullable=False)
    hashed_password = Column(String, nullable=False)
    role = Column(Enum(Role), default=Role.intern, nullable=False)
    is_active = Column(Boolean, default=True)

    assigned_tasks = relationship("Task", back_populates="assignee", foreign_keys="Task.assignee_id")
    projects = relationship("ProjectMember", back_populates="user")
