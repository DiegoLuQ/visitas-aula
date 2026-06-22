import io
import re
from datetime import timedelta, datetime
from fastapi import APIRouter, Depends, HTTPException, status, UploadFile, File
from fastapi.responses import StreamingResponse
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy.orm import Session, joinedload
from sqlalchemy import or_
from sqlalchemy.exc import IntegrityError
import pandas as pd

from database import get_db
from models import Usuario, Rol, Colegio
from schemas import UsuarioCreate, UsuarioResponse, UsuarioUpdate, Token, RolResponse, PasswordChangeRequest, ForgotPasswordRequest
from auth import verify_password, get_password_hash, create_access_token, ACCESS_TOKEN_EXPIRE_MINUTES, get_current_active_user, require_admin
from utils.email import send_password_change_email

router = APIRouter(prefix="/auth", tags=["Autenticación"])

XLSX_MEDIA = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
ACCESOS_VALIDOS = {"liderazgo", "visita", "todos"}


def _parse_colegios_cell(raw, colegios_by_id, colegios_by_name):
    """Convierte la celda 'Colegios' (IDs/nombres separados por ; o ,) en el
    string colegio_id que usa auth_usuarios. '' o 'todos' => acceso a todos."""
    if raw is None or (isinstance(raw, float) and pd.isna(raw)):
        return ""
    txt = str(raw).strip()
    if txt == "" or txt.lower() == "todos":
        return ""
    ids = []
    for token in re.split(r"[;,]", txt):
        t = token.strip()
        if not t:
            continue
        if t.isdigit():
            cid = int(t)
            if cid not in colegios_by_id:
                raise ValueError(f"Colegio con ID {cid} no existe")
            ids.append(str(cid))
        else:
            cid = colegios_by_name.get(t.lower())
            if cid is None:
                raise ValueError(f"Colegio '{t}' no existe")
            ids.append(str(cid))
    return ",".join(ids)


def _parse_estado(raw):
    """Activo/Inactivo/1/0/si/no -> 1 o 0 (por defecto 1)."""
    if raw is None or (isinstance(raw, float) and pd.isna(raw)):
        return 1
    txt = str(raw).strip().lower()
    if txt in ("0", "inactivo", "no", "false"):
        return 0
    return 1


@router.post("/register", response_model=UsuarioResponse)
def register(user: UsuarioCreate, db: Session = Depends(get_db)):
    db_user = db.query(Usuario).filter(
        or_(Usuario.username == user.username, Usuario.email == user.email)
    ).first()
    if db_user:
        if db_user.username == user.username:
            raise HTTPException(status_code=400, detail="El nombre de usuario ya existe")
        raise HTTPException(status_code=400, detail="El email ya está registrado")
    
    rol_usuario = db.query(Rol).filter(Rol.nombre == "usuario").first()
    if not rol_usuario:
        rol_usuario = Rol(nombre="usuario")
        db.add(rol_usuario)
        db.commit()
        db.refresh(rol_usuario)
    
    hashed_password = get_password_hash(user.password)
    new_user = Usuario(
        username=user.username,
        nombre_completo=user.nombre_completo,
        email=user.email,
        password_hash=hashed_password,
        rol_id=user.rol_id or rol_usuario.id,
        acceso=user.acceso or "liderazgo",
        colegio_id=user.colegio_id,
        activo=user.activo if user.activo is not None else 1
    )
    db.add(new_user)
    db.commit()
    db.refresh(new_user)
    return new_user


@router.post("/login", response_model=Token)
def login(form_data: OAuth2PasswordRequestForm = Depends(), db: Session = Depends(get_db)):
    user = db.query(Usuario).filter(Usuario.username == form_data.username).first()
    if not user or not verify_password(form_data.password, user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Usuario o contraseña incorrectos",
            headers={"WWW-Authenticate": "Bearer"},
        )
    
    if user.activo == 0:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Usuario inactivo"
        )
    
    access_token_expires = timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    access_token = create_access_token(
        data={"sub": user.username}, expires_delta=access_token_expires
    )
    return {"access_token": access_token, "token_type": "bearer"}


