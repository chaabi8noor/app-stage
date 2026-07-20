from sqlalchemy import Column, Integer, ForeignKey, DateTime, UniqueConstraint
from sqlalchemy.orm import relationship
from app.core.database import Base
from datetime import datetime


class PartInstance(Base):
    __tablename__ = "part_instances"

    id = Column(Integer, primary_key=True, index=True)
    part_id = Column(Integer, ForeignKey("parts.id", ondelete="CASCADE"), nullable=False)
    intern_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)

    __table_args__ = (UniqueConstraint("part_id", "intern_id", name="uq_part_intern_instance"),)

    part = relationship("Part", back_populates="instances")
    intern = relationship("User")
    tasks = relationship("Task", back_populates="instance", cascade="all, delete-orphan")
