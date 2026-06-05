from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session, joinedload
from sqlalchemy.exc import IntegrityError
from typing import List
import pandas as pd
import io
from datetime import datetime

from database import get_db
from models import Docente, Colegio, Usuario
from schemas import DocenteCreate, DocenteResponse
from auth import require_admin, require_docente_manager, get_current_active_user

router = APIRouter(prefix="/docentes", tags=["Docentes"])


def _user_colegio_ids(user: Usuario):
    if not user.colegio_id:
        return []
    return [int(x.strip()) for x in str(user.colegio_id).split(",") if x.strip().isdigit()]


def _assert_colegio_acceso(user: Usuario, colegio_id: int):
    """Un no-admin (director/utp) solo gestiona docentes de su(s) colegio(s)."""
    if user.rol_id == 1:
        return
    permitidos = _user_colegio_ids(user)
    if permitidos and colegio_id not in permitidos:
        raise HTTPException(status_code=403, detail="No puede gestionar docentes de otro colegio")


@router.get("/", response_model=List[DocenteResponse])
def list_docentes(
    colegio_id: int = None,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_active_user)
):
    query = db.query(Docente).options(joinedload(Docente.colegio))
    
    if colegio_id:
        query = query.filter(Docente.colegio_id == colegio_id)
    
    # Filtro por colegio_id del usuario (Seguridad)
    if current_user.colegio_id:
        try:
            ids = [int(id.strip()) for id in current_user.colegio_id.split(",") if id.strip()]
            if ids:
                query = query.filter(Docente.colegio_id.in_(ids))
        except ValueError:
            pass
    
    docentes = query.order_by(Docente.nombre).all()
    return docentes


@router.get("/{docente_id}", response_model=DocenteResponse)
def get_docente(
    docente_id: int,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_active_user)
):
    docente = db.query(Docente).options(joinedload(Docente.colegio)).filter(Docente.id == docente_id).first()
    if not docente:
        raise HTTPException(status_code=404, detail="Docente no encontrado")
    
    return docente


@router.post("/", response_model=DocenteResponse)
def create_docente(
    docente: DocenteCreate,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(require_docente_manager)
):
    colegio = db.query(Colegio).filter(Colegio.id == docente.colegio_id).first()
    if not colegio:
        raise HTTPException(status_code=400, detail="Colegio no encontrado")

    _assert_colegio_acceso(current_user, docente.colegio_id)

    try:
        db_docente = Docente(
            nombre=docente.nombre,
            rut=docente.rut,
            email=docente.email,
            colegio_id=docente.colegio_id,
            created_by=current_user.id
        )
        db.add(db_docente)
        db.commit()
        db.refresh(db_docente)
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=400, detail="El RUT ya existe en este colegio")
    
    return db_docente


@router.put("/{docente_id}", response_model=DocenteResponse)
def update_docente(
    docente_id: int,
    docente_update: DocenteCreate,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(require_docente_manager)
):
    docente = db.query(Docente).filter(Docente.id == docente_id).first()
    if not docente:
        raise HTTPException(status_code=404, detail="Docente no encontrado")

    # Debe tener acceso tanto al colegio actual como al de destino
    _assert_colegio_acceso(current_user, docente.colegio_id)
    _assert_colegio_acceso(current_user, docente_update.colegio_id)

    docente.nombre = docente_update.nombre
    docente.rut = docente_update.rut
    docente.email = docente_update.email
    docente.colegio_id = docente_update.colegio_id
    
    db.commit()
    db.refresh(docente)
    
    return docente


@router.delete("/{docente_id}")
def delete_docente(
    docente_id: int,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(require_admin)
):
    docente = db.query(Docente).filter(Docente.id == docente_id).first()
    if not docente:
        raise HTTPException(status_code=404, detail="Docente no encontrado")
    
    if docente.evaluaciones:
        raise HTTPException(
            status_code=400,
            detail="El docente tiene evaluaciones asociadas. Para eliminarlo, primero debe eliminar todas sus evaluaciones."
        )
    
    db.delete(docente)
    db.commit()
    
    return {"message": "Docente eliminado correctamente"}
    
