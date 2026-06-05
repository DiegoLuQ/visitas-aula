import io
from datetime import datetime
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query, UploadFile, File
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session, joinedload
from sqlalchemy.exc import IntegrityError
import pandas as pd

from database import get_db
from models import Meta, Usuario, Colegio, Rol
from schemas import MetaCreate, MetaUpdate, MetaResponse
from auth import require_admin_or_director

router = APIRouter(prefix="/metas", tags=["Metas"])

PERIODOS_VALIDOS = {"SEMESTRE", "ANUAL"}
# Roles que realizan visitas (los que pueden tener meta)
ROLES_VISITA = ("director", "inspectoria", "utp", "orien_conv", "pie")
XLSX_MEDIA = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
IMPORT_COLUMNS = ["Usuario", "Año", "Periodo", "Cantidad"]


def _es_admin(user: Usuario) -> bool:
    return user.rol_id == 1


def _colegios_de(user: Usuario) -> List[int]:
    if not user.colegio_id:
        return []
    return [int(x.strip()) for x in str(user.colegio_id).split(",") if x.strip().isdigit()]


def _check_colegio_acceso(actor: Usuario, colegio_id: Optional[int]):
    """Un director solo gestiona metas de usuarios de su(s) colegio(s)."""
    if _es_admin(actor):
        return
    permitidos = _colegios_de(actor)
    if permitidos and colegio_id is not None and colegio_id not in permitidos:
        raise HTTPException(status_code=403, detail="No tiene acceso a ese colegio")


def _nombre_usuario(u: Usuario) -> str:
    return (u.nombre_completo or u.username) if u else ""


def _build_response(m: Meta, roles_map=None) -> dict:
    rol_nombre = None
    if m.usuario and roles_map is not None:
        rol_nombre = roles_map.get(m.usuario.rol_id)
    return {
        "id": m.id,
        "usuario_id": m.usuario_id,
        "usuario_nombre": _nombre_usuario(m.usuario),
        "colegio_id": m.colegio_id,
        "colegio_nombre": m.colegio.nombre if m.colegio else None,
        "rol_nombre": rol_nombre,
        "anio": m.anio,
        "periodo": m.periodo,
        "cantidad": m.cantidad,
        "created_at": m.created_at,
    }


@router.get("/usuarios")
def usuarios_para_metas(
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(require_admin_or_director),
):
    """Usuarios que pueden tener meta (roles de visita), filtrados por colegio si es director."""
    roles_map = {r.id: (r.nombre or "").lower() for r in db.query(Rol).all()}
    colegios_map = {c.id: c.nombre for c in db.query(Colegio).all()}
    permitidos = None if _es_admin(current_user) else set(_colegios_de(current_user))

    out = []
    for u in db.query(Usuario).order_by(Usuario.username).all():
        rn = roles_map.get(u.rol_id, "")
        if rn not in ROLES_VISITA:
            continue
        ucols = _colegios_de(u)
        if permitidos:
            if not (set(ucols) & permitidos):
                continue
        col_id = ucols[0] if ucols else None
        out.append({
            "id": u.id,
            "nombre": _nombre_usuario(u),
            "rol_nombre": rn,
            "colegio_id": col_id,
            "colegio_nombre": colegios_map.get(col_id) if col_id else None,
        })
    return out


@router.get("/", response_model=List[MetaResponse])
def listar_metas(
    anio: Optional[int] = Query(None),
    colegio_id: Optional[int] = Query(None),
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(require_admin_or_director),
):
    roles_map = {r.id: (r.nombre or "").lower() for r in db.query(Rol).all()}
    query = db.query(Meta).options(joinedload(Meta.usuario), joinedload(Meta.colegio))

    if anio:
        query = query.filter(Meta.anio == anio)
    if colegio_id:
        query = query.filter(Meta.colegio_id == colegio_id)
    if not _es_admin(current_user):
        permitidos = _colegios_de(current_user)
        if permitidos:
            query = query.filter(Meta.colegio_id.in_(permitidos))

    metas = query.order_by(Meta.anio.desc(), Meta.colegio_id).all()
    return [_build_response(m, roles_map) for m in metas]


def _resolver_usuario(db: Session, usuario_id: int) -> Usuario:
    user = db.query(Usuario).filter(Usuario.id == usuario_id).first()
    if not user:
        raise HTTPException(status_code=400, detail="Usuario no encontrado")
    return user


@router.post("/", response_model=MetaResponse)
def crear_meta(
    meta: MetaCreate,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(require_admin_or_director),
):
    if meta.periodo not in PERIODOS_VALIDOS:
        raise HTTPException(status_code=400, detail="Periodo inválido (use SEMESTRE o ANUAL)")
    if meta.cantidad < 0:
        raise HTTPException(status_code=400, detail="La cantidad no puede ser negativa")

    user = _resolver_usuario(db, meta.usuario_id)
    ucols = _colegios_de(user)
    colegio_id = ucols[0] if ucols else None
    _check_colegio_acceso(current_user, colegio_id)

    nueva = Meta(
        usuario_id=user.id,
        colegio_id=colegio_id,
        anio=meta.anio,
        periodo=meta.periodo,
        cantidad=meta.cantidad,
    )
    db.add(nueva)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=400, detail="Ese usuario ya tiene una meta para ese año")
    db.refresh(nueva)
    roles_map = {r.id: (r.nombre or "").lower() for r in db.query(Rol).all()}
    return _build_response(nueva, roles_map)


