from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List, Optional

from database import get_db
from models import Nivel, Usuario
from schemas import NivelCreate, NivelResponse
from auth import require_admin, get_current_active_user

router = APIRouter(prefix="/niveles", tags=["Niveles"])


@router.get("/", response_model=List[NivelResponse])
def list_niveles(
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_active_user)
):
    return db.query(Nivel).order_by(Nivel.orden).all()


@router.get("/{nivel_id}", response_model=NivelResponse)
def get_nivel(
    nivel_id: int,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_active_user)
):
    nivel = db.query(Nivel).filter(Nivel.id == nivel_id).first()
    if not nivel:
        raise HTTPException(status_code=404, detail="Nivel no encontrado")
    return nivel


@router.post("/", response_model=NivelResponse)
def create_nivel(
    nivel: NivelCreate,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(require_admin)
):
    db_nivel = Nivel(
        nombre=nivel.nombre,
        orden=nivel.orden or 0
    )
    db.add(db_nivel)
    db.commit()
    db.refresh(db_nivel)
    return db_nivel


@router.put("/{nivel_id}", response_model=NivelResponse)
def update_nivel(
    nivel_id: int,
    nivel_update: NivelCreate,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(require_admin)
):
    nivel = db.query(Nivel).filter(Nivel.id == nivel_id).first()
    if not nivel:
        raise HTTPException(status_code=404, detail="Nivel no encontrado")
    
    nivel.nombre = nivel_update.nombre
    if nivel_update.orden is not None:
        nivel.orden = nivel_update.orden
    
    db.commit()
    db.refresh(nivel)
    return nivel


@router.delete("/{nivel_id}")
def delete_nivel(
    nivel_id: int,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(require_admin)
):
    nivel = db.query(Nivel).filter(Nivel.id == nivel_id).first()
    if not nivel:
        raise HTTPException(status_code=404, detail="Nivel no encontrado")
    
    if nivel.cursos:
        raise HTTPException(
            status_code=400,
            detail="No se puede eliminar el nivel porque tiene cursos asociados"
        )
    
    db.delete(nivel)
    db.commit()
    return {"message": "Nivel eliminado correctamente"}