@router.get("/export/excel")
def export_docentes_excel(
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_active_user)
):
    query = db.query(Docente).options(joinedload(Docente.colegio))
    
    # Filtro por colegio_id del usuario (Seguridad)
    if current_user.colegio_id:
        try:
            ids = [int(id.strip()) for id in current_user.colegio_id.split(",") if id.strip()]
            if ids:
                query = query.filter(Docente.colegio_id.in_(ids))
        except ValueError:
            pass

    docentes = query.all()
    
    data = []
    for d in docentes:
        data.append({
            "ID": d.id,
            "Nombre": d.nombre,
            "RUT": d.rut,
            "Email": d.email,
            "Colegio": d.colegio.nombre if d.colegio else "N/A",
            "ID Colegio": d.colegio_id
        })
    
    df = pd.DataFrame(data)
    output = io.BytesIO()
    with pd.ExcelWriter(output, engine='openpyxl') as writer:
        df.to_excel(writer, index=False, sheet_name='Docentes')
    
    output.seek(0)
    filename = f"docentes_{datetime.now().strftime('%Y%m%d_%H%M%S')}.xlsx"
    
    return StreamingResponse(
        output,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f"attachment; filename={filename}"}
    )


@router.get("/export/template")
def export_docentes_template(
    current_user: Usuario = Depends(get_current_active_user)
):
    df = pd.DataFrame(columns=["Nombre", "RUT", "Email", "ID Colegio"])
    # Agregar una fila de ejemplo (comentada o vacía)
    example_data = pd.DataFrame([{
        "Nombre": "Ejemplo Nombre",
        "RUT": "12345678-9",
        "Email": "ejemplo@correo.com",
        "ID Colegio": 1
    }])
    df = pd.concat([df, example_data], ignore_index=True)
    
    output = io.BytesIO()
    with pd.ExcelWriter(output, engine='openpyxl') as writer:
        df.to_excel(writer, index=False, sheet_name='Plantilla')
    
    output.seek(0)
    return StreamingResponse(
        output,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": "attachment; filename=plantilla_docentes.xlsx"}
    )


@router.post("/import/excel")
async def import_docentes_excel(
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(require_docente_manager)
):
    if not file.filename.endswith(('.xlsx', '.xls')):
        raise HTTPException(status_code=400, detail="Formato de archivo no válido. Use Excel (.xlsx)")

    try:
        contents = await file.read()
        df = pd.read_excel(io.BytesIO(contents))
        
        required_cols = ["Nombre", "RUT", "Email", "ID Colegio"]
        for col in required_cols:
            if col not in df.columns:
                raise HTTPException(status_code=400, detail=f"Falta la columna obligatoria: {col}")

        imported_count = 0
        errors = []

        for index, row in df.iterrows():
            try:
                # Validar colegio
                colegio_id = int(row["ID Colegio"])
                colegio = db.query(Colegio).filter(Colegio.id == colegio_id).first()
                if not colegio:
                    errors.append(f"Fila {index+2}: Colegio ID {colegio_id} no encontrado")
                    continue

                # Un no-admin (director/utp) solo puede importar a su(s) colegio(s)
                if current_user.rol_id != 1:
                    permitidos = _user_colegio_ids(current_user)
                    if permitidos and colegio_id not in permitidos:
                        errors.append(f"Fila {index+2}: Sin acceso al colegio ID {colegio_id}")
                        continue

                # Validar email (ahora obligatorio)
                email = str(row["Email"]) if pd.notna(row["Email"]) else None
                if not email:
                    errors.append(f"Fila {index+2}: El Email es obligatorio")
                    continue

                # Crear docente
                db_docente = Docente(
                    nombre=str(row["Nombre"]),
                    rut=str(row["RUT"]),
                    email=email,
                    colegio_id=colegio_id,
                    created_by=current_user.id
                )
                db.add(db_docente)
                db.commit()
                imported_count += 1
            except IntegrityError:
                db.rollback()
                errors.append(f"Fila {index+2}: El RUT '{row['RUT']}' ya existe.")
            except Exception as e:
                db.rollback()
                errors.append(f"Fila {index+2}: Error - {str(e)}")

        return {
            "message": f"Importación finalizada. {imported_count} docentes importados.",
            "errors": errors
        }

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error al procesar el archivo: {str(e)}")
