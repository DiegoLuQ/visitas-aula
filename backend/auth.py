from datetime import datetime, timedelta
from typing import Optional
from jose import JWTError, jwt
from passlib.context import CryptContext
from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy.orm import Session
import os
from dotenv import load_dotenv

load_dotenv()

SECRET_KEY = os.getenv("SECRET_KEY", "supersecretkey_change_in_production_liderazgo_docente_2024")
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 480

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="auth/login")

from database import get_db
from models import Usuario


def verify_password(plain_password: str, hashed_password: str) -> bool:
    return pwd_context.verify(plain_password, hashed_password)


def get_password_hash(password: str) -> str:
    return pwd_context.hash(password)


def create_access_token(data: dict, expires_delta: Optional[timedelta] = None) -> str:
    to_encode = data.copy()
    if expires_delta:
        expire = datetime.utcnow() + expires_delta
    else:
        expire = datetime.utcnow() + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    to_encode.update({"exp": expire})
    encoded_jwt = jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)
    return encoded_jwt


def get_current_user(token: str = Depends(oauth2_scheme), db: Session = Depends(get_db)) -> Usuario:
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="No se pudo validar las credenciales",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        username: str = payload.get("sub")
        if username is None:
            raise credentials_exception
    except JWTError:
        raise credentials_exception

    user = db.query(Usuario).filter(Usuario.username == username).first()
    if user is None:
        raise credentials_exception
    return user


def get_current_active_user(current_user: Usuario = Depends(get_current_user)) -> Usuario:
    if current_user.activo == 0:
        raise HTTPException(status_code=400, detail="Usuario inactivo")
    return current_user


def require_admin(current_user: Usuario = Depends(get_current_active_user)) -> Usuario:
    if current_user.rol_id != 1:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="No tienes permisos de administrador"
        )
    return current_user


def require_admin_or_auditor(current_user: Usuario = Depends(get_current_active_user)) -> Usuario:
    if current_user.rol_id not in [1, 2]:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="No tienes permisos suficientes"
        )
    return current_user


def require_admin_or_director(current_user: Usuario = Depends(get_current_active_user)) -> Usuario:
    # Admin (rol_id == 1) o el rol "director" (creado dinámicamente, id no fijo -> se valida por nombre)
    if current_user.rol_id == 1:
        return current_user
    if current_user.rol and (current_user.rol.nombre or "").lower() == "director":
        return current_user
    raise HTTPException(
        status_code=status.HTTP_403_FORBIDDEN,
        detail="Solo administradores o directores pueden realizar esta acción"
    )


def require_docente_manager(current_user: Usuario = Depends(get_current_active_user)) -> Usuario:
    """Roles autorizados a gestionar docentes: admin, director, utp, liderazgo."""
    if current_user.rol_id == 1:
        return current_user
    if current_user.rol and (current_user.rol.nombre or "").lower() in ("director", "utp", "liderazgo"):
        return current_user
    raise HTTPException(
        status_code=status.HTTP_403_FORBIDDEN,
        detail="Solo administradores, directores, UTP o coordinadores de liderazgo pueden gestionar docentes"
    )


def require_not_usuario(current_user: Usuario = Depends(get_current_active_user)) -> Usuario:
    """Cualquier usuario autenticado cuyo rol NO sea 'usuario'."""
    rol_nombre = (current_user.rol.nombre or "").lower() if current_user.rol else ""
    es_usuario = (rol_nombre == "usuario") if rol_nombre else (current_user.rol_id == 3)
    if es_usuario:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Tu rol no tiene permiso para esta acción"
        )
    return current_user