@router.get("/me", response_model=UsuarioResponse)
def get_me(current_user: Usuario = Depends(get_current_active_user)):
    return current_user


@router.post("/change-password")
def change_password(
    data: PasswordChangeRequest,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_active_user)
):
    if not data.new_password or len(data.new_password.strip()) < 4:
        raise HTTPException(status_code=400, detail="La contraseña debe tener al menos 4 caracteres")
        
    current_user.password_hash = get_password_hash(data.new_password)
    db.commit()
    db.refresh(current_user)
    
    # Resolver tipo de colegio para remitente de correo
    school_type = None
    if current_user.email:
        email_lower = current_user.email.lower()
        if "@colegiodiegoportales.cl" in email_lower:
            school_type = "DP"
        elif "@colegiomacaya.cl" in email_lower:
            school_type = "MC"
            
    # Enviar correo con la nueva contraseña
    email_sent = send_password_change_email(
        email=current_user.email,
        username=current_user.username,
        new_password=data.new_password,
        school_type=school_type
    )
    
    return {
        "detail": "Contraseña actualizada correctamente y enviada al correo electrónico",
        "email_sent": email_sent
    }


@router.post("/forgot-password")
def forgot_password(data: ForgotPasswordRequest, db: Session = Depends(get_db)):
    import secrets
    import string
    
    user = db.query(Usuario).filter(Usuario.email == data.email).first()
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="El correo electrónico no está registrado"
        )
    
    if user.activo == 0:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="El usuario se encuentra inactivo. Contacte al administrador."
        )
    
    # Generar nueva contraseña temporal de 8 caracteres legibles
    alphabet = string.ascii_letters + string.digits
    new_password = "".join(secrets.choice(alphabet) for _ in range(8))
    
    user.password_hash = get_password_hash(new_password)
    db.commit()
    db.refresh(user)
    
    # Resolver tipo de colegio para remitente de correo
    school_type = None
    email_lower = user.email.lower()
    if "@colegiodiegoportales.cl" in email_lower:
        school_type = "DP"
    elif "@colegiomacaya.cl" in email_lower:
        school_type = "MC"
        
    email_sent = send_password_change_email(
        email=user.email,
        username=user.username,
        new_password=new_password,
        school_type=school_type
    )
    
    if not email_sent:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="No se pudo enviar el correo electrónico de recuperación"
        )
        
    return {
        "detail": "Se ha generado una nueva contraseña temporal y se ha enviado a tu correo electrónico."
    }



@router.get("/users", response_model=list[UsuarioResponse])
def list_users(
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(require_admin)
):
    return db.query(Usuario).order_by(Usuario.id.desc()).all()


@router.put("/users/{user_id}", response_model=UsuarioResponse)
def update_user(
    user_id: int,
    user_update: UsuarioUpdate,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(require_admin)
):
    user = db.query(Usuario).filter(Usuario.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="Usuario no encontrado")
    
    if user_update.username:
        existing = db.query(Usuario).filter(
            Usuario.username == user_update.username,
            Usuario.id != user_id
        ).first()
        if existing:
            raise HTTPException(status_code=400, detail="El nombre de usuario ya existe")
        user.username = user_update.username

    if user_update.nombre_completo is not None:
        user.nombre_completo = user_update.nombre_completo

    if user_update.email:
        existing = db.query(Usuario).filter(
            Usuario.email == user_update.email,
            Usuario.id != user_id
        ).first()
        if existing:
            raise HTTPException(status_code=400, detail="El email ya está registrado")
        user.email = user_update.email
    
    if user_update.rol_id is not None:
        user.rol_id = user_update.rol_id
    
    if user_update.acceso is not None:
        user.acceso = user_update.acceso
    
    if user_update.colegio_id is not None:
        user.colegio_id = user_update.colegio_id

    if user_update.activo is not None:
        user.activo = user_update.activo
    
    if user_update.password:
        user.password_hash = get_password_hash(user_update.password)
    
    db.commit()
    db.refresh(user)
    return user