@router.put("/{meta_id}", response_model=MetaResponse)
def actualizar_meta(
    meta_id: int,
    cambios: MetaUpdate,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(require_admin_or_director),
):
    meta = db.query(Meta).filter(Meta.id == meta_id).first()
    if not meta:
        raise HTTPException(status_code=404, detail="Meta no encontrada")
    _check_colegio_acceso(current_user, meta.colegio_id)

    data = cambios.dict(exclude_unset=True)
    if "periodo" in data and data["periodo"] not in PERIODOS_VALIDOS:
        raise HTTPException(status_code=400, detail="Periodo inválido (use SEMESTRE o ANUAL)")
    if "cantidad" in data and data["cantidad"] is not None and data["cantidad"] < 0:
        raise HTTPException(status_code=400, detail="La cantidad no puede ser negativa")

    if "usuario_id" in data and data["usuario_id"]:
        user = _resolver_usuario(db, data["usuario_id"])
        ucols = _colegios_de(user)
        meta.usuario_id = user.id
        meta.colegio_id = ucols[0] if ucols else None
        _check_colegio_acceso(current_user, meta.colegio_id)

    for campo in ("anio", "periodo", "cantidad"):
        if campo in data and data[campo] is not None:
            setattr(meta, campo, data[campo])

    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=400, detail="Ese usuario ya tiene una meta para ese año")
    db.refresh(meta)
    roles_map = {r.id: (r.nombre or "").lower() for r in db.query(Rol).all()}
    return _build_response(meta, roles_map)


@router.delete("/{meta_id}")
def eliminar_meta(
    meta_id: int,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(require_admin_or_director),
):
    meta = db.query(Meta).filter(Meta.id == meta_id).first()
    if not meta:
        raise HTTPException(status_code=404, detail="Meta no encontrada")
    _check_colegio_acceso(current_user, meta.colegio_id)
    db.delete(meta)
    db.commit()
    return {"detail": "Meta eliminada"}


# ============================================================
# Carga masiva de metas: exportar / plantilla / importar
# ============================================================
@router.get("/export/excel")
def export_metas_excel(
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(require_admin_or_director),
):
    roles_map = {r.id: (r.nombre or "").lower() for r in db.query(Rol).all()}
    query = db.query(Meta).options(joinedload(Meta.usuario), joinedload(Meta.colegio))
    if not _es_admin(current_user):
        permitidos = _colegios_de(current_user)
        if permitidos:
            query = query.filter(Meta.colegio_id.in_(permitidos))
    metas = query.order_by(Meta.anio.desc(), Meta.colegio_id).all()

    data = []
    for m in metas:
        u = m.usuario
        data.append({
            "Usuario": u.username if u else m.usuario_id,
            "Nombre Completo": (u.nombre_completo or "") if u else "",
            "Rol": roles_map.get(u.rol_id, "") if u else "",
            "Colegio": m.colegio.nombre if m.colegio else "",
            "Año": m.anio,
            "Periodo": m.periodo,
            "Cantidad": m.cantidad,
        })
    df = pd.DataFrame(data, columns=["Usuario", "Nombre Completo", "Rol", "Colegio", "Año", "Periodo", "Cantidad"])
    output = io.BytesIO()
    with pd.ExcelWriter(output, engine="openpyxl") as writer:
        df.to_excel(writer, index=False, sheet_name="Metas")
    output.seek(0)
    filename = f"metas_{datetime.now().strftime('%Y%m%d_%H%M%S')}.xlsx"
    return StreamingResponse(
        output, media_type=XLSX_MEDIA,
        headers={"Content-Disposition": f"attachment; filename={filename}"}
    )


