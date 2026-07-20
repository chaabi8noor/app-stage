from pydantic import BaseModel, EmailStr
from app.models.user import Role

class UserCreate(BaseModel):
    name: str
    email: EmailStr
    password: str
    role: Role = Role.intern

class UserOut(BaseModel):
    id: int
    name: str
    email: str
    role: Role
    is_active: bool

    model_config = {"from_attributes": True}

class Token(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserOut
