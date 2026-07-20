from sqlalchemy import Column, Integer, String, DateTime, ForeignKey, Enum, Table
from sqlalchemy.orm import relationship
from app.core.database import Base
from datetime import datetime
import enum

task_assignees = Table(
    "task_assignees",
    Base.metadata,
    Column("task_id", Integer, ForeignKey("tasks.id", ondelete="CASCADE"), primary_key=True),
    Column("user_id", Integer, ForeignKey("users.id", ondelete="CASCADE"), primary_key=True),
)

class TaskStatus(str, enum.Enum):
    todo = "todo"
    in_progress = "in_progress"
    done = "done"

class TaskPriority(str, enum.Enum):
    low = "low"
    medium = "medium"
    high = "high"

class TaskType(str, enum.Enum):
    task = "task"
    bug = "bug"
    feature = "feature"
    story = "story"

class Task(Base):
    __tablename__ = "tasks"

    id = Column(Integer, primary_key=True, index=True)
    title = Column(String, nullable=False)
    description = Column(String)
    status = Column(Enum(TaskStatus), default=TaskStatus.todo)
    priority = Column(Enum(TaskPriority), default=TaskPriority.medium)
    task_type = Column(Enum(TaskType), default=TaskType.task)
    story_points = Column(Integer, nullable=True)
    start_date = Column(DateTime, nullable=True)
    deadline = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    project_id = Column(Integer, ForeignKey("projects.id"))
    part_id = Column(Integer, ForeignKey("parts.id"), nullable=True)
    assignee_id = Column(Integer, ForeignKey("users.id"))
    created_by_id = Column(Integer, ForeignKey("users.id"))
    instance_id = Column(Integer, ForeignKey("part_instances.id", ondelete="CASCADE"), nullable=True)

    project = relationship("Project", back_populates="tasks")
    part = relationship("Part", back_populates="tasks")
    assignee = relationship("User", back_populates="assigned_tasks", foreign_keys=[assignee_id])
    created_by = relationship("User", foreign_keys=[created_by_id])
    instance = relationship("PartInstance", back_populates="tasks")
    comments = relationship("Comment", back_populates="task", cascade="all, delete")
    activities = relationship("Activity", back_populates="task", cascade="all, delete")
    subtasks = relationship("Subtask", back_populates="task", cascade="all, delete")
    labels = relationship("Label", secondary="task_labels", back_populates="tasks")
    assignees = relationship("User", secondary="task_assignees", foreign_keys=[task_assignees.c.task_id, task_assignees.c.user_id])
