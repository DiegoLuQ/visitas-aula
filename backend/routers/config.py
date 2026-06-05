from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks
from fastapi.responses import PlainTextResponse
from sqlalchemy.orm import Session
from sqlalchemy import text
import io
import os
from datetime import datetime
from database import get_db, engine
from auth import get_current_user, get_current_active_user, require_admin
from models import Base, EmailRecipient, Evaluacion, EvaluacionEstado, Docente, Curso, ReportHistory
from utils.db_utils import generate_sql_dump
from utils.mailer import send_email_with_attachment
from utils.email import send_evaluation_email
from utils.report_templates import generate_weekly_report_html
from utils.tasks import scheduled_backup, scheduled_weekly_report

from pydantic import BaseModel

router = APIRouter(prefix="/config", tags=["config"])

class TestEmailRequest(BaseModel):
    email: str

@router.get("/info")
def get_config_info():
    return {
        "BASE_URL": os.getenv("BASE_URL")
    }

@router.get("/backup/sql")
async def get_backup_sql(
    db: Session = Depends(get_db),
    admin_user = Depends(require_admin)
):
    try:
        sql_content = generate_sql_dump(db)
        return PlainTextResponse(
            content=sql_content,
            headers={
                "Content-Disposition": f"attachment; filename=respaldo_{datetime.now().strftime('%Y%m%d_%H%M%S')}.sql"
            }
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error generando respaldo: {str(e)}")

@router.post("/backup/email")
async def send_backup_email(
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    admin_user = Depends(require_admin)
):
    sql_content = generate_sql_dump(db)
    filename = f"respaldo_{datetime.now().strftime('%Y%m%d_%H%M%S')}.sql"
    
    background_tasks.add_task(
        send_email_with_attachment,
        subject="Respaldo Manual - Pauta Liderazgo Docente",
        body=f"Se adjunta el respaldo manual de la base de datos generado el {datetime.now().strftime('%d/%m/%Y %H:%M:%S')}.",
        filename=filename,
        content=sql_content
    )
    
    return {"message": "El respaldo se está procesando y será enviado a su correo en unos instantes."}

# CRUD para destinatarios de correo adicionales
@router.get("/email-recipients")
def get_email_recipients(db: Session = Depends(get_db), current_user = Depends(get_current_active_user)):
    # Lectura permitida a cualquier usuario autenticado: el flujo "Enviar Pauta al
    # Docente" necesita listar los directivos (CC). La gestión (crear/editar/eliminar)
    # sigue restringida a administradores.
    from models import Colegio
    recipients = db.query(EmailRecipient).outerjoin(Colegio).all()
    # Mapear para incluir el nombre del colegio
    result = []
    for r in recipients:
        result.append({
            "id": r.id,
            "email": r.email,
            "nombre": r.nombre,
            "colegio_id": r.colegio_id,
            "colegio_nombre": r.colegio.nombre if r.colegio else "Todos los colegios",
            "recibe_reporte": r.recibe_reporte,
            "activo": r.activo
        })
    return result

@router.post("/email-recipients")
def create_email_recipient(data: dict, db: Session = Depends(get_db), admin_user = Depends(require_admin)):
    new_recipient = EmailRecipient(
        email=data.get("email"),
        nombre=data.get("nombre"),
        colegio_id=data.get("colegio_id") if data.get("colegio_id") else None,
        recibe_reporte=data.get("recibe_reporte", False),
        activo=data.get("activo", True)
    )
    db.add(new_recipient)
    db.commit()
    db.refresh(new_recipient)
    return new_recipient

@router.delete("/email-recipients/{id}")
def delete_email_recipient(id: int, db: Session = Depends(get_db), admin_user = Depends(require_admin)):
    recipient = db.query(EmailRecipient).filter(EmailRecipient.id == id).first()
    if not recipient:
        raise HTTPException(status_code=404, detail="Destinatario no encontrado")
    db.delete(recipient)
    db.commit()
    return {"message": "Destinatario eliminado"}

@router.put("/email-recipients/{id}")
def update_email_recipient(id: int, data: dict, db: Session = Depends(get_db), admin_user = Depends(require_admin)):
    recipient = db.query(EmailRecipient).filter(EmailRecipient.id == id).first()
    if not recipient:
        raise HTTPException(status_code=404, detail="Destinatario no encontrado")
        
    recipient.email = data.get("email", recipient.email)
    recipient.nombre = data.get("nombre", recipient.nombre)
    recipient.colegio_id = data.get("colegio_id") if data.get("colegio_id") else None
    recipient.recibe_reporte = data.get("recibe_reporte", recipient.recibe_reporte)
    recipient.activo = data.get("activo", recipient.activo)
    
    db.commit()
    db.refresh(recipient)
    return recipient


@router.post("/test-report-email")
async def test_report_email(
    request: TestEmailRequest,
    db: Session = Depends(get_db),
    admin_user = Depends(require_admin)
):
    from models import Colegio
    email = request.email
    try:
        # 1. Obtener colegios y conteos
        colegios = db.query(Colegio).all()
        data = {
            "GLOBAL": {
                "BORRADOR": db.query(Evaluacion).filter(Evaluacion.estado == EvaluacionEstado.BORRADOR).count(),
                "CERRADA": db.query(Evaluacion).filter(Evaluacion.estado == EvaluacionEstado.CERRADA).count(),
                "LISTO_PARA_FIRMA": db.query(Evaluacion).filter(Evaluacion.estado == EvaluacionEstado.LISTO_PARA_FIRMA).count(),
            },
            "SCHOOLS": {}
        }
        data["GLOBAL"]["TOTAL"] = sum(data["GLOBAL"].values())

        for col in colegios:
            c_borrador = db.query(Evaluacion).join(Evaluacion.docente).filter(
                Evaluacion.estado == EvaluacionEstado.BORRADOR,
                Evaluacion.docente.has(colegio_id=col.id)
            ).count()
            c_cerrada = db.query(Evaluacion).join(Evaluacion.docente).filter(
                Evaluacion.estado == EvaluacionEstado.CERRADA,
                Evaluacion.docente.has(colegio_id=col.id)
            ).count()
            c_listo = db.query(Evaluacion).join(Evaluacion.docente).filter(
                Evaluacion.estado == EvaluacionEstado.LISTO_PARA_FIRMA,
                Evaluacion.docente.has(colegio_id=col.id)
            ).count()
            
            data["SCHOOLS"][col.nombre] = {
                "BORRADOR": c_borrador,
                "CERRADA": c_cerrada,
                "LISTO_PARA_FIRMA": c_listo,
                "TOTAL": c_borrador + c_cerrada + c_listo
            }

        # 2. Últimos borradores
        latest_drafts_db = db.query(Evaluacion).filter(
            Evaluacion.estado == EvaluacionEstado.BORRADOR
        ).order_by(Evaluacion.fecha.desc()).limit(5).all()

        latest_drafts = []
        for d in latest_drafts_db:
            latest_drafts.append({
                "id": d.id,
                "docente": d.docente.nombre if d.docente else "N/A",
                "curso": f"{d.curso.nivel.nombre} {d.curso.letra}" if d.curso and d.curso.nivel else "N/A",
                "fecha": d.fecha.strftime("%d/%m/%Y") if d.fecha else "N/A"
            })

        # 3. Generar HTML
        html_content = generate_weekly_report_html(data, latest_drafts)

        # 4. Enviar correo
        success = send_evaluation_email(
            to_emails=[email],
            subject="Resumen Semanal de Acompañamiento Liderazgo",
            body="Este es un reporte de prueba segmentado por colegio.",
            body_html=html_content,
            school_type="MC"
        )

        return {"message": f"Reporte de prueba enviado exitosamente a {email}"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/weekly-stats")
def get_weekly_stats(
    db: Session = Depends(get_db)
):
    from models import Colegio
    try:
        colegios = db.query(Colegio).all()
        data = {
            "GLOBAL": {
                "BORRADOR": db.query(Evaluacion).filter(Evaluacion.estado == EvaluacionEstado.BORRADOR).count(),
                "CERRADA": db.query(Evaluacion).filter(Evaluacion.estado == EvaluacionEstado.CERRADA).count(),
                "LISTO_PARA_FIRMA": db.query(Evaluacion).filter(Evaluacion.estado == EvaluacionEstado.LISTO_PARA_FIRMA).count(),
            },
            "SCHOOLS": {}
        }
        data["GLOBAL"]["TOTAL"] = sum(data["GLOBAL"].values())

        for col in colegios:
            c_borrador = db.query(Evaluacion).join(Evaluacion.docente).filter(
                Evaluacion.estado == EvaluacionEstado.BORRADOR,
                Evaluacion.docente.has(colegio_id=col.id)
            ).count()
            c_cerrada = db.query(Evaluacion).join(Evaluacion.docente).filter(
                Evaluacion.estado == EvaluacionEstado.CERRADA,
                Evaluacion.docente.has(colegio_id=col.id)
            ).count()
            c_listo = db.query(Evaluacion).join(Evaluacion.docente).filter(
                Evaluacion.estado == EvaluacionEstado.LISTO_PARA_FIRMA,
                Evaluacion.docente.has(colegio_id=col.id)
            ).count()
            
            data["SCHOOLS"][col.nombre] = {
                "BORRADOR": c_borrador,
                "CERRADA": c_cerrada,
                "LISTO_PARA_FIRMA": c_listo,
                "TOTAL": c_borrador + c_cerrada + c_listo
            }

        latest_drafts_db = db.query(Evaluacion).filter(
            Evaluacion.estado == EvaluacionEstado.BORRADOR
        ).order_by(Evaluacion.fecha.desc()).limit(5).all()

        latest_drafts = []
        for d in latest_drafts_db:
            latest_drafts.append({
                "id": d.id,
                "docente": d.docente.nombre if d.docente else "N/A",
                "curso": f"{d.curso.nivel.nombre} {d.curso.letra}" if d.curso and d.curso.nivel else "N/A",
                "fecha": d.fecha.strftime("%d/%m/%Y") if d.fecha else "N/A"
            })

        return {
            "data": data,
            "latest_drafts": latest_drafts
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error al obtener estadísticas: {str(e)}")

@router.post(
    "/execute-report", 
    tags=["Automatización de Tareas"],
    summary="Ejecutar Reporte de Gestión Manual",
    description="""
    Inicia manualmente la generación del reporte de gestión (Mensual/Semanal). 
    Internamente:
    1. Consulta destinatarios activos con permiso en la DB.
    2. Recopila estadísticas globales y por colegio.
    3. Obtiene los 5 acompañamientos más recientes.
    4. Genera el HTML y lo envía por correo electrónico.
    El proceso se ejecuta en segundo plano.
    """
)
async def execute_report(
    background_tasks: BackgroundTasks,
    admin_user = Depends(require_admin)
):
    """Ejecuta el reporte semanal programado manualmente."""
    background_tasks.add_task(scheduled_weekly_report)
    return {"message": "Ejecución de reporte semanal iniciada en segundo plano."}

@router.post(
    "/execute-backup", 
    tags=["Automatización de Tareas"],
    summary="Ejecutar Respaldo de Base de Datos",
    description="""
    Inicia manualmente el proceso de respaldo de seguridad. 
    1. Genera un volcado SQL completo de todas las tablas y datos.
    2. Comprime la información y la envía como adjunto al correo de administración configurado.
    Útil para auditorías o migraciones rápidas.
    """
)
async def execute_backup(
    background_tasks: BackgroundTasks,
    admin_user = Depends(require_admin)
):
    """Ejecuta el respaldo semanal programado manualmente."""
    background_tasks.add_task(scheduled_backup)
    return {"message": "Ejecución de respaldo semanal iniciada en segundo plano."}

@router.get(
    "/report-history", 
    tags=["Automatización de Tareas"],
    summary="Ver Historial de Tareas",
    description="Permite consultar el log de auditoría de todos los reportes y respaldos enviados, incluyendo su estado (ÉXITO/ERROR) y destinatarios."
)
def get_report_history(
    db: Session = Depends(get_db),
    admin_user = Depends(require_admin)
):
    """Obtiene el historial de envíos de reportes y respaldos."""
    logs = db.query(ReportHistory).order_by(ReportHistory.fecha_envio.desc()).limit(50).all()
    return logs

