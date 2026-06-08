from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List

from database import get_db
from models import Colegio, Usuario
from schemas import ColegioCreate, ColegioResponse
from auth import require_admin, get_current_active_user

router = APIRouter(prefix="/colegios", tags=["Colegios"])


@router.get("/", response_model=List[ColegioResponse])
def list_colegios(
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_active_user)
):
    query = db.query(Colegio)
    
    is_liderazgo = current_user.rol and (current_user.rol.nombre or "").lower() == "liderazgo"
    if current_user.colegio_id and not is_liderazgo:
        try:
            ids = [int(id.strip()) for id in current_user.colegio_id.split(",") if id.strip()]
            if ids:
                query = query.filter(Colegio.id.in_(ids))
        except ValueError:
            pass

    return query.order_by(Colegio.nombre).all()


@router.get("/{colegio_id}", response_model=ColegioResponse)
def get_colegio(
    colegio_id: int,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_active_user)
):
    query = db.query(Colegio).filter(Colegio.id == colegio_id)
    
    is_liderazgo = current_user.rol and (current_user.rol.nombre or "").lower() == "liderazgo"
    if current_user.colegio_id and not is_liderazgo:
        try:
            ids = [int(id.strip()) for id in current_user.colegio_id.split(",") if id.strip()]
            if ids and colegio_id not in ids:
                raise HTTPException(status_code=403, detail="No tiene permiso para ver este colegio")
        except ValueError:
            pass

    colegio = query.first()
    if not colegio:
        raise HTTPException(status_code=404, detail="Colegio no encontrado")
    return colegio


@router.post("/", response_model=ColegioResponse)
def create_colegio(
    colegio: ColegioCreate,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(require_admin)
):
    db_colegio = Colegio(
        nombre=colegio.nombre,
        direccion=colegio.direccion,
        created_by=current_user.id
    )
    db.add(db_colegio)
    db.commit()
    db.refresh(db_colegio)
    return db_colegio


@router.put("/{colegio_id}", response_model=ColegioResponse)
def update_colegio(
    colegio_id: int,
    colegio_update: ColegioCreate,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(require_admin)
):
    colegio = db.query(Colegio).filter(Colegio.id == colegio_id).first()
    if not colegio:
        raise HTTPException(status_code=404, detail="Colegio no encontrado")
    
    colegio.nombre = colegio_update.nombre
    if colegio_update.direccion is not None:
        colegio.direccion = colegio_update.direccion
    
    db.commit()
    db.refresh(colegio)
    return colegio


@router.delete("/{colegio_id}")
def delete_colegio(
    colegio_id: int,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(require_admin)
):
    colegio = db.query(Colegio).filter(Colegio.id == colegio_id).first()
    if not colegio:
        raise HTTPException(status_code=404, detail="Colegio no encontrado")
    
    if colegio.docentes:
        raise HTTPException(
            status_code=400,
            detail="No se puede eliminar el colegio porque tiene docentes asociados"
        )
    
    db.delete(colegio)
    db.commit()
    return {"message": "Colegio eliminado correctamente"}
