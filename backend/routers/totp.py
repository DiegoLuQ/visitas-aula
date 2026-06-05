import pyotp
import logging
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from database import get_db
from models import Docente, Usuario
from auth import get_current_active_user, require_admin_or_auditor

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/totp", tags=["TOTP"])

@router.get("/setup/{docente_id}")
async def setup_totp(
    docente_id: int, 
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(require_admin_or_auditor)
):
    docente = db.query(Docente).filter(Docente.id == docente_id).first()
    if not docente:
        raise HTTPException(status_code=404, detail="Docente no encontrado")
    
    # Si ya tiene un secreto, opcionalmente podríamos resetearlo o informar
    # Por ahora, generamos uno nuevo cada vez que se pide el setup (antes de confirmar)
    temp_secret = pyotp.random_base32()
    
    # Generar URI para el QR
    # issuer_name: Nombre de tu app
    totp = pyotp.TOTP(temp_secret)
    provisioning_uri = totp.provisioning_uri(
        name=docente.email or docente.rut, 
        issuer_name="Liderazgo Docente"
    )
    
    return {
        "secret": temp_secret,
        "provisioning_uri": provisioning_uri
    }

@router.post("/confirm/{docente_id}")
async def confirm_totp(
    docente_id: int, 
    data: dict,  # {"secret": "...", "code": "123456"}
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(require_admin_or_auditor)
):
    docente = db.query(Docente).filter(Docente.id == docente_id).first()
    if not docente:
        raise HTTPException(status_code=404, detail="Docente no encontrado")
    
    secret = data.get("secret")
    code = data.get("code")
    
    if not secret or not code:
        raise HTTPException(status_code=400, detail="Secret y Code son requeridos")
    
    # Verificar el código con una ventana de tolerancia de 1 paso (30s antes/después)
    totp = pyotp.TOTP(secret)
    if totp.verify(code, valid_window=1):
        # Guardar el secreto en la base de datos de forma permanente
        docente.totp_secret = secret
        db.commit()
        logger.info(f"Autenticador vinculado exitosamente para docente ID {docente_id}")
        return {"message": "Autenticador vinculado exitosamente"}
    else:
        logger.warning(f"Fallo en vinculación de TOTP para docente ID {docente_id}: Código inválido")
        raise HTTPException(status_code=400, detail="Código de verificación inválido")

@router.get("/status/{docente_id}")
async def get_totp_status(
    docente_id: int,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_active_user)
):
    docente = db.query(Docente).filter(Docente.id == docente_id).first()
    if not docente:
        raise HTTPException(status_code=404, detail="Docente no encontrado")
        
    return {
        "is_enrolled": docente.totp_secret is not None
    }
