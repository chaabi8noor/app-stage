from sqlalchemy import Column, Integer, String, Text, DateTime, ForeignKey, LargeBinary
from sqlalchemy.orm import relationship
from app.core.database import Base
from datetime import datetime

class ProjectResource(Base):
    __tablename__ = "project_resources"

    id = Column(Integer, primary_key=True, index=True)
    project_id = Column(Integer, ForeignKey("projects.id", ondelete="CASCADE"), nullable=False)
    name = Column(String, nullable=False)
    resource_type = Column(String, nullable=False)  # "file" | "link" | "note"
    url = Column(String, nullable=True)             # for links
    file_data = Column(LargeBinary, nullable=True)  # for uploaded files
    file_mime = Column(String, nullable=True)
    note_text = Column(Text, nullable=True)         # for notes
    uploaded_by_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    project = relationship("Project", back_populates="resources")
    uploaded_by = relationship("User", foreign_keys=[uploaded_by_id])
