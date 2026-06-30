from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from database import engine, Base, SessionLocal
from routers import auth, colegios, niveles, cursos, asignaturas, docentes, dimensiones, evaluaciones, config, totp, plantillas, metas
from apscheduler.schedulers.background import BackgroundScheduler
from utils.db_utils import generate_sql_dump
from utils.mailer import send_email_with_attachment
from utils.websocket_manager import manager
from datetime import datetime
import contextlib

Base.metadata.create_all(bind=engine)


# ============================================================
# Auto-Migración: Tokens UUID para Actas Seguras
# Se ejecuta al arrancar el servidor (seguro para re-ejecuciones)
# ============================================================
def auto_migrate_tokens():
    """Agrega columnas token_full y token_pedagogico si no existen,
    y genera UUIDs para evaluaciones que no los tengan."""
    import uuid
    from sqlalchemy import text, inspect
    from models import Evaluacion
    
    try:
        inspector = inspect(engine)
        columns = [col['name'] for col in inspector.get_columns('eval_evaluaciones')]
        
        if 'token_full' not in columns or 'token_pedagogico' not in columns:
            print("[MIGRACIÓN] Agregando columnas de tokens UUID...")
            with engine.connect() as conn:
                if 'token_full' not in columns:
                    conn.execute(text("ALTER TABLE eval_evaluaciones ADD COLUMN token_full VARCHAR(50) NULL"))
                    conn.execute(text("CREATE INDEX idx_token_full ON eval_evaluaciones(token_full)"))
                if 'token_pedagogico' not in columns:
                    conn.execute(text("ALTER TABLE eval_evaluaciones ADD COLUMN token_pedagogico VARCHAR(50) NULL"))
                    conn.execute(text("CREATE INDEX idx_token_pedagogico ON eval_evaluaciones(token_pedagogico)"))
                conn.commit()
            print("[MIGRACIÓN] Columnas creadas exitosamente.")
        
        # Poblar evaluaciones sin tokens
        db = SessionLocal()
        sin_token = db.query(Evaluacion).filter(
            (Evaluacion.token_full == None) | (Evaluacion.token_pedagogico == None)
        ).all()
        
        if sin_token:
            print(f"[MIGRACIÓN] Generando UUIDs para {len(sin_token)} evaluaciones...")
            for ev in sin_token:
                if not ev.token_full:
                    ev.token_full = str(uuid.uuid4())
                if not ev.token_pedagogico:
                    ev.token_pedagogico = str(uuid.uuid4())
            db.commit()
            print("[MIGRACIÓN] UUIDs generados exitosamente.")
        
        db.close()
    except Exception as e:
        print(f"[MIGRACIÓN] Advertencia (no crítica): {e}")

def auto_migrate_reporting():
    """Migración para la tabla de destinatarios y el historial de reportes."""
    from sqlalchemy import text, inspect
    try:
        inspector = inspect(engine)
        
        # 1. Crear tabla de historial si no existe (SQLAlchemy lo hace por nosotros con create_all, pero por seguridad)
        Base.metadata.create_all(bind=engine)
        
        # 2. Agregar columna recibe_reporte si no existe
        columns = [col['name'] for col in inspector.get_columns('cfg_email_recipients')]
        if 'recibe_reporte' not in columns:
            print("[MIGRACIÓN] Agregando columna recibe_reporte...")
            with engine.connect() as conn:
                conn.execute(text("ALTER TABLE cfg_email_recipients ADD COLUMN recibe_reporte BOOLEAN DEFAULT FALSE"))
                conn.commit()
            print("[MIGRACIÓN] Columna agregada.")
            
    except Exception as e:
        print(f"[MIGRACIÓN REPORTES] Advertencia: {e}")

def auto_migrate_user_colegio():
    """Migración para agregar colegio_id a auth_usuarios."""
    from sqlalchemy import text, inspect
    try:
        inspector = inspect(engine)
        columns = [col['name'] for col in inspector.get_columns('auth_usuarios')]
        if 'colegio_id' not in columns:
            print("[MIGRACIÓN] Agregando columna colegio_id a auth_usuarios...")
            with engine.connect() as conn:
                conn.execute(text("ALTER TABLE auth_usuarios ADD COLUMN colegio_id VARCHAR(50) NULL"))
                conn.commit()
            print("[MIGRACIÓN] Columna agregada.")
    except Exception as e:
        print(f"[MIGRACIÓN USUARIO] Advertencia: {e}")

