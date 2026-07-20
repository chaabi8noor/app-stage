from sqlalchemy import Column, Integer, String, Text, ForeignKey, Table
from sqlalchemy.orm import relationship
from app.core.database import Base
# PartInstance imported at bottom to avoid circular import

part_interns = Table(
    "part_interns",
    Base.metadata,
    Column("part_id", Integer, ForeignKey("parts.id", ondelete="CASCADE"), primary_key=True),
    Column("user_id", Integer, ForeignKey("users.id", ondelete="CASCADE"), primary_key=True),
)

class Part(Base):
    __tablename__ = "parts"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False)
    description = Column(String)
    cdc_text = Column(Text, nullable=True)
    cdc_filename = Column(String, nullable=True)
    assignment_mode = Column(String, default="collaborative")  # "collaborative" | "individual"
    project_id = Column(Integer, ForeignKey("projects.id"))
    assignee_id = Column(Integer, ForeignKey("users.id"), nullable=True)

    project = relationship("Project", back_populates="parts")
    assignee = relationship("User", foreign_keys=[assignee_id])
    interns = relationship("User", secondary=part_interns)
    tasks = relationship("Task", back_populates="part", cascade="all, delete")
    instances = relationship("PartInstance", back_populates="part", cascade="all, delete-orphan")
