from datetime import datetime
import os
from database import SessionLocal
from utils.db_utils import generate_sql_dump
from utils.mailer import send_email_with_attachment
from utils.email import send_evaluation_email
from utils.report_templates import generate_weekly_report_html
from models import Evaluacion, EvaluacionEstado, Colegio, EmailRecipient, ReportHistory

def log_report(db, tipo, recipients_list, success, error_msg=None):
    """Registra el envío en el historial para auditoría."""
    try:
        log = ReportHistory(
            tipo_reporte=tipo,
            destinatarios=", ".join(recipients_list),
            status="EXITO" if success else "ERROR",
            error_message=error_msg
        )
        db.add(log)
        db.commit()
    except Exception as e:
        print(f"Error registrando log: {e}")

def scheduled_backup():
    print(f"Ejecutando respaldo programado: {datetime.now()}")
    db = SessionLocal()
    recipients = [os.getenv("REPORT_TO_EMAIL")] # Backup sigue usando .env o podrías personalizarlo
    try:
        sql_content = generate_sql_dump(db)
        filename = f"respaldo_auto_{datetime.now().strftime('%Y%m%d_%H%M%S')}.sql"
        send_email_with_attachment(
            subject="Respaldo Automático Semanal - Liderazgo Docente",
            body=f"Se adjunta el respaldo automático de los viernes. Generado: {datetime.now().strftime('%d/%m/%Y %H:%M:%S')}.",
            filename=filename,
            content=sql_content
        )
        log_report(db, "BACKUP", recipients, True)
    except Exception as e:
        print(f"Error en respaldo programado: {str(e)}")
        log_report(db, "BACKUP", recipients, False, str(e))
    finally:
        db.close()

def scheduled_weekly_report():
    print(f"Generando reporte semanal programado: {datetime.now()}")
    db = SessionLocal()
    try:
        # 1. Obtener destinatarios desde la base de datos (Opción B)
        destinatarios_db = db.query(EmailRecipient).filter(
            EmailRecipient.recibe_reporte == True,
            EmailRecipient.activo == True
        ).all()
        
        to_emails = [r.email for r in destinatarios_db]
        
        if not to_emails:
            print("Aviso: No hay destinatarios marcados para recibir el reporte semanal.")
            # Opcional: usar el de reserva si no hay ninguno en DB
            fallback = os.getenv("REPORT_TO_EMAIL")
            if fallback:
                to_emails = [fallback]
                print(f"Usando destinatario de respaldo: {fallback}")
            else:
                return

        # 2. Obtener todos los colegios
        colegios = db.query(Colegio).all()
        
        # 3. Estructura de datos
        data = {
            "GLOBAL": {
                "BORRADOR": db.query(Evaluacion).filter(Evaluacion.estado == EvaluacionEstado.BORRADOR).count(),
                "CERRADA": db.query(Evaluacion).filter(Evaluacion.estado == EvaluacionEstado.CERRADA).count(),
                "LISTO_PARA_FIRMA": db.query(Evaluacion).filter(Evaluacion.estado == EvaluacionEstado.LISTO_PARA_FIRMA).count(),
            },
            "SCHOOLS": {}
        }
        data["GLOBAL"]["TOTAL"] = sum(data["GLOBAL"].values())

        # 4. Conteos por colegio
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

        # 5. Obtener últimos borradores (top 5 global)
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

        # 6. Generar HTML
        base_url = os.getenv("BASE_URL", "http://127.0.0.1:5502/frontend")
        html_content = generate_weekly_report_html(data, latest_drafts, base_url=base_url)

        # 7. Enviar correo
        send_evaluation_email(
            to_emails=to_emails,
            subject="Resumen Semanal de Acompañamiento Liderazgo",
            body="Resumen semanal de gestión pedagógica por colegio.",
            body_html=html_content,
            school_type="MC"
        )
        print(f"Reporte semanal enviado a {to_emails}")
        log_report(db, "SEMANAL", to_emails, True)
    except Exception as e:
        print(f"Error en reporte semanal programado: {str(e)}")
        log_report(db, "SEMANAL", to_emails if 'to_emails' in locals() else [], False, str(e))
    finally:
        db.close()