def auto_migrate_metas():
    """Migra cfg_metas del esquema viejo (por colegio+rol) al nuevo (por usuario).

    Como la tabla es nueva y solo contenía metas de prueba, si no tiene la columna
    'usuario_id' se recrea con el esquema actual del modelo.
    """
    from sqlalchemy import text, inspect
    try:
        inspector = inspect(engine)
        if 'cfg_metas' not in inspector.get_table_names():
            return  # create_all la creará con el esquema nuevo
        cols = [c['name'] for c in inspector.get_columns('cfg_metas')]
        if 'usuario_id' not in cols:
            print("[MIGRACIÓN] Recreando cfg_metas con esquema por usuario...")
            with engine.connect() as conn:
                conn.execute(text("DROP TABLE cfg_metas"))
                conn.commit()
            Base.metadata.create_all(bind=engine)
            print("[MIGRACIÓN] cfg_metas recreada.")
    except Exception as e:
        print(f"[MIGRACIÓN METAS] Advertencia: {e}")

def auto_migrate_user_nombre_completo():
    """Migración para agregar nombre_completo a auth_usuarios."""
    from sqlalchemy import text, inspect
    try:
        inspector = inspect(engine)
        columns = [col['name'] for col in inspector.get_columns('auth_usuarios')]
        if 'nombre_completo' not in columns:
            print("[MIGRACIÓN] Agregando columna nombre_completo a auth_usuarios...")
            with engine.connect() as conn:
                conn.execute(text("ALTER TABLE auth_usuarios ADD COLUMN nombre_completo VARCHAR(150) NULL"))
                conn.commit()
            print("[MIGRACIÓN] Columna nombre_completo agregada.")
    except Exception as e:
        print(f"[MIGRACIÓN USUARIO NOMBRE] Advertencia: {e}")

def auto_migrate_visitas_extras():
    """Migración para agregar las columnas faltantes en eval_plantillas y eval_respuestas."""
    from sqlalchemy import text, inspect
    try:
        inspector = inspect(engine)
        
        # 1. Agregar columna nombre_largo a eval_plantillas
        columns_plantillas = [col['name'] for col in inspector.get_columns('eval_plantillas')]
        if 'nombre_largo' not in columns_plantillas:
            print("[MIGRACIÓN] Agregando columna nombre_largo a eval_plantillas...")
            with engine.connect() as conn:
                conn.execute(text("ALTER TABLE eval_plantillas ADD COLUMN nombre_largo VARCHAR(255) NULL"))
                conn.commit()
            print("[MIGRACIÓN] Columna nombre_largo agregada a eval_plantillas.")

        # 1b. Agregar columna slug (con índice único) a eval_plantillas
        if 'slug' not in columns_plantillas:
            print("[MIGRACIÓN] Agregando columna slug a eval_plantillas...")
            with engine.connect() as conn:
                conn.execute(text("ALTER TABLE eval_plantillas ADD COLUMN slug VARCHAR(20) NULL"))
                conn.execute(text("CREATE UNIQUE INDEX ix_eval_plantillas_slug ON eval_plantillas(slug)"))
                conn.commit()
            print("[MIGRACIÓN] Columna slug agregada a eval_plantillas.")

        # 1c. Agregar columna colegio_id a eval_plantillas (plantillas por colegio)
        if 'colegio_id' not in columns_plantillas:
            print("[MIGRACIÓN] Agregando columna colegio_id a eval_plantillas...")
            with engine.connect() as conn:
                conn.execute(text("ALTER TABLE eval_plantillas ADD COLUMN colegio_id INTEGER NULL"))
                conn.commit()
            print("[MIGRACIÓN] Columna colegio_id agregada a eval_plantillas.")

        # 1d. Agregar columna formato a eval_plantillas (diseño del formulario) + backfill
        if 'formato' not in columns_plantillas:
            print("[MIGRACIÓN] Agregando columna formato a eval_plantillas...")
            with engine.connect() as conn:
                conn.execute(text("ALTER TABLE eval_plantillas ADD COLUMN formato VARCHAR(20) NULL"))
                # Backfill de las plantillas base existentes
                conn.execute(text("UPDATE eval_plantillas SET formato='LIDERAZGO' WHERE id=1 AND formato IS NULL"))
                conn.execute(text("UPDATE eval_plantillas SET formato='ORIENTACION' WHERE id=2 AND formato IS NULL"))
                conn.execute(text("UPDATE eval_plantillas SET formato='UTP' WHERE id=3 AND formato IS NULL"))
                conn.commit()
            print("[MIGRACIÓN] Columna formato agregada a eval_plantillas.")

        # 2. Agregar columna estrategia a eval_respuestas
        columns_respuestas = [col['name'] for col in inspector.get_columns('eval_respuestas')]
        if 'estrategia' not in columns_respuestas:
            print("[MIGRACIÓN] Agregando columna estrategia a eval_respuestas...")
            with engine.connect() as conn:
                conn.execute(text("ALTER TABLE eval_respuestas ADD COLUMN estrategia TEXT NULL"))
                conn.commit()
            print("[MIGRACIÓN] Columna estrategia agregada a eval_respuestas.")
            
    except Exception as e:
        print(f"[MIGRACIÓN VISITAS EXTRAS] Advertencia: {e}")