@router.delete("/users/{user_id}")
def delete_user(
    user_id: int,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(require_admin)
):
    user = db.query(Usuario).filter(Usuario.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="Usuario no encontrado")

    if user.id == current_user.id:
        raise HTTPException(status_code=400, detail="No puedes eliminar tu propio usuario")

    try:
        db.delete(user)
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(
            status_code=409,
            detail="No se puede eliminar: el usuario tiene evaluaciones o registros asociados. Desactívalo en lugar de eliminarlo."
        )

    return {"detail": "Usuario eliminado"}


@router.get("/roles", response_model=list[RolResponse])
def list_roles(db: Session = Depends(get_db)):
    return db.query(Rol).all()


# ============================================================
# Carga masiva de usuarios: exportar / plantilla / importar
# ============================================================
IMPORT_COLUMNS = ["Usuario", "Nombre Completo", "Email", "Password", "Rol", "Acceso", "Colegios", "Estado"]


@router.get("/users/export/excel")
def export_users_excel(
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(require_admin)
):
    usuarios = db.query(Usuario).options(joinedload(Usuario.rol)).order_by(Usuario.id).all()
    colegios_by_id = {c.id: c.nombre for c in db.query(Colegio).all()}

    def colegios_legibles(colegio_id):
        if not colegio_id:
            return "Todos"
        nombres = []
        for t in str(colegio_id).split(","):
            t = t.strip()
            if t.isdigit():
                nombres.append(colegios_by_id.get(int(t), f"ID {t}"))
        return "; ".join(nombres) if nombres else "Todos"

    data = []
    for u in usuarios:
        data.append({
            "ID": u.id,
            "Usuario": u.username,
            "Nombre Completo": u.nombre_completo or "",
            "Email": u.email,
            "Rol": u.rol.nombre if u.rol else "",
            "Acceso": u.acceso or "",
            "Colegios": colegios_legibles(u.colegio_id),
            "IDs Colegios": u.colegio_id or "",
            "Estado": "Activo" if u.activo else "Inactivo",
        })

    df = pd.DataFrame(data, columns=["ID", "Usuario", "Nombre Completo", "Email", "Rol", "Acceso", "Colegios", "IDs Colegios", "Estado"])
    output = io.BytesIO()
    with pd.ExcelWriter(output, engine="openpyxl") as writer:
        df.to_excel(writer, index=False, sheet_name="Usuarios")
    output.seek(0)
    filename = f"usuarios_{datetime.now().strftime('%Y%m%d_%H%M%S')}.xlsx"
    return StreamingResponse(
        output, media_type=XLSX_MEDIA,
        headers={"Content-Disposition": f"attachment; filename={filename}"}
    )


@router.get("/users/export/template")
def export_users_template(
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(require_admin)
):
    # Hoja 1: plantilla con una fila de ejemplo
    ejemplo = pd.DataFrame([{
        "Usuario": "jperez",
        "Nombre Completo": "Juan Pérez",
        "Email": "jperez@colegio.cl",
        "Password": "Clave1234",
        "Rol": "utp",
        "Acceso": "visita",
        "Colegios": "1",
        "Estado": "Activo",
    }], columns=IMPORT_COLUMNS)

    # Hoja 2: referencia de roles y colegios válidos
    roles = [r.nombre for r in db.query(Rol).order_by(Rol.id).all()]
    colegios = db.query(Colegio).order_by(Colegio.id).all()
    ref_rows = []
    max_len = max(len(roles), len(colegios), len(ACCESOS_VALIDOS))
    accesos = sorted(ACCESOS_VALIDOS)
    for i in range(max_len):
        ref_rows.append({
            "Roles válidos": roles[i] if i < len(roles) else "",
            "Acceso válido": accesos[i] if i < len(accesos) else "",
            "ID Colegio": colegios[i].id if i < len(colegios) else "",
            "Nombre Colegio": colegios[i].nombre if i < len(colegios) else "",
        })
    ref = pd.DataFrame(ref_rows, columns=["Roles válidos", "Acceso válido", "ID Colegio", "Nombre Colegio"])

    output = io.BytesIO()
    with pd.ExcelWriter(output, engine="openpyxl") as writer:
        ejemplo.to_excel(writer, index=False, sheet_name="Plantilla")
        ref.to_excel(writer, index=False, sheet_name="Referencia")
    output.seek(0)
    return StreamingResponse(
        output, media_type=XLSX_MEDIA,
        headers={"Content-Disposition": "attachment; filename=plantilla_usuarios.xlsx"}
    )


