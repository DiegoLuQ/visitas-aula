from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy.exc import IntegrityError
from typing import List

from database import get_db
from models import Curso, Nivel, Usuario
from schemas import CursoCreate, CursoResponse, NivelResponse
from auth import require_admin, get_current_active_user

router = APIRouter(prefix="/cursos", tags=["Cursos"])


@router.get("/", response_model=List[CursoResponse])
def list_cursos(
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_active_user)
):
    cursos = db.query(Curso).all()
    result = []
    for curso in cursos:
        curso_dict = {
            "id": curso.id,
            "nivel_id": curso.nivel_id,
            "letra": curso.letra,
            "nivel": curso.nivel,
            "created_by": curso.created_by,
            "created_at": curso.created_at
        }
        result.append(curso_dict)
    return result


@router.get("/{curso_id}", response_model=CursoResponse)
def get_curso(
    curso_id: int,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_active_user)
):
    curso = db.query(Curso).filter(Curso.id == curso_id).first()
    if not curso:
        raise HTTPException(status_code=404, detail="Curso no encontrado")
    return {
        "id": curso.id,
        "nivel_id": curso.nivel_id,
        "letra": curso.letra,
        "nivel": curso.nivel,
        "created_by": curso.created_by,
        "created_at": curso.created_at
    }


@router.post("/", response_model=CursoResponse)
def create_curso(
    curso: CursoCreate,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(require_admin)
):
    nivel = db.query(Nivel).filter(Nivel.id == curso.nivel_id).first()
    if not nivel:
        raise HTTPException(status_code=400, detail="Nivel no encontrado")
    
    try:
        db_curso = Curso(
            nivel_id=curso.nivel_id,
            letra=curso.letra.upper(),
            created_by=current_user.id
        )
        db.add(db_curso)
        db.commit()
        db.refresh(db_curso)
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=400, detail="El curso ya existe")
    
    return {
        "id": db_curso.id,
        "nivel_id": db_curso.nivel_id,
        "letra": db_curso.letra,
        "nivel": db_curso.nivel,
        "created_by": db_curso.created_by,
        "created_at": db_curso.created_at
    }


@router.delete("/{curso_id}")
def delete_curso(
    curso_id: int,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(require_admin)
):
    curso = db.query(Curso).filter(Curso.id == curso_id).first()
    if not curso:
        raise HTTPException(status_code=404, detail="Curso no encontrado")
    
    if curso.evaluaciones:
        raise HTTPException(
            status_code=400,
            detail="No se puede eliminar el curso porque tiene evaluaciones asociadas"
        )
    
    db.delete(curso)
    db.commit()
    return {"message": "Curso eliminado correctamente"}