def auto_migrate_roles():
    """Reconcilia auth_roles con el conjunto canónico de roles del sistema.

    Roles canónicos: admin, director, utp, liderazgo, orien_conv, pie, inspectoria, usuario.
    - Mantiene 'admin' (id 1) y 'usuario' (id 3), de los que dependen la lógica
      de permisos (require_admin) y el rol por defecto de auth_usuarios.
    - Crea los roles faltantes.
    - Elimina los roles obsoletos (p. ej. 'auditor', 'observador'), reasignando
      sus usuarios al rol 'usuario' para no violar la llave foránea.
    Seguro para re-ejecuciones.
    """
    from models import Rol, Usuario

    CANONICAL = ["admin", "director", "utp", "liderazgo", "orien_conv", "pie", "inspectoria", "usuario"]
    try:
        db = SessionLocal()

        existing = db.query(Rol).all()
        by_name = {(r.nombre or "").lower(): r for r in existing}

        # 1. Crear los roles faltantes
        creados = False
        for nombre in CANONICAL:
            if nombre not in by_name:
                db.add(Rol(nombre=nombre))
                creados = True
                print(f"[MIGRACIÓN ROLES] Creando rol '{nombre}'")
        if creados:
            db.commit()

        # 2. Eliminar roles que ya no pertenecen al conjunto canónico
        existing = db.query(Rol).all()
        usuario_rol = next((r for r in existing if (r.nombre or "").lower() == "usuario"), None)

        for r in existing:
            if (r.nombre or "").lower() not in CANONICAL:
                if usuario_rol:
                    afectados = db.query(Usuario).filter(Usuario.rol_id == r.id).all()
                    for u in afectados:
                        u.rol_id = usuario_rol.id
                    if afectados:
                        print(f"[MIGRACIÓN ROLES] Reasignando {len(afectados)} usuario(s) "
                              f"del rol '{r.nombre}' a 'usuario'")
                print(f"[MIGRACIÓN ROLES] Eliminando rol obsoleto '{r.nombre}'")
                db.delete(r)
        db.commit()
        db.close()
    except Exception as e:
        print(f"[MIGRACIÓN ROLES] Advertencia: {e}")


def auto_migrate_pdf_visitas():
    """Soporte para visitas históricas subidas como PDF.

    - Crea la tabla pdf_visita (create_all ya la genera; se reasegura).
    - Hace nullable curso_id y asignatura_id en eval_evaluaciones, porque las
      visitas subidas solo registran docente, plantilla, usuario y fechas.
    - Asegura la carpeta de almacenamiento de los PDF.
    """
    import os as _os
    from sqlalchemy import text, inspect
    try:
        Base.metadata.create_all(bind=engine)

        inspector = inspect(engine)
        cols = {c['name']: c for c in inspector.get_columns('eval_evaluaciones')}
        with engine.connect() as conn:
            for col in ('curso_id', 'asignatura_id'):
                if col in cols and not cols[col].get('nullable', True):
                    print(f"[MIGRACIÓN] Haciendo nullable {col} en eval_evaluaciones...")
                    conn.execute(text(f"ALTER TABLE eval_evaluaciones MODIFY {col} INTEGER NULL"))
            conn.commit()

        # Carpeta de almacenamiento de PDFs (backend/uploads/pdf_visitas)
        uploads_dir = _os.path.join(_os.path.dirname(_os.path.abspath(__file__)), "uploads", "pdf_visitas")
        _os.makedirs(uploads_dir, exist_ok=True)
    except Exception as e:
        print(f"[MIGRACIÓN PDF VISITAS] Advertencia: {e}")


