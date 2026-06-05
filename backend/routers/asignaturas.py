from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List

from database import get_db
from models import Asignatura, Usuario
from schemas import AsignaturaCreate, AsignaturaResponse
from auth import require_admin, require_not_usuario, get_current_active_user

router = APIRouter(prefix="/asignaturas", tags=["Asignaturas"])


@router.get("/", response_model=List[AsignaturaResponse])
def list_asignaturas(
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_active_user)
):
    return db.query(Asignatura).order_by(Asignatura.nombre).all()


@router.get("/{asignatura_id}", response_model=AsignaturaResponse)
def get_asignatura(
    asignatura_id: int,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_active_user)
):
    asignatura = db.query(Asignatura).filter(Asignatura.id == asignatura_id).first()
    if not asignatura:
        raise HTTPException(status_code=404, detail="Asignatura no encontrada")
    return asignatura


@router.post("/", response_model=AsignaturaResponse)
def create_asignatura(
    asignatura: AsignaturaCreate,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(require_not_usuario)
):
    db_asignatura = Asignatura(
        nombre=asignatura.nombre,
        created_by=current_user.id
    )
    db.add(db_asignatura)
    db.commit()
    db.refresh(db_asignatura)
    return db_asignatura


@router.put("/{asignatura_id}", response_model=AsignaturaResponse)
def update_asignatura(
    asignatura_id: int,
    asignatura_update: AsignaturaCreate,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(require_admin)
):
    asignatura = db.query(Asignatura).filter(Asignatura.id == asignatura_id).first()
    if not asignatura:
        raise HTTPException(status_code=404, detail="Asignatura no encontrada")
    
    asignatura.nombre = asignatura_update.nombre
    
    db.commit()
    db.refresh(asignatura)
    return asignatura


@router.delete("/{asignatura_id}")
def delete_asignatura(
    asignatura_id: int,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(require_admin)
):
    asignatura = db.query(Asignatura).filter(Asignatura.id == asignatura_id).first()
    if not asignatura:
        raise HTTPException(status_code=404, detail="Asignatura no encontrada")
    
    if asignatura.evaluaciones:
        raise HTTPException(
            status_code=400,
            detail="No se puede eliminar la asignatura porque tiene evaluaciones asociadas"
        )
    
    db.delete(asignatura)
    db.commit()
    return {"message": "Asignatura eliminada correctamente"}