@router.post("/users/import/excel")
async def import_users_excel(
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(require_admin)
):
    if not file.filename.endswith((".xlsx", ".xls")):
        raise HTTPException(status_code=400, detail="Formato no válido. Use Excel (.xlsx)")

    try:
        contents = await file.read()
        df = pd.read_excel(io.BytesIO(contents), sheet_name=0)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"No se pudo leer el archivo: {e}")

    for col in ["Usuario", "Email", "Password", "Rol"]:
        if col not in df.columns:
            raise HTTPException(status_code=400, detail=f"Falta la columna obligatoria: {col}")

    roles_by_name = {(r.nombre or "").lower(): r.id for r in db.query(Rol).all()}
    colegios = db.query(Colegio).all()
    colegios_by_id = {c.id: c.nombre for c in colegios}
    colegios_by_name = {c.nombre.lower(): c.id for c in colegios}

    def cell(row, name):
        if name not in df.columns:
            return None
        v = row.get(name)
        return None if (v is None or (isinstance(v, float) and pd.isna(v))) else v

    creados = 0
    errors = []

    for index, row in df.iterrows():
        fila = index + 2  # +1 encabezado, +1 base 1
        try:
            username = str(cell(row, "Usuario") or "").strip()
            email = str(cell(row, "Email") or "").strip()
            password = str(cell(row, "Password") or "").strip()
            rol_txt = str(cell(row, "Rol") or "").strip().lower()

            if not username:
                errors.append(f"Fila {fila}: 'Usuario' es obligatorio"); continue
            if not email:
                errors.append(f"Fila {fila}: 'Email' es obligatorio"); continue
            if not password:
                errors.append(f"Fila {fila}: 'Password' es obligatorio"); continue
            if rol_txt not in roles_by_name:
                errors.append(f"Fila {fila}: Rol '{rol_txt}' no existe"); continue

            acceso = str(cell(row, "Acceso") or "liderazgo").strip().lower()
            if acceso not in ACCESOS_VALIDOS:
                errors.append(f"Fila {fila}: Acceso '{acceso}' inválido (use liderazgo/visita/todos)"); continue

            try:
                colegio_id = _parse_colegios_cell(cell(row, "Colegios"), colegios_by_id, colegios_by_name)
            except ValueError as ve:
                errors.append(f"Fila {fila}: {ve}"); continue

            existente = db.query(Usuario).filter(
                or_(Usuario.username == username, Usuario.email == email)
            ).first()
            if existente:
                errors.append(f"Fila {fila}: '{username}' o '{email}' ya existe (omitido)"); continue

            nuevo = Usuario(
                username=username,
                nombre_completo=(str(cell(row, "Nombre Completo")).strip() if cell(row, "Nombre Completo") else None),
                email=email,
                password_hash=get_password_hash(password),
                rol_id=roles_by_name[rol_txt],
                acceso=acceso,
                colegio_id=colegio_id or None,
                activo=_parse_estado(cell(row, "Estado")),
            )
            db.add(nuevo)
            db.commit()
            creados += 1
        except IntegrityError:
            db.rollback()
            errors.append(f"Fila {fila}: usuario o email duplicado")
        except Exception as e:
            db.rollback()
            errors.append(f"Fila {fila}: Error - {e}")

    return {
        "message": f"Importación finalizada. {creados} usuario(s) creado(s).",
        "creados": creados,
        "errors": errors,
    }