def auto_migrate_pie_plantilla():
    """Crea la plantilla PIE si no existe con sus dimensiones e indicadores."""
    import json
    from models import Plantilla, Dimension, Subdimension
    try:
        db = SessionLocal()
        pie_exist = db.query(Plantilla).filter(Plantilla.slug == "PIE").first()
        if not pie_exist:
            print("[MIGRACIÓN] Inicializando plantilla PIE (Informe de Acompañamiento)...")
            config = {
                "escala": "4_niveles",
                "niveles": [
                    {"valor": 0, "nombre": "N/O", "color": "slate"},
                    {"valor": 1, "nombre": "Deficiente", "color": "rose"},
                    {"valor": 2, "nombre": "Básico", "color": "amber"},
                    {"valor": 3, "nombre": "Competente", "color": "emerald"},
                    {"valor": 4, "nombre": "Excelente", "color": "indigo"}
                ],
                "opcion_no_observado": {
                    "permitido": True,
                    "valor_guardado": 0,
                    "excluir_del_calculo": True
                }
            }
            plantilla = Plantilla(
                nombre="Informe de Acompañamiento al Aula Común PIE",
                nombre_largo="Informe de Acompañamiento al Aula Común PIE",
                slug="PIE",
                tipo="VISITA",
                formato="PIE",
                colegio_id=None,
                config_puntuacion=json.dumps(config),
                activa=True
            )
            db.add(plantilla)
            db.flush()

            dims_data = [
                {
                    "nombre": "CO-ENSEÑANZA",
                    "indicadores": [
                        "Se evidencia enseñanza complementaria.",
                        "Evidencia enseñanza en equipo (co-enseñanza)."
                    ]
                },
                {
                    "nombre": "ESTRUCTURA DE LA CLASE",
                    "indicadores": [
                        "Participa del saludo o saluda al grupo curso al iniciar su actividad.",
                        "Maneja la planificación o contenidos de la clase, lo que le permite intervenir en la misma.",
                        "Interviene en el inicio.",
                        "Participa activamente del desarrollo de la clase.",
                        "Ejecuta el cierre mediante la retroalimentación o síntesis de lo enseñado.",
                        "Se hace uso adecuado del tiempo, permitiendo ejecutar todos los momentos de la clase.",
                        "Se evidencia material digital, concreto u otro recurso apropiado para facilitar los aprendizajes y el acceso a los objetivos.",
                        "Promueve la participación de los estudiantes, especialmente los que presentan NEE.",
                        "Realiza monitoreo constante de los aprendizajes de los estudiantes.",
                        "Complementa con diferentes estrategias los momentos de la clase para el logro de habilidades cognitivas según la diversidad del grupo curso.",
                        "Realiza o participa en pausas activas durante la clase o cambio de hora."
                    ]
                },
                {
                    "nombre": "AMBIENTE PARA EL APRENDIZAJE",
                    "indicadores": [
                        "Se cumple con el protocolo mencionando las normas dentro de la clase.",
                        "Maneja de forma adecuada la disciplina de los estudiantes.",
                        "Mantiene una relación cercana con los estudiantes.",
                        "Contribuye a mantener un buen ambiente y orden a nivel del aula.",
                        "Cumple con los horarios de inicio de clases.",
                        "Se observan factores externos que interfieren en el desarrollo adecuado de la clase.",
                        "Emplea Lenguaje formal y cálido en el trato con los estudiantes.",
                        "Evidencia empleo de refuerzos positivos frente a las conductas o respuestas adecuadas de los estudiantes."
                    ]
                }
            ]

            for idx, d in enumerate(dims_data):
                dim = Dimension(
                    plantilla_id=plantilla.id,
                    nombre=d["nombre"],
                    orden=idx + 1
                )
                db.add(dim)
                db.flush()

                for s_idx, ind_text in enumerate(d["indicadores"]):
                    sub = Subdimension(
                        dimension_id=dim.id,
                        nombre=f"Indicador {idx + 1}.{s_idx + 1}",
                        descripcion=ind_text,
                        orden=s_idx + 1
                    )
                    db.add(sub)
            db.commit()
            print(f"[MIGRACIÓN] Plantilla PIE creada con ID: {plantilla.id}")
        db.close()
    except Exception as e:
        print(f"[MIGRACIÓN PIE] Error: {e}")