@router.get("/export/template")
def export_metas_template(
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(require_admin_or_director),
):
    anio = datetime.now().year
    # Hoja 1: plantilla con ejemplos
    ejemplos = pd.DataFrame([
        {"Usuario": "mc_utp_1", "Año": anio, "Periodo": "ANUAL", "Cantidad": 20},
        {"Usuario": "mc_utp_2", "Año": anio, "Periodo": "SEMESTRE", "Cantidad": 8},
        {"Usuario": "dp_director_1", "Año": anio, "Periodo": "ANUAL", "Cantidad": 15},
    ], columns=IMPORT_COLUMNS)

    # Hoja 2: referencia de usuarios válidos (visitadores) + periodos
    roles_map = {r.id: (r.nombre or "").lower() for r in db.query(Rol).all()}
    colegios_map = {c.id: c.nombre for c in db.query(Colegio).all()}
    permitidos = None if _es_admin(current_user) else set(_colegios_de(current_user))
    ref_rows = []
    for u in db.query(Usuario).order_by(Usuario.username).all():
        rn = roles_map.get(u.rol_id, "")
        if rn not in ROLES_VISITA:
            continue
        ucols = _colegios_de(u)
        if permitidos and not (set(ucols) & permitidos):
            continue
        col_id = ucols[0] if ucols else None
        ref_rows.append({
            "Usuario": u.username,
            "Nombre Completo": u.nombre_completo or "",
            "Rol": rn,
            "Colegio": colegios_map.get(col_id, "") if col_id else "",
            "Periodos válidos": "",
        })
    ref = pd.DataFrame(ref_rows, columns=["Usuario", "Nombre Completo", "Rol", "Colegio", "Periodos válidos"])
    # Rellenar la columna de periodos válidos en las dos primeras filas
    for i, val in enumerate(["ANUAL", "SEMESTRE"]):
        if i < len(ref):
            ref.at[i, "Periodos válidos"] = val
        else:
            ref = pd.concat([ref, pd.DataFrame([{"Periodos válidos": val}])], ignore_index=True)

    output = io.BytesIO()
    with pd.ExcelWriter(output, engine="openpyxl") as writer:
        ejemplos.to_excel(writer, index=False, sheet_name="Plantilla")
        ref.to_excel(writer, index=False, sheet_name="Referencia")
    output.seek(0)
    return StreamingResponse(
        output, media_type=XLSX_MEDIA,
        headers={"Content-Disposition": "attachment; filename=plantilla_metas.xlsx"}
    )


@router.post("/import/excel")
async def import_metas_excel(
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(require_admin_or_director),
):
    if not file.filename.endswith((".xlsx", ".xls")):
        raise HTTPException(status_code=400, detail="Formato no válido. Use Excel (.xlsx)")
    try:
        contents = await file.read()
        df = pd.read_excel(io.BytesIO(contents), sheet_name=0)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"No se pudo leer el archivo: {e}")

    for col in ["Usuario", "Año", "Periodo", "Cantidad"]:
        if col not in df.columns:
            raise HTTPException(status_code=400, detail=f"Falta la columna obligatoria: {col}")

    roles_map = {r.id: (r.nombre or "").lower() for r in db.query(Rol).all()}
    permitidos = None if _es_admin(current_user) else set(_colegios_de(current_user))

    def cell(row, name):
        v = row.get(name)
        return None if (v is None or (isinstance(v, float) and pd.isna(v))) else v

    creados = 0
    actualizados = 0
    errors = []

    for index, row in df.iterrows():
        fila = index + 2
        try:
            username = str(cell(row, "Usuario") or "").strip()
            if not username:
                errors.append(f"Fila {fila}: 'Usuario' es obligatorio"); continue

            user = db.query(Usuario).filter(Usuario.username == username).first()
            if not user:
                errors.append(f"Fila {fila}: usuario '{username}' no existe"); continue
            if roles_map.get(user.rol_id, "") not in ROLES_VISITA:
                errors.append(f"Fila {fila}: '{username}' no tiene un rol de visita"); continue

            try:
                anio = int(cell(row, "Año"))
            except (TypeError, ValueError):
                errors.append(f"Fila {fila}: 'Año' inválido"); continue

            periodo = str(cell(row, "Periodo") or "ANUAL").strip().upper()
            if periodo not in PERIODOS_VALIDOS:
                errors.append(f"Fila {fila}: Periodo '{periodo}' inválido (use ANUAL o SEMESTRE)"); continue

            try:
                cantidad = int(cell(row, "Cantidad"))
            except (TypeError, ValueError):
                errors.append(f"Fila {fila}: 'Cantidad' inválida"); continue
            if cantidad < 0:
                errors.append(f"Fila {fila}: 'Cantidad' no puede ser negativa"); continue

            ucols = _colegios_de(user)
            colegio_id = ucols[0] if ucols else None
            if permitidos and (colegio_id not in permitidos):
                errors.append(f"Fila {fila}: sin acceso al colegio de '{username}'"); continue

            existente = db.query(Meta).filter(Meta.usuario_id == user.id, Meta.anio == anio).first()
            if existente:
                existente.periodo = periodo
                existente.cantidad = cantidad
                existente.colegio_id = colegio_id
                actualizados += 1
            else:
                db.add(Meta(usuario_id=user.id, colegio_id=colegio_id, anio=anio, periodo=periodo, cantidad=cantidad))
                creados += 1
            db.commit()
        except Exception as e:
            db.rollback()
            errors.append(f"Fila {fila}: Error - {e}")

    return {
        "message": f"Importación finalizada. {creados} creada(s), {actualizados} actualizada(s).",
        "creados": creados,
        "actualizados": actualizados,
        "errors": errors,
    }