def auto_migrate_tipo_funcionario():
    """Crea la tabla cat_tipo_funcionario, la siembra con los tipos base
    y agrega la columna id_tipo_funcionario a cat_docentes si no existe."""
    from sqlalchemy import text, inspect
    try:
        inspector = inspect(engine)

        # 1. Sembrar tipos base en cat_tipo_funcionario (create_all ya creó la tabla).
        if 'cat_tipo_funcionario' in inspector.get_table_names():
            with engine.connect() as conn:
                existentes = conn.execute(text("SELECT COUNT(*) FROM cat_tipo_funcionario")).scalar()
                if not existentes:
                    print("[MIGRACIÓN] Sembrando tipos de funcionario base...")
                    conn.execute(text("INSERT INTO cat_tipo_funcionario (nombre) VALUES ('Docente'), ('Especialista')"))
                    conn.commit()
                    print("[MIGRACIÓN] Tipos de funcionario base creados.")

        # 2. Agregar columna id_tipo_funcionario a cat_docentes
        columns_docentes = [col['name'] for col in inspector.get_columns('cat_docentes')]
        if 'id_tipo_funcionario' not in columns_docentes:
            print("[MIGRACIÓN] Agregando columna id_tipo_funcionario a cat_docentes...")
            with engine.connect() as conn:
                conn.execute(text("ALTER TABLE cat_docentes ADD COLUMN id_tipo_funcionario INTEGER NULL"))
                conn.commit()
            print("[MIGRACIÓN] Columna id_tipo_funcionario agregada a cat_docentes.")

    except Exception as e:
        print(f"[MIGRACIÓN TIPO FUNCIONARIO] Advertencia: {e}")


auto_migrate_tokens()
auto_migrate_tipo_funcionario()
auto_migrate_reporting()
auto_migrate_user_colegio()
auto_migrate_user_nombre_completo()
auto_migrate_visitas_extras()
auto_migrate_roles()
auto_migrate_metas()
auto_migrate_pdf_visitas()
auto_migrate_pie_plantilla()


from utils.tasks import scheduled_backup, scheduled_weekly_report
import pytz
chile_tz = pytz.timezone('America/Santiago')

scheduler = BackgroundScheduler()
# Cada viernes (fri) a las 18:00 (6:00 PM) Chile
scheduler.add_job(scheduled_backup, 'cron', day_of_week='fri', hour=18, minute=0, timezone=chile_tz)
# Cada lunes (mon) a las 16:00 (4:00 PM) Chile
scheduler.add_job(scheduled_weekly_report, 'cron', day_of_week='mon', hour=16, minute=0, timezone=chile_tz)
scheduler.start()

print(f"[SISTEMA] Tareas automáticas reactivadas (Chile Time). Reporte: Lunes 16:00, Respaldo: Viernes 18:00")

app = FastAPI(
    title="API - Pauta de Liderazgo Docente",
    description="Sistema de evaluación de liderazgo docente con FastAPI",
    version="2.0.0"
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router)
app.include_router(colegios.router)
app.include_router(niveles.router)
app.include_router(cursos.router)
app.include_router(asignaturas.router)
app.include_router(docentes.router)
app.include_router(dimensiones.router)
app.include_router(evaluaciones.router)
app.include_router(config.router)
app.include_router(totp.router)
app.include_router(plantillas.router)
app.include_router(metas.router)


@app.websocket("/ws/evaluacion/{eval_id}")
async def websocket_endpoint(websocket: WebSocket, eval_id: int):
    await manager.connect(eval_id, websocket)
    try:
        while True:
            # Mantener conexión abierta
            await websocket.receive_text()
    except WebSocketDisconnect:
        manager.disconnect(eval_id, websocket)


@app.get("/")
def root():
    return {
        "message": "API Pauta de Liderazgo Docente",
        "version": "2.0.0",
        "status": "running"
    }


@app.get("/health")
def health_check():
    return {"status": "healthy"}
