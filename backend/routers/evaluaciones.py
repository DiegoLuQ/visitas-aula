from fastapi import APIRouter, Depends, HTTPException, Query, File, UploadFile
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session, joinedload
from sqlalchemy import func, extract, or_
import logging
from typing import List, Optional
from jose import jwt, JWTError
import uuid
from datetime import datetime, date
from database import get_db
from models import Evaluacion, EvaluacionRespuesta, EvaluacionEstudiante, EvaluacionApoyo, FortalezaAspecto, Docente, Usuario, Plantilla, Colegio, Curso, Asignatura, EvaluacionEstado, EmailRecipient, DeletedEvaluation, Rol, Meta
from schemas import EvaluacionCreate, EvaluacionResponse, EvaluacionListResponse, EvaluacionUpdate
from auth import get_current_active_user, require_admin_or_auditor, SECRET_KEY, ALGORITHM
from utils.websocket_manager import manager
from utils.email import send_evaluation_email
import os

BASE_URL = os.getenv("BASE_URL", "http://localhost:8080")

router = APIRouter(prefix="/evaluaciones", tags=["Evaluaciones"])


def build_evaluacion_response(evaluacion: Evaluacion) -> dict:
    return {
        "id": evaluacion.id,
        "plantilla_id": evaluacion.plantilla_id,
        "usuario_id": evaluacion.usuario_id,
        "docente_id": evaluacion.docente_id,
        "curso_id": evaluacion.curso_id,
        "asignatura_id": evaluacion.asignatura_id,
        "observador_id": evaluacion.observador_id,
        "fecha": evaluacion.fecha,
        "duracion": evaluacion.duracion,
        "func_grupo": evaluacion.func_grupo,
        "promedio": evaluacion.promedio,
        "promedio_dim1": evaluacion.promedio_dim1,
        "promedio_dim2": evaluacion.promedio_dim2,
        "promedio_dim3": evaluacion.promedio_dim3,
        "promedio_dim4": evaluacion.promedio_dim4,
        "promedio_dim5": evaluacion.promedio_dim5,
        "orientacion": evaluacion.orientacion,
        "nivel_apoyo": evaluacion.nivel_apoyo,
        "comentarios": evaluacion.comentarios,
        "fecha_retro": evaluacion.fecha_retro,
        "modalidad_retro": evaluacion.modalidad_retro,
        "sintesis_retro": evaluacion.sintesis_retro,
        "acuerdos_mejora": evaluacion.acuerdos_mejora,
        "estado": evaluacion.estado.value if evaluacion.estado else "BORRADOR",
        "codigo_firma": evaluacion.codigo_firma,
        "token_full": evaluacion.token_full,
        "token_pedagogico": evaluacion.token_pedagogico,
        "fecha_firma_docente": evaluacion.fecha_firma_docente,
        "fecha_guardado": evaluacion.fecha_guardado,
        "docente": {
            "id": evaluacion.docente.id,
            "nombre": evaluacion.docente.nombre,
            "rut": evaluacion.docente.rut,
            "email": evaluacion.docente.email,
            "colegio_id": evaluacion.docente.colegio_id,
            "created_by": evaluacion.docente.created_by,
            "created_at": evaluacion.docente.created_at,
            "totp_secret": evaluacion.docente.totp_secret,
            "colegio": {
                "id": evaluacion.docente.colegio.id,
                "nombre": evaluacion.docente.colegio.nombre,
                "direccion": evaluacion.docente.colegio.direccion,
                "created_by": evaluacion.docente.colegio.created_by,
                "created_at": evaluacion.docente.colegio.created_at
            } if evaluacion.docente.colegio else None
        } if evaluacion.docente else None,
        "curso": {
            "id": evaluacion.curso.id,
            "nivel_id": evaluacion.curso.nivel_id,
            "letra": evaluacion.curso.letra,
            "nivel": {
                "id": evaluacion.curso.nivel.id,
                "nombre": evaluacion.curso.nivel.nombre,
                "orden": evaluacion.curso.nivel.orden
            } if evaluacion.curso.nivel else None,
            "created_by": evaluacion.curso.created_by,
            "created_at": evaluacion.curso.created_at
        } if evaluacion.curso else None,
        "asignatura": {
            "id": evaluacion.asignatura.id,
            "nombre": evaluacion.asignatura.nombre,
            "created_by": evaluacion.asignatura.created_by,
            "created_at": evaluacion.asignatura.created_at
        } if evaluacion.asignatura else None,
        "observador": {
            "id": evaluacion.observador.id,
            "username": evaluacion.observador.username,
            "nombre_completo": evaluacion.observador.nombre_completo,
            "email": evaluacion.observador.email,
            "rol_id": evaluacion.observador.rol_id,
            "activo": evaluacion.observador.activo,
            "created_at": evaluacion.observador.created_at
        } if evaluacion.observador else None,
        "respuestas": [
            {
                "id": r.id,
                "subdimension_id": r.subdimension_id,
                "valor": r.valor,
                "estrategia": r.estrategia
            }
            for r in evaluacion.respuestas
        ],
        "apoyos": [
            {
                "id": a.id,
                "apoyo": a.apoyo
            }
            for a in evaluacion.apoyos
        ],
        "fortalezas_aspectos": [
            {
                "id": fa.id,
                "tipo": fa.tipo,
                "contenido": fa.contenido
            }
            for fa in evaluacion.fortalezas_aspectos
        ],
        "estudiantes_observados": [
            {
                "id": e.id,
                "nombre_estudiante": e.nombre_estudiante,
                "conducta_observada": e.conducta_observada
            }
            for e in evaluacion.estudiantes_observados
        ]
    }


@router.get("/public/ver/{codigo}")
def get_public_evaluacion(codigo: str, db: Session = Depends(get_db)):
    # 1. Buscar evaluación por cualquiera de sus códigos (firma, full o pedagógico)
    evaluacion = db.query(Evaluacion).filter(
        or_(
            Evaluacion.codigo_firma == codigo,
            Evaluacion.token_full == codigo,
            Evaluacion.token_pedagogico == codigo
        )
    ).first()
    
    if not evaluacion:
        raise HTTPException(status_code=404, detail="Acompañamiento no encontrado o código inválido")
    
    if evaluacion.estado.value != "CERRADA":
        raise HTTPException(status_code=403, detail="El acompañamiento aún no está finalizado")
    
    # 2. Identificar modo de acceso
    is_pedagogico = (codigo == evaluacion.token_pedagogico)
    
    # 3. Construir respuesta base
    res = build_evaluacion_response(evaluacion)
    
    # Agregar metadatos de la plantilla y sus dimensiones
    res["formato"] = evaluacion.plantilla.formato if evaluacion.plantilla else "LIDERAZGO"
    res["plantilla_nombre"] = evaluacion.plantilla.nombre if evaluacion.plantilla else "Liderazgo"
    res["dimensiones_nombres"] = [
        d.nombre for d in sorted(evaluacion.plantilla.dimensiones, key=lambda x: x.orden or 0)
    ] if evaluacion.plantilla else []

    # Árbol completo de la plantilla (dimensiones -> indicadores) para el modal de desglose
    res["plantilla_detalle"] = [
        {
            "id": d.id,
            "nombre": d.nombre,
            "descripcion": d.descripcion,
            "orden": d.orden,
            "indicadores": [
                {
                    "id": s.id,
                    "nombre": s.nombre,
                    "descripcion": s.descripcion,
                    "orden": s.orden,
                }
                for s in sorted(d.subdimensiones, key=lambda x: x.orden or 0)
            ],
        }
        for d in sorted(evaluacion.plantilla.dimensiones, key=lambda x: x.orden or 0)
    ] if evaluacion.plantilla else []

    # 4. Scrubbing de Seguridad: Si es acceso pedagógico, eliminamos físicamente los datos numéricos
    if is_pedagogico:
        # Campos de promedios globales y por dimensión
        res["promedio"] = None
        res["promedio_dim1"] = None
        res["promedio_dim2"] = None
        res["promedio_dim3"] = None
        res["promedio_dim4"] = None
        res["promedio_dim5"] = None
        
        # Ocultar calores individuales de la rúbrica (evita que se puedan ver en la red)
        for r in res.get("respuestas", []):
            r["valor"] = 0 
            
        # Ocultar campos cualitativos de nivel (opcional, pero recomendado para consistencia pedagógica)
        res["func_grupo"] = "Información Restringida"
        res["orientacion"] = "Información Restringida"
        res["nivel_apoyo"] = "Información Restringida"
        
    return res


@router.post("/", response_model=EvaluacionResponse)
def crear_evaluacion(
    evaluacion_data: EvaluacionCreate,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_active_user)
):
    if current_user.rol_id == 2:
        raise HTTPException(status_code=403, detail="Los auditores no pueden crear evaluaciones")

    new_eval = Evaluacion(
        plantilla_id=evaluacion_data.plantilla_id,
        usuario_id=current_user.id,
        docente_id=evaluacion_data.docente_id,
        curso_id=evaluacion_data.curso_id,
        asignatura_id=evaluacion_data.asignatura_id,
        observador_id=current_user.id, # El observador SIEMPRE es el usuario logueado
        fecha=evaluacion_data.fecha,
        duracion=evaluacion_data.duracion,
        func_grupo=evaluacion_data.func_grupo,
        promedio=evaluacion_data.promedio,
        promedio_dim1=evaluacion_data.promedio_dim1,
        promedio_dim2=evaluacion_data.promedio_dim2,
        promedio_dim3=evaluacion_data.promedio_dim3,
        promedio_dim4=evaluacion_data.promedio_dim4,
        promedio_dim5=evaluacion_data.promedio_dim5,
        orientacion=evaluacion_data.orientacion,
        nivel_apoyo=evaluacion_data.nivel_apoyo,
        comentarios=evaluacion_data.comentarios,
        fecha_retro=evaluacion_data.fecha_retro,
        modalidad_retro=evaluacion_data.modalidad_retro,
        sintesis_retro=evaluacion_data.sintesis_retro,
        acuerdos_mejora=evaluacion_data.acuerdos_mejora
    )
    db.add(new_eval)
    db.flush()

    for resp in evaluacion_data.respuestas:
        db_resp = EvaluacionRespuesta(
            evaluacion_id=new_eval.id,
            subdimension_id=resp.subdimension_id,
            valor=resp.valor,
            estrategia=resp.estrategia
        )
        db.add(db_resp)

    for apoyo in evaluacion_data.apoyos:
        db_apoyo = EvaluacionApoyo(
            evaluacion_id=new_eval.id,
            apoyo=apoyo.apoyo
        )
        db.add(db_apoyo)

    for fa in evaluacion_data.fortalezas_aspectos:
        db_fa = FortalezaAspecto(
            evaluacion_id=new_eval.id,
            tipo=fa.tipo,
            contenido=fa.contenido
        )
        db.add(db_fa)

    if evaluacion_data.estudiantes_observados:
        for est in evaluacion_data.estudiantes_observados:
            db_est = EvaluacionEstudiante(
                evaluacion_id=new_eval.id,
                nombre_estudiante=est.nombre_estudiante,
                conducta_observada=est.conducta_observada
            )
            db.add(db_est)

    db.commit()
    db.refresh(new_eval)

    return build_evaluacion_response(new_eval)


@router.get("/", response_model=List[EvaluacionListResponse])
def listar_evaluaciones(
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_active_user)
):
    query = db.query(Evaluacion).options(
        joinedload(Evaluacion.docente).joinedload(Docente.colegio),
        joinedload(Evaluacion.curso).joinedload(Curso.nivel),
        joinedload(Evaluacion.asignatura),
        joinedload(Evaluacion.observador),
        joinedload(Evaluacion.plantilla)
    )

    # Join con Docente para poder filtrar por colegio
    query = query.join(Docente)

    if current_user.rol_id == 3:
        query = query.filter(Evaluacion.usuario_id == current_user.id)

    # Filtro por colegio_id del usuario (Seguridad)
    if current_user.colegio_id:
        try:
            ids = [int(id.strip()) for id in current_user.colegio_id.split(",") if id.strip()]
            if ids:
                query = query.filter(Docente.colegio_id.in_(ids))
        except ValueError:
            pass

    query = query.order_by(Evaluacion.fecha_guardado.desc())
    evaluaciones = query.all()

    result = []
    for e in evaluaciones:
        result.append({
            "id": e.id,
            "plantilla_id": e.plantilla_id,
            "plantilla_nombre": e.plantilla.nombre if e.plantilla else "N/A",
            "plantilla_slug": e.plantilla.slug if e.plantilla else "N/A",
            "plantilla_formato": e.plantilla.formato if e.plantilla else None,
            "fecha": e.fecha,
            "promedio": e.promedio,
            "func_grupo": e.func_grupo,
            "orientacion": e.orientacion,
            "docente_id": e.docente_id,
            "docente_nombre": e.docente.nombre if e.docente else None,
            "colegio_id": e.docente.colegio_id if e.docente else None,
            "colegio_nombre": e.docente.colegio.nombre if e.docente and e.docente.colegio else None,
            "curso_nombre": f"{e.curso.nivel.nombre} {e.curso.letra}" if e.curso and e.curso.nivel else None,
            "asignatura_nombre": e.asignatura.nombre if e.asignatura else None,
            "observador_id": e.observador_id,
            "observador_nombre": (e.observador.nombre_completo or e.observador.username) if e.observador else None,
            "usuario_id": e.usuario_id,
            "estado": e.estado.value if e.estado else "BORRADOR",
            "codigo_firma": e.codigo_firma,
            "fecha_guardado": e.fecha_guardado
        })
    return result


@router.get("/export/excel")
def exportar_excel(
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_active_user)
):
    query = db.query(Evaluacion).options(
        joinedload(Evaluacion.docente).joinedload(Docente.colegio),
        joinedload(Evaluacion.curso).joinedload(Curso.nivel),
        joinedload(Evaluacion.asignatura),
        joinedload(Evaluacion.observador),
        joinedload(Evaluacion.respuestas),
        joinedload(Evaluacion.fortalezas_aspectos)
    ).join(Docente)

    if current_user.rol_id == 3:
        query = query.filter(Evaluacion.usuario_id == current_user.id)

    # Filtro por colegio_id del usuario (Seguridad)
    if current_user.colegio_id:
        try:
            ids = [int(id.strip()) for id in current_user.colegio_id.split(",") if id.strip()]
            if ids:
                query = query.filter(Docente.colegio_id.in_(ids))
        except ValueError:
            pass

    evaluaciones = query.all()

    if not evaluaciones:
        raise HTTPException(status_code=404, detail="No hay evaluaciones para exportar")

    data = []
    for e in evaluaciones:
        fortalezas = [fa.contenido for fa in e.fortalezas_aspectos if fa.tipo == "fortaleza"]
        aspectos = [fa.contenido for fa in e.fortalezas_aspectos if fa.tipo == "aspecto"]

        row = {
            "ID": e.id,
            "Colegio": e.docente.colegio.nombre if e.docente and e.docente.colegio else "",
            "Docente": e.docente.nombre if e.docente else "",
            "RUT Docente": e.docente.rut if e.docente else "",
            "Curso": f"{e.curso.nivel.nombre} {e.curso.letra}" if e.curso and e.curso.nivel else "",
            "Asignatura": e.asignatura.nombre if e.asignatura else "",
            "Fecha Observación": e.fecha,
            "Observador": e.observador.username if e.observador else "",
            "Duración": e.duracion or "",
            "Promedio": e.promedio,
            "Funcionamiento Grupo": e.func_grupo,
            "Orientación": e.orientacion,
            "Nivel de Apoyo": e.nivel_apoyo,
            "Fortalezas": "; ".join(fortalezas),
            "Aspectos a Fortalecer": "; ".join(aspectos),
            "Comentarios": e.comentarios or "",
            "Fecha Guardado": e.fecha_guardado
        }

        for i in range(1, 16):
            row[f"Ind {i}"] = ""

        for resp in e.respuestas:
            if 1 <= resp.subdimension_id <= 15:
                row[f"Ind {resp.subdimension_id}"] = resp.valor if resp.valor > 0 else "N/A"

        data.append(row)

    df = pd.DataFrame(data)

    output = io.BytesIO()
    with pd.ExcelWriter(output, engine='openpyxl') as writer:
        df.to_excel(writer, index=False, sheet_name="Evaluaciones")

        worksheet = writer.sheets["Evaluaciones"]
        for idx in range(len(df.columns)):
            col_letter = chr(65 + idx) if idx < 26 else 'A' + chr(65 + idx - 26)
            max_length = max(df.iloc[:, idx].astype(str).map(len).max(), len(df.columns[idx])) + 2
            worksheet.column_dimensions[col_letter].width = min(max_length, 50)

    output.seek(0)
    filename = f"evaluaciones_liderazgo_{datetime.now().strftime('%Y%m%d_%H%M%S')}.xlsx"

    return StreamingResponse(
        output,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f"attachment; filename={filename}"}
    )


@router.get("/stats/dashboard")
def dashboard_stats(
    colegio_id: Optional[int] = Query(None),
    plantilla_id: Optional[int] = Query(None),
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(require_admin_or_auditor)
):
    # Join inicial con Docente para permitir todos los filtros de colegio
    query = db.query(Evaluacion).join(Docente)
    
    if colegio_id:
        query = query.filter(Docente.colegio_id == colegio_id)
    
    if plantilla_id:
        query = query.filter(Evaluacion.plantilla_id == plantilla_id)

    # Filtro MANDATORIO por colegio_id del usuario (Seguridad)
    if current_user.colegio_id:
        try:
            ids = [int(id.strip()) for id in current_user.colegio_id.split(",") if id.strip()]
            if ids:
                query = query.filter(Docente.colegio_id.in_(ids))
        except:
            pass

    if current_user.rol_id == 2:
        query = query.filter(Evaluacion.usuario_id == current_user.id)

    total = query.count()
    total_cerradas = query.filter(Evaluacion.estado == EvaluacionEstado.CERRADA).count()

    # Promedios y Docentes con join
    prom_query = db.query(func.avg(Evaluacion.promedio)).join(Docente)
    doc_query = db.query(func.count(func.distinct(Evaluacion.docente_id))).join(Docente)

    if colegio_id:
        prom_query = prom_query.filter(Docente.colegio_id == colegio_id)
        doc_query = doc_query.filter(Docente.colegio_id == colegio_id)
    
    if plantilla_id:
        prom_query = prom_query.filter(Evaluacion.plantilla_id == plantilla_id)
        # Nota: El conteo de docentes evaluados también debería filtrarse por la plantilla si queremos ser específicos
        doc_query = doc_query.filter(Evaluacion.plantilla_id == plantilla_id)

    if current_user.colegio_id:
        try:
            ids = [int(id.strip()) for id in current_user.colegio_id.split(",") if id.strip()]
            if ids:
                prom_query = prom_query.filter(Docente.colegio_id.in_(ids))
                doc_query = doc_query.filter(Docente.colegio_id.in_(ids))
        except:
            pass

    if current_user.rol_id == 2:
        prom_query = prom_query.filter(Evaluacion.usuario_id == current_user.id)
        doc_query = doc_query.filter(Evaluacion.usuario_id == current_user.id)

    promedio_general = prom_query.scalar() or 0
    total_docentes = doc_query.scalar() or 0

    return {
        "total_evaluaciones": total,
        "total_cerradas": total_cerradas,
        "promedio_general": round(promedio_general, 2),
        "total_docentes_evaluados": total_docentes
    }


@router.get("/stats")
def get_stats(
    colegio_id: Optional[int] = Query(None),
    asignatura_id: Optional[int] = Query(None),
    fecha_inicio: Optional[str] = Query(None),
    fecha_fin: Optional[str] = Query(None),
    anio: Optional[int] = Query(None),
    plataforma: Optional[str] = Query(None, description="liderazgo | visita (filtra por formato de plantilla)"),
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_active_user)
):
    query = db.query(Evaluacion).join(Docente).options(
        joinedload(Evaluacion.docente).joinedload(Docente.colegio),
        joinedload(Evaluacion.curso).joinedload(Curso.nivel),
        joinedload(Evaluacion.asignatura),
        joinedload(Evaluacion.plantilla)
    )
    if colegio_id:
        query = query.filter(Docente.colegio_id == int(colegio_id))

    # Filtro por colegio_id del usuario (Seguridad)
    if current_user.colegio_id:
        try:
            ids = [int(id.strip()) for id in current_user.colegio_id.split(",") if id.strip()]
            if ids:
                query = query.filter(Docente.colegio_id.in_(ids))
        except ValueError:
            pass

    if asignatura_id:
        query = query.filter(Evaluacion.asignatura_id == int(asignatura_id))

    # Filtrar en Python para máxima compatibilidad con Enums/Fechas
    evaluaciones_raw = query.options(joinedload(Evaluacion.docente)).all()
    
    evaluaciones = []
    for e in evaluaciones_raw:
        if e.estado != EvaluacionEstado.CERRADA:
            continue
        if anio:
            if not e.fecha_firma_docente or e.fecha_firma_docente.year != int(anio):
                continue
        evaluaciones.append(e)

    if fecha_inicio:
        try:
            start_dt = datetime.strptime(fecha_inicio, '%Y-%m-%d')
            query = query.filter(Evaluacion.fecha_firma_docente >= start_dt)
        except ValueError:
            pass
            
    if fecha_fin:
        try:
            end_dt = datetime.strptime(fecha_fin, '%Y-%m-%d')
            query = query.filter(Evaluacion.fecha_firma_docente <= end_dt)
        except ValueError:
            pass
            
    # Aseguramos que solo se consideren evaluaciones CERRADAS para estadísticas
    query = query.filter(Evaluacion.estado == EvaluacionEstado.CERRADA)
    evaluaciones = query.all()

    # Filtro por plataforma (según el formato de la plantilla)
    VISITA_FORMATOS = ("UTP", "ORIENTACION")
    if plataforma == "visita":
        evaluaciones = [e for e in evaluaciones
                        if e.plantilla and e.plantilla.formato in VISITA_FORMATOS]
    elif plataforma == "liderazgo":
        evaluaciones = [e for e in evaluaciones
                        if (not e.plantilla) or e.plantilla.formato not in VISITA_FORMATOS]

    total = len(evaluaciones)

    if not evaluaciones:
        return {
            "total_evaluaciones": 0,
            "promedio_global": 0,
            "promedios_dimensiones": [0, 0, 0, 0, 0],
            "distribucion_niveles": {"Bajo": 0, "En desarrollo": 0, "Adecuado": 0, "Alto": 0, "Muy alto": 0},
            "por_asignatura": {},
            "por_colegio": {},
            "por_curso": {},
            "por_mes": {m: 0 for m in range(1, 13)},
            "dimensiones_por_colegio": {},
            "por_docente": {},
            "por_tipo_pauta": {}
        }
        
    evaluaciones_con_promedio = [e.promedio for e in evaluaciones if e.promedio is not None]
    total_validos = len(evaluaciones_con_promedio)
    promedio_global = sum(evaluaciones_con_promedio) / total_validos if total_validos > 0 else 0
    
    dim_sums = [0.0] * 5
    dim_counts = [0] * 5
    for e in evaluaciones:
        if e.promedio_dim1 is not None: dim_sums[0] += e.promedio_dim1; dim_counts[0] += 1
        if e.promedio_dim2 is not None: dim_sums[1] += e.promedio_dim2; dim_counts[1] += 1
        if e.promedio_dim3 is not None: dim_sums[2] += e.promedio_dim3; dim_counts[2] += 1
        if e.promedio_dim4 is not None: dim_sums[3] += e.promedio_dim4; dim_counts[3] += 1
        if e.promedio_dim5 is not None: dim_sums[4] += e.promedio_dim5; dim_counts[4] += 1
        
    promedios_dims = [ round(dim_sums[i] / dim_counts[i], 2) if dim_counts[i] > 0 else 0 for i in range(5) ]
    
    # Armonización de Niveles (Bajo, Regular, Adecuado, Bueno, Muy bueno)
    niveles = {"Bajo": 0, "Regular": 0, "Adecuado": 0, "Bueno": 0, "Muy bueno": 0}
    for e in evaluaciones:
        p = e.promedio
        if p is None: continue
        if p < 2.0: niveles["Bajo"] += 1
        elif p < 3.0: niveles["Regular"] += 1
        elif p < 3.6: niveles["Adecuado"] += 1
        elif p < 4.5: niveles["Bueno"] += 1
        else: niveles["Muy bueno"] += 1
        
    # Agregación por Mes (Cantidad de Acompañamientos)
    por_mes = {m: 0 for m in range(1, 13)}
    for e in evaluaciones:
        if e.fecha_firma_docente:
            por_mes[e.fecha_firma_docente.month] += 1

    asig_stats = {}
    for e in evaluaciones:
        if e.promedio is None:  # las visitas de Orientación no tienen promedio numérico
            continue
        asig_name = e.asignatura.nombre if e.asignatura else "Sin asignatura"
        if asig_name not in asig_stats:
            asig_stats[asig_name] = {"suma": 0, "cuenta": 0}
        asig_stats[asig_name]["suma"] += e.promedio
        asig_stats[asig_name]["cuenta"] += 1

    por_asignatura = {name: round(s["suma"]/s["cuenta"], 2) for name, s in asig_stats.items() if s["cuenta"] > 0}

    col_stats = {}
    for e in evaluaciones:
        if e.promedio is None:
            continue
        col_name = e.docente.colegio.nombre if e.docente and e.docente.colegio else "Sin colegio"
        if col_name not in col_stats:
            col_stats[col_name] = {"suma": 0, "cuenta": 0}
        col_stats[col_name]["suma"] += e.promedio
        col_stats[col_name]["cuenta"] += 1

    por_colegio = {name: round(s["suma"]/s["cuenta"], 2) for name, s in col_stats.items() if s["cuenta"] > 0}

    # Agregación por Curso (Promedio Global)
    curso_stats = {}
    for e in evaluaciones:
        if e.promedio is None:
            continue
        curso_name = f"{e.curso.nivel.nombre} {e.curso.letra}" if e.curso and e.curso.nivel else "Sin curso"
        if curso_name not in curso_stats:
            curso_stats[curso_name] = {"suma": 0, "cuenta": 0}
        curso_stats[curso_name]["suma"] += e.promedio
        curso_stats[curso_name]["cuenta"] += 1

    por_curso = {name: round(s["suma"]/s["cuenta"], 2) for name, s in curso_stats.items() if s["cuenta"] > 0}

    # Promedios por Dimensión per Curso (NUEVO)
    dims_curso_stats = {}
    for e in evaluaciones:
        curso_name = f"{e.curso.nivel.nombre} {e.curso.letra}" if e.curso and e.curso.nivel else "Sin curso"
        if curso_name not in dims_curso_stats:
            dims_curso_stats[curso_name] = [{"suma": 0.0, "cuenta": 0} for _ in range(5)]
        
        if e.promedio_dim1 is not None: dims_curso_stats[curso_name][0]["suma"] += e.promedio_dim1; dims_curso_stats[curso_name][0]["cuenta"] += 1
        if e.promedio_dim2 is not None: dims_curso_stats[curso_name][1]["suma"] += e.promedio_dim2; dims_curso_stats[curso_name][1]["cuenta"] += 1
        if e.promedio_dim3 is not None: dims_curso_stats[curso_name][2]["suma"] += e.promedio_dim3; dims_curso_stats[curso_name][2]["cuenta"] += 1
        if e.promedio_dim4 is not None: dims_curso_stats[curso_name][3]["suma"] += e.promedio_dim4; dims_curso_stats[curso_name][3]["cuenta"] += 1
        if e.promedio_dim5 is not None: dims_curso_stats[curso_name][4]["suma"] += e.promedio_dim5; dims_curso_stats[curso_name][4]["cuenta"] += 1

    dimensiones_por_curso = {}
    for curso_name, dims in dims_curso_stats.items():
        dimensiones_por_curso[curso_name] = [
            round(d["suma"] / d["cuenta"], 2) if d["cuenta"] > 0 else 0 
            for d in dims
        ]

    # Promedios por Dimensión per Docente (NUEVO REQUERIMIENTO)
    dims_docente_stats = {}
    for e in evaluaciones:
        docente_name = e.docente.nombre if e.docente else "Sin docente"
        if docente_name not in dims_docente_stats:
            dims_docente_stats[docente_name] = [{"suma": 0.0, "cuenta": 0} for _ in range(5)]
        
        if e.promedio_dim1 is not None: dims_docente_stats[docente_name][0]["suma"] += e.promedio_dim1; dims_docente_stats[docente_name][0]["cuenta"] += 1
        if e.promedio_dim2 is not None: dims_docente_stats[docente_name][1]["suma"] += e.promedio_dim2; dims_docente_stats[docente_name][1]["cuenta"] += 1
        if e.promedio_dim3 is not None: dims_docente_stats[docente_name][2]["suma"] += e.promedio_dim3; dims_docente_stats[docente_name][2]["cuenta"] += 1
        if e.promedio_dim4 is not None: dims_docente_stats[docente_name][3]["suma"] += e.promedio_dim4; dims_docente_stats[docente_name][3]["cuenta"] += 1
        if e.promedio_dim5 is not None: dims_docente_stats[docente_name][4]["suma"] += e.promedio_dim5; dims_docente_stats[docente_name][4]["cuenta"] += 1

    dimensiones_por_docente = {}
    for doc_name, dims in dims_docente_stats.items():
        dimensiones_por_docente[doc_name] = [
            round(d["suma"] / d["cuenta"], 2) if d["cuenta"] > 0 else 0 
            for d in dims
        ]

    # Promedios por Dimensión per Colegio
    dims_col_stats = {}
    for e in evaluaciones:
        col_name = e.docente.colegio.nombre if e.docente and e.docente.colegio else "Sin colegio"
        if col_name not in dims_col_stats:
            dims_col_stats[col_name] = [{"suma": 0.0, "cuenta": 0} for _ in range(5)]
        
        if e.promedio_dim1 is not None: dims_col_stats[col_name][0]["suma"] += e.promedio_dim1; dims_col_stats[col_name][0]["cuenta"] += 1
        if e.promedio_dim2 is not None: dims_col_stats[col_name][1]["suma"] += e.promedio_dim2; dims_col_stats[col_name][1]["cuenta"] += 1
        if e.promedio_dim3 is not None: dims_col_stats[col_name][2]["suma"] += e.promedio_dim3; dims_col_stats[col_name][2]["cuenta"] += 1
        if e.promedio_dim4 is not None: dims_col_stats[col_name][3]["suma"] += e.promedio_dim4; dims_col_stats[col_name][3]["cuenta"] += 1
        if e.promedio_dim5 is not None: dims_col_stats[col_name][4]["suma"] += e.promedio_dim5; dims_col_stats[col_name][4]["cuenta"] += 1

    dimensiones_por_colegio = {}
    for col_name, dims in dims_col_stats.items():
        dimensiones_por_colegio[col_name] = [
            round(d["suma"] / d["cuenta"], 2) if d["cuenta"] > 0 else 0 
            for d in dims
        ]

    # 10. Distribución de Niveles por Docente (NUEVO REQUERIMIENTO)
    # Calculamos el promedio de cada docente en el periodo filtrado
    docente_promedios = {}
    for e in evaluaciones:
        if e.promedio is None:
            continue
        did = e.docente_id
        if did not in docente_promedios:
            docente_promedios[did] = []
        docente_promedios[did].append(e.promedio)

    dist_docentes_niveles = {"Bajo": 0, "Regular": 0, "Adecuado": 0, "Bueno": 0, "Muy bueno": 0}
    for did, scores in docente_promedios.items():
        if not scores:
            continue
        avg = sum(scores) / len(scores)
        if avg < 2.0: dist_docentes_niveles["Bajo"] += 1
        elif avg < 3.0: dist_docentes_niveles["Regular"] += 1
        elif avg < 3.6: dist_docentes_niveles["Adecuado"] += 1
        elif avg < 4.5: dist_docentes_niveles["Bueno"] += 1
        else: dist_docentes_niveles["Muy bueno"] += 1

    # 11. Distribución Funcionamiento del Grupo (Global)
    dist_func_grupo = {"Bajo": 0, "Regular": 0, "Adecuado": 0, "Bueno": 0, "Muy bueno": 0}
    for e in evaluaciones:
        if e.func_grupo in dist_func_grupo:
            dist_func_grupo[e.func_grupo] += 1

    # 12. Promedio por Docente (útil para la vista de Visitas al Aula)
    doc_avg_stats = {}
    for e in evaluaciones:
        if e.promedio is None:
            continue
        docente_name = e.docente.nombre if e.docente else "Sin docente"
        if docente_name not in doc_avg_stats:
            doc_avg_stats[docente_name] = {"suma": 0.0, "cuenta": 0}
        doc_avg_stats[docente_name]["suma"] += e.promedio
        doc_avg_stats[docente_name]["cuenta"] += 1
    por_docente = {name: round(s["suma"] / s["cuenta"], 2)
                   for name, s in doc_avg_stats.items() if s["cuenta"] > 0}

    # 13. Cantidad por tipo de pauta (formato de la plantilla)
    por_tipo_pauta = {}
    for e in evaluaciones:
        formato = (e.plantilla.formato if e.plantilla and e.plantilla.formato else "LIDERAZGO")
        por_tipo_pauta[formato] = por_tipo_pauta.get(formato, 0) + 1

    return {
        "total_evaluaciones": total,
        "promedio_global": round(promedio_global, 2),
        "promedios_dimensiones": promedios_dims,
        "distribucion_niveles": niveles,
        "por_asignatura": por_asignatura,
        "por_colegio": por_colegio,
        "por_curso": por_curso,
        "por_mes": por_mes,
        "dimensiones_por_curso": dimensiones_por_curso,
        "dimensiones_por_docente": dimensiones_por_docente,
        "dimensiones_por_colegio": dimensiones_por_colegio,
        "distribucion_func_grupo": dist_func_grupo,
        "distribucion_docentes_niveles": dist_docentes_niveles,
        "por_docente": por_docente,
        "por_tipo_pauta": por_tipo_pauta
    }


def _parse_colegio_ids(raw):
    """Convierte 'colegio_id' (string posiblemente con comas) en lista de ints."""
    if not raw:
        return []
    return [int(x.strip()) for x in str(raw).split(",") if x.strip().isdigit()]


@router.get("/stats/visitas-por-rol")
def stats_visitas_por_rol(
    anio: Optional[int] = Query(None),
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_active_user)
):
    """Estadísticas de visitas (plataforma Visita) agrupadas por ROL del visitador.

    Reporte de actividad: cuenta TODAS las visitas registradas (cualquier estado)
    de pautas con formato de visita (UTP / ORIENTACION) — no solo las firmadas —,
    porque mide cuántas visitas hizo cada persona y cuándo.

    - Se clasifica por el COLEGIO del visitador (Usuario.colegio_id); si el visitador
      tiene varios colegios, se usa el del docente visitado cuando coincide.
    - Roles considerados: inspectoria, director, utp, pie, orien_conv.
    - Un mismo rol puede tener varios usuarios: cada visitador se desglosa aparte
      (por_observador), con su conteo mensual y total.
    - El mes se toma de la fecha de la visita (marzo a noviembre).
    - No-admin: solo su(s) colegio(s). Admin: todos.
    """
    VISITA_FORMATOS = ("UTP", "ORIENTACION")
    ROLES = ["inspectoria", "director", "utp", "pie", "orien_conv"]
    year = int(anio) if anio else datetime.now().year

    roles_map = {r.id: (r.nombre or "").lower() for r in db.query(Rol).all()}
    colegios_map = {c.id: c.nombre for c in db.query(Colegio).all()}

    es_admin = current_user.rol_id == 1
    user_colegios = set(_parse_colegio_ids(current_user.colegio_id)) if current_user.colegio_id else set()

    # Cuenta visitas en cualquier estado (borrador, listo para firma, firmada, cerrada):
    # es un reporte de actividad por persona, no de firmas.
    evals = db.query(Evaluacion).options(
        joinedload(Evaluacion.observador),
        joinedload(Evaluacion.plantilla),
        joinedload(Evaluacion.docente)
    ).all()

    data = {}  # colegio_nombre -> {"por_rol_mes": {...}, "_obs": {obs_id: {...}}}

    for e in evals:
        if not e.plantilla or e.plantilla.formato not in VISITA_FORMATOS:
            continue
        if not e.fecha or e.fecha.year != year:
            continue
        mes = e.fecha.month
        if mes < 3 or mes > 11:
            continue
        obs = e.observador
        if not obs:
            continue
        rol_name = roles_map.get(obs.rol_id, "")
        if rol_name not in ROLES:
            continue

        # Colegio del visitador (si tiene varios, preferir el del docente visitado)
        obs_cols = _parse_colegio_ids(obs.colegio_id)
        doc_col = e.docente.colegio_id if e.docente else None
        if doc_col in obs_cols:
            col_id = doc_col
        elif obs_cols:
            col_id = obs_cols[0]
        else:
            col_id = doc_col
        if col_id is None:
            continue

        # Restricción de acceso por colegio (no-admin)
        if not es_admin and user_colegios and col_id not in user_colegios:
            continue

        col_name = colegios_map.get(col_id, f"Colegio {col_id}")
        bucket = data.setdefault(col_name, {"por_rol_mes": {}, "_obs": {}})

        rolmes = bucket["por_rol_mes"].setdefault(rol_name, {m: 0 for m in range(3, 12)})
        rolmes[mes] += 1

        ob = bucket["_obs"].setdefault(obs.id, {
            "usuario_id": obs.id,
            "nombre": obs.nombre_completo or obs.username or f"Usuario {obs.id}",
            "rol": rol_name,
            "por_mes": {m: 0 for m in range(3, 12)},
            "total": 0,
            "meta": None,
        })
        ob["por_mes"][mes] += 1
        ob["total"] += 1

    # Metas individuales del año, por usuario.
    metas_rows = db.query(Meta).options(joinedload(Meta.usuario)).filter(Meta.anio == year).all()
    metas_por_usuario = {m.usuario_id: {"periodo": m.periodo, "cantidad": m.cantidad} for m in metas_rows}

    # Visitadores con meta agrupados por colegio (para incluir a quienes tienen meta
    # pero aún no registran visitas, con total 0).
    metas_users_by_col = {}
    for m in metas_rows:
        u = m.usuario
        if not u:
            continue
        rol_name = roles_map.get(u.rol_id, "")
        if rol_name not in ROLES:
            continue
        col_name = colegios_map.get(m.colegio_id)
        if not col_name:
            continue
        metas_users_by_col.setdefault(col_name, []).append((u, rol_name))

    out = {}
    for col_name, bucket in data.items():
        # Incluir usuarios con meta y 0 visitas en este colegio.
        for (u, rol_name) in metas_users_by_col.get(col_name, []):
            if u.id not in bucket["_obs"]:
                bucket["_obs"][u.id] = {
                    "usuario_id": u.id,
                    "nombre": u.nombre_completo or u.username or f"Usuario {u.id}",
                    "rol": rol_name,
                    "por_mes": {k: 0 for k in range(3, 12)},
                    "total": 0,
                    "meta": None,
                }
        observadores = sorted(bucket["_obs"].values(), key=lambda x: -x["total"])
        for ob in observadores:
            ob["meta"] = metas_por_usuario.get(ob["usuario_id"])
        out[col_name] = {
            "por_rol_mes": bucket["por_rol_mes"],
            "por_observador": observadores,
        }

    return {"anio": year, "roles": ROLES, "data": out}


@router.get("/talent-map")
def get_talent_map(
    colegio_id: Optional[int] = Query(None),
    fecha_desde: Optional[date] = Query(None),
    fecha_hasta: Optional[date] = Query(None),
    tipo_vista: str = Query("promedio", description="promedio o ultimo"),
    plataforma: Optional[str] = Query(None, description="liderazgo | visita"),
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_active_user)
):
    # Consulta base sin restricción de max_id para poder calcular promedios
    query = db.query(Evaluacion).join(Docente).options(joinedload(Evaluacion.plantilla))

    if colegio_id:
        query = query.filter(Docente.colegio_id == colegio_id)

    if fecha_desde:
        query = query.filter(Evaluacion.fecha >= fecha_desde)
    if fecha_hasta:
        query = query.filter(Evaluacion.fecha <= fecha_hasta)

    if current_user.rol_id == 3:
        query = query.filter(Evaluacion.usuario_id == current_user.id)

    evaluaciones = query.all()

    # Filtro por plataforma (formato de la plantilla)
    VISITA_FORMATOS = ("UTP", "ORIENTACION")
    if plataforma == "visita":
        evaluaciones = [e for e in evaluaciones
                        if e.plantilla and e.plantilla.formato in VISITA_FORMATOS]
    elif plataforma == "liderazgo":
        evaluaciones = [e for e in evaluaciones
                        if (not e.plantilla) or e.plantilla.formato not in VISITA_FORMATOS]

    # Agrupar por docente para asegurar unicidad
    docentes_data = {}
    for e in evaluaciones:
        did = e.group_id if hasattr(e, 'group_id') else e.docente_id # Usamos docente_id
        did = e.docente_id
        if did not in docentes_data:
            docentes_data[did] = {
                "nombre": e.docente.nombre if e.docente else "Docente Desconocido",
                "puntajes": [],
                "ultima_orientacion": e.orientacion,
                "ultimo_promedio": e.promedio,
                "ultima_fecha": e.fecha
            }
        
        if e.promedio is not None:
            docentes_data[did]["puntajes"].append(e.promedio)
        
        if e.fecha and (docentes_data[did]["ultima_fecha"] is None or e.fecha >= docentes_data[did]["ultima_fecha"]):
            docentes_data[did]["ultima_fecha"] = e.fecha
            docentes_data[did]["ultima_orientacion"] = e.orientacion
            docentes_data[did]["ultimo_promedio"] = e.promedio

    talent_map_puntaje = {"avanzado": [], "intermedio": [], "en_desarrollo": [], "inicial": []}
    talent_map_orientacion = {"avanzado": [], "intermedio": [], "inicial": [], "prioritario": []}

    for did, data in docentes_data.items():
        if not data["puntajes"]: continue
        
        # Determinar puntaje según tipo de vista
        if tipo_vista == "ultimo":
            display_score = round(data["ultimo_promedio"] or 0, 2)
        else:
            display_score = round(sum(data["puntajes"]) / len(data["puntajes"]), 2)
            
        teacher_info = {"nombre": data["nombre"], "puntaje": display_score}
        
        # Clasificación por Puntaje (Nueva escala 1-5)
        if display_score >= 4.0:
            talent_map_puntaje["avanzado"].append(teacher_info)
        elif display_score >= 3.0:
            talent_map_puntaje["intermedio"].append(teacher_info)
        elif display_score >= 2.0:
            talent_map_puntaje["en_desarrollo"].append(teacher_info)
        else:
            talent_map_puntaje["inicial"].append(teacher_info)
            
        # Clasificación por Orientación (Siempre usa la última registrada por ser estado actual)
        o = (data["ultima_orientacion"] or "").strip().lower()
        if "referente" in o:
            talent_map_orientacion["avanzado"].append(teacher_info)
        elif "desempeño" in o:
            talent_map_orientacion["intermedio"].append(teacher_info)
        elif "desarrollo" in o:
            talent_map_orientacion["inicial"].append(teacher_info)
        elif "acompañamiento" in o:
            talent_map_orientacion["prioritario"].append(teacher_info)
    return {
        "puntaje": talent_map_puntaje,
        "orientacion": talent_map_orientacion
    }


@router.get("/public-detail")
async def get_public_detail(
    token: str,
    db: Session = Depends(get_db)
):
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        eval_id = payload.get("eval_id")
    except JWTError as e:
        print(f"JWT decode error in get_public_detail: {e}")
        raise HTTPException(status_code=401, detail=f"Token inválido o expirado. Detalle: {str(e)}")
    
    evaluacion = db.query(Evaluacion).filter(Evaluacion.id == eval_id).first()
    if not evaluacion:
        raise HTTPException(status_code=404, detail="Acompañamiento no encontrado")
        
    if evaluacion.estado != EvaluacionEstado.LISTO_PARA_FIRMA:
        raise HTTPException(status_code=400, detail="El enlace ya ha sido utilizado o ha expirado.")
        
    import json
    comentarios_data = {}
    if evaluacion.comentarios:
        try:
            comentarios_data = json.loads(evaluacion.comentarios)
        except Exception:
            comentarios_data = {"raw": evaluacion.comentarios}
            
    return {
        "id": evaluacion.id,
        "plantilla_id": evaluacion.plantilla_id,
        "formato": evaluacion.plantilla.formato if evaluacion.plantilla else "ORIENTACION",
        "docente_nombre": evaluacion.docente.nombre,
        "colegio_nombre": evaluacion.docente.colegio.nombre,
        "curso": f"{evaluacion.curso.nivel.nombre} {evaluacion.curso.letra}",
        "asignatura": evaluacion.asignatura.nombre,
        "fecha": evaluacion.fecha,
        "promedio": float(evaluacion.promedio) if evaluacion.promedio else 0.0,
        "estado": evaluacion.estado.value,
        "sintesis_retro": evaluacion.sintesis_retro,
        "acuerdos_mejora": evaluacion.acuerdos_mejora,
        "fecha_retro": evaluacion.fecha_retro,
        "fortalezas_aspectos": [
            {
                "tipo": fa.tipo,
                "contenido": fa.contenido
            }
            for fa in evaluacion.fortalezas_aspectos
        ],
        "comentarios": comentarios_data
    }



@router.get("/public-info")
async def get_public_info(
    token: str,
    db: Session = Depends(get_db)
):
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        eval_id = payload.get("eval_id")
    except JWTError as e:
        print(f"JWT decode error in get_public_info: {e}")
        raise HTTPException(status_code=401, detail=f"Token inválido o expirado. Detalle: {str(e)}")
        
    evaluacion = db.query(Evaluacion).filter(Evaluacion.id == eval_id).first()
    if not evaluacion:
        raise HTTPException(status_code=404, detail="Acompañamiento no encontrado")
        
    if evaluacion.estado != EvaluacionEstado.LISTO_PARA_FIRMA:
        raise HTTPException(status_code=400, detail="El enlace ya ha sido utilizado o ha expirado.")
        
    return {
        "id": evaluacion.id,
        "fecha": evaluacion.fecha,
        "fecha_retro": evaluacion.fecha_retro,
        "docente_nombre": evaluacion.docente.nombre if evaluacion.docente else "N/A",
        "observador_nombre": (
            (evaluacion.observador.nombre_completo or evaluacion.observador.username) if evaluacion.observador
            else ((evaluacion.usuario.nombre_completo or evaluacion.usuario.username) if evaluacion.usuario else "N/A")
        ),
        "estado": evaluacion.estado.value,
        "codigo_firma": evaluacion.codigo_firma
    }

@router.get("/public-pdf")
async def get_public_pdf(
    token: str,
    db: Session = Depends(get_db)
):
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        eval_id = payload.get("eval_id")
    except JWTError as e:
        print(f"JWT decode error in get_public_pdf: {e}")
        raise HTTPException(status_code=401, detail=f"Token inválido o expirado. Detalle: {str(e)}")
        
    # Aquí llamaríamos a la lógica de generación de PDF existente
    # Por ahora redirigimos al endpoint de descarga si el token es válido
    # (En producción esto debería generar el PDF directamente o validar el acceso)
    from fastapi.responses import RedirectResponse
    return RedirectResponse(url=f"/api/evaluaciones/{eval_id}/pdf?token={token}")


@router.get("/{evaluacion_id}", response_model=EvaluacionResponse)
def obtener_evaluacion(
    evaluacion_id: int,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_active_user)
):
    query = db.query(Evaluacion).options(
        joinedload(Evaluacion.docente).joinedload(Docente.colegio),
        joinedload(Evaluacion.curso).joinedload(Curso.nivel),
        joinedload(Evaluacion.asignatura),
        joinedload(Evaluacion.observador),
        joinedload(Evaluacion.respuestas),
        joinedload(Evaluacion.apoyos),
        joinedload(Evaluacion.fortalezas_aspectos),
        joinedload(Evaluacion.estudiantes_observados)
    )

    if current_user.rol_id == 3:
        query = query.filter(
            Evaluacion.id == evaluacion_id,
            Evaluacion.usuario_id == current_user.id
        )
    else:
        query = query.filter(Evaluacion.id == evaluacion_id)

    evaluacion = query.first()

    if not evaluacion:
        raise HTTPException(status_code=404, detail="Evaluación no encontrada")

    return build_evaluacion_response(evaluacion)


@router.put("/{evaluacion_id}", response_model=EvaluacionResponse)
def actualizar_evaluacion(
    evaluacion_id: int,
    eval_data: EvaluacionUpdate,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_active_user)
):
    import json
    with open("debug_last_put.json", "w") as f:
        json.dump(eval_data.dict(exclude_unset=True), f, indent=4, default=str)
    
    print(f"DEBUG: Actualizando evaluación {evaluacion_id} con datos guardados en debug_last_put.json")
    evaluacion = db.query(Evaluacion).filter(Evaluacion.id == evaluacion_id).first()
    if not evaluacion:
        raise HTTPException(status_code=404, detail="Evaluación no encontrada")
    
    # Solo se puede editar si el usuario es el creador de la pauta
    if evaluacion.usuario_id != current_user.id:
        raise HTTPException(status_code=403, detail="No tienes permiso para editar esta evaluación. Solo el creador puede modificarla.")
    
    # Permitir edición en BORRADOR y LISTO_PARA_FIRMA (excepto si es del tipo 'visita')
    is_visita = evaluacion.plantilla and evaluacion.plantilla.tipo == "visita"
    if not is_visita:
        estados_editables = [EvaluacionEstado.BORRADOR, EvaluacionEstado.LISTO_PARA_FIRMA]
        if evaluacion.estado not in estados_editables:
            raise HTTPException(status_code=400, detail="Solo se pueden editar evaluaciones en estado BORRADOR o LISTO_PARA_FIRMA")
    
    update_data = eval_data.dict(exclude_unset=True)
    
    # Campos escalares directos
    campos_escalares = [
        'plantilla_id', 'docente_id', 'curso_id', 'asignatura_id',
        'fecha', 'duracion', 'func_grupo', 'promedio',
        'promedio_dim1', 'promedio_dim2', 'promedio_dim3', 'promedio_dim4', 'promedio_dim5',
        'orientacion', 'nivel_apoyo', 'comentarios',
        'fecha_retro', 'modalidad_retro', 'sintesis_retro', 'acuerdos_mejora'
    ]
    # Nota: colegio_id no se incluye porque la tabla Evaluacion no tiene esa columna
    # (el colegio se obtiene a través de docente.colegio_id)
    
    for campo in campos_escalares:
        if campo in update_data:
            setattr(evaluacion, campo, update_data[campo])
    
    # Actualizar estado si se proporcionó
    if 'estado' in update_data and update_data['estado']:
        try:
            nuevo_estado = EvaluacionEstado(update_data['estado'])
            evaluacion.estado = nuevo_estado
        except ValueError:
            print(f"DEBUG: Estado inválido recibido: {update_data['estado']}")
    
    # Actualizar respuestas (reemplazo completo)
    if 'respuestas' in update_data and update_data['respuestas'] is not None:
        # Eliminar respuestas existentes
        for r in evaluacion.respuestas:
            db.delete(r)
        db.flush()
        
        for resp in update_data['respuestas']:
            nueva_resp = EvaluacionRespuesta(
                evaluacion_id=evaluacion.id,
                subdimension_id=resp['subdimension_id'] if isinstance(resp, dict) else resp.subdimension_id,
                valor=resp['valor'] if isinstance(resp, dict) else resp.valor,
                estrategia=resp.get('estrategia') if isinstance(resp, dict) else getattr(resp, 'estrategia', None)
            )
            db.add(nueva_resp)

    # Actualizar fortalezas y aspectos (reemplazo completo)
    if 'fortalezas_aspectos' in update_data and update_data['fortalezas_aspectos'] is not None:
        evaluacion.fortalezas_aspectos.clear()
        db.flush()
        
        for fa in update_data['fortalezas_aspectos']:
            nueva_fa = FortalezaAspecto(
                evaluacion_id=evaluacion.id,
                tipo=fa['tipo'] if isinstance(fa, dict) else fa.tipo,
                contenido=fa['contenido'] if isinstance(fa, dict) else fa.contenido
            )
            evaluacion.fortalezas_aspectos.append(nueva_fa)

    # Actualizar apoyos (reemplazo completo)
    if 'apoyos' in update_data and update_data['apoyos'] is not None:
        evaluacion.apoyos.clear()
        db.flush()
        
        for ap in update_data['apoyos']:
            nuevo_apoyo = EvaluacionApoyo(
                evaluacion_id=evaluacion.id,
                apoyo=ap['apoyo'] if isinstance(ap, dict) else ap.apoyo
            )
            evaluacion.apoyos.append(nuevo_apoyo)

    # Actualizar estudiantes observados (reemplazo completo)
    if 'estudiantes_observados' in update_data and update_data['estudiantes_observados'] is not None:
        evaluacion.estudiantes_observados.clear()
        db.flush()
        
        for est in update_data['estudiantes_observados']:
            nuevo_est = EvaluacionEstudiante(
                evaluacion_id=evaluacion.id,
                nombre_estudiante=est['nombre_estudiante'] if isinstance(est, dict) else est.nombre_estudiante,
                conducta_observada=est['conducta_observada'] if isinstance(est, dict) else est.conducta_observada
            )
            evaluacion.estudiantes_observados.append(nuevo_est)
            
    db.commit()
    
    # Recargar la evaluación con todas sus relaciones
    evaluacion_final = db.query(Evaluacion).options(
        joinedload(Evaluacion.fortalezas_aspectos),
        joinedload(Evaluacion.respuestas),
        joinedload(Evaluacion.apoyos),
        joinedload(Evaluacion.estudiantes_observados),
        joinedload(Evaluacion.docente).joinedload(Docente.colegio),
        joinedload(Evaluacion.curso).joinedload(Curso.nivel),
        joinedload(Evaluacion.asignatura),
        joinedload(Evaluacion.observador)
    ).filter(Evaluacion.id == evaluacion_id).first()
    
    return build_evaluacion_response(evaluacion_final)


@router.post("/{eval_id}/prepare-sign")
async def prepare_sign(
    eval_id: int,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_active_user)
):
    evaluacion = db.query(Evaluacion).filter(Evaluacion.id == eval_id).first()
    if not evaluacion:
        raise HTTPException(status_code=404, detail="Acompañamiento no encontrado")
    
    # Solo se puede preparar si está en BORRADOR o LISTO_PARA_FIRMA
    if evaluacion.estado not in [EvaluacionEstado.BORRADOR, EvaluacionEstado.LISTO_PARA_FIRMA]:
        raise HTTPException(status_code=400, detail="El estado actual no permite preparar la firma")
    
    evaluacion.estado = EvaluacionEstado.LISTO_PARA_FIRMA
    db.commit()
    return {"message": "Acompañamiento listo para firma", "estado": evaluacion.estado.value}


@router.get("/{eval_id}/sign-token")
async def get_sign_token(
    eval_id: int,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_active_user)
):
    evaluacion = db.query(Evaluacion).filter(Evaluacion.id == eval_id).first()
    if not evaluacion:
        raise HTTPException(status_code=404, detail="Acompañamiento no encontrado")
    
    if evaluacion.estado != EvaluacionEstado.LISTO_PARA_FIRMA:
        raise HTTPException(status_code=400, detail="El acompañamiento no está listo para firma")
    
    # Crear un token de duración de 24 horas (para evitar problemas de desfase horario)
    import time
    exp_timestamp = int(time.time() + 86400)
    
    payload = {
        "eval_id": eval_id,
        "docente_id": evaluacion.docente_id,
        "exp": exp_timestamp,
        "purpose": "remote_sign" # Compatible con la firma remota
    }
    token = jwt.encode(payload, SECRET_KEY, algorithm=ALGORITHM)
    return {"token": token}


@router.post("/public-sign")
async def public_sign(
    data: dict,  # {"token": "...", "code": "123456"}
    db: Session = Depends(get_db)
):
    token = data.get("token")
    code = data.get("code")
    
    if not token or not code:
        raise HTTPException(status_code=400, detail="Token y código TOTP son requeridos")
    
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        eval_id = payload.get("eval_id")
    except JWTError as e:
        print(f"JWT decode error in public_sign: {e}")
        raise HTTPException(status_code=401, detail=f"Token inválido o expirado. Detalle: {str(e)}")
    
    evaluacion = db.query(Evaluacion).filter(Evaluacion.id == eval_id).first()
    if not evaluacion:
        raise HTTPException(status_code=404, detail="Acompañamiento no encontrado")
    
    if evaluacion.estado != EvaluacionEstado.LISTO_PARA_FIRMA:
        raise HTTPException(status_code=400, detail="El acompañamiento ya no está disponible para firma")
    
    # Verificar TOTP del docente
    import pyotp
    if not evaluacion.docente.totp_secret:
        raise HTTPException(status_code=400, detail="El docente no tiene configurada la firma digital")
        
    totp = pyotp.TOTP(evaluacion.docente.totp_secret)
    if totp.verify(code):
        import secrets
        import uuid
        # Generar código único de verificación (ej: FA-7B8C29)
        verif_code = f"FA-{secrets.token_hex(3).upper()}"
        
        evaluacion.estado = EvaluacionEstado.CERRADA
        evaluacion.fecha_firma_docente = datetime.now()
        evaluacion.codigo_firma = verif_code
        
        # Generar tokens UUID de seguridad
        evaluacion.token_full = str(uuid.uuid4())
        evaluacion.token_pedagogico = str(uuid.uuid4())
        
        db.commit()
        
        # NOTIFICAR POR WEBSOCKET
        await manager.notify_signature(eval_id, {
            "event": "DOCENTE_FIRMO",
            "docente_nombre": evaluacion.docente.nombre,
            "verificacion": verif_code,
            "timestamp": datetime.now().isoformat()
        })
        
        # Generar link para que el observador comparta (reusamos el token de acceso si existe o pasamos el ID)
        # En este sistema, el link de firma (firmar.html?token=...) sirve para ver el estado también
        public_link = f"{BASE_URL}/firmar.html?token={token or ''}" # El token viene del request
        
        return {
            "message": "Firma realizada exitosamente",
            "codigo_verificacion": verif_code,
            "public_link": public_link
        }
    else:
        raise HTTPException(status_code=400, detail="Código TOTP incorrecto")


@router.post("/{eval_id}/request-remote-sign")
async def request_remote_sign(
    eval_id: int,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_active_user)
):
    evaluacion = db.query(Evaluacion).filter(Evaluacion.id == eval_id).first()
    if not evaluacion:
        raise HTTPException(status_code=404, detail="Acompañamiento no encontrado")
        
    if evaluacion.estado not in [EvaluacionEstado.LISTO_PARA_FIRMA, EvaluacionEstado.BORRADOR]:
        raise HTTPException(status_code=400, detail="El acompañamiento no está en un estado válido para firma")
        
    docente = evaluacion.docente
    if not docente or not docente.email:
        raise HTTPException(status_code=400, detail="El docente no tiene un correo electrónico configurado")
        
    # Cambiar estado a LISTO_PARA_FIRMA si estaba en BORRADOR
    if evaluacion.estado == EvaluacionEstado.BORRADOR:
        evaluacion.estado = EvaluacionEstado.LISTO_PARA_FIRMA
        db.commit()
        
    # Generar token de 24 horas
    import time
    exp_timestamp = int(time.time() + 86400)
    payload = {
        "eval_id": eval_id,
        "exp": exp_timestamp,
        "purpose": "remote_sign"
    }
    token = jwt.encode(payload, SECRET_KEY, algorithm=ALGORITHM)
    
    # URL de firma
    link_firma = f"{BASE_URL}/firmar-remota.html?token={token}"
    
    colegio_nombre = docente.colegio.nombre.upper() if docente.colegio else ""
    school_type = "DP" if "DIEGO PORTALES" in colegio_nombre else "MC" if "MACAYA" in colegio_nombre else None
    
    primary_color = "#064e3b" if school_type == "MC" else "#004080"
    
    observador_nombre = (
        (evaluacion.observador.nombre_completo or evaluacion.observador.username) if evaluacion.observador
        else ((evaluacion.usuario.nombre_completo or evaluacion.usuario.username) if evaluacion.usuario else "N/A")
    )

    html_body = f"""
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e2e8f0; border-radius: 8px;">
        <h2 style="color: {primary_color}; text-align: center;">Firma de Acompañamiento Digital</h2>
        <p>Estimado/a <strong>{docente.nombre}</strong>,</p>
        <p>Se ha habilitado este enlace seguro para que pueda firmar digitalmente su acta de acompañamiento al aula.</p>
        
        <div style="background-color: #f8fafc; padding: 15px; border-radius: 8px; margin: 20px 0;">
            <p style="margin: 0 0 10px 0;"><strong>Folio:</strong> #{evaluacion.id}</p>
            <p style="margin: 0 0 10px 0;"><strong>Docente Visitado:</strong> {docente.nombre}</p>
            <p style="margin: 0 0 10px 0;"><strong>Observador/a:</strong> {observador_nombre}</p>
            <p style="margin: 0 0 10px 0;"><strong>Fecha:</strong> {evaluacion.fecha.strftime('%d/%m/%Y') if evaluacion.fecha else 'N/A'}</p>
            <p style="margin: 0;"><strong>Curso:</strong> {evaluacion.curso.nivel.nombre if evaluacion.curso else 'N/A'} {evaluacion.curso.letra if evaluacion.curso else ''}</p>
        </div>
        
        <div style="text-align: center; margin: 30px 0;">
            <a href="{link_firma}" style="background-color: {primary_color}; color: white; padding: 14px 28px; text-decoration: none; border-radius: 6px; font-weight: bold; display: inline-block;">
                FIRMADA DIGITALMENTE ACTA
            </a>
        </div>
        
        <p style="color: #e11d48; font-size: 0.9em; text-align: center;">
            ⚠️ <strong>Importante:</strong> Este enlace tiene una validez de 24 horas por motivos de seguridad.
        </p>
        <hr style="border-top: 1px solid #e2e8f0; margin: 20px 0;" />
        <p style="font-size: 0.8em; color: #64748b; text-align: center;">
            Si el botón no funciona, copie y pegue este enlace en su navegador:<br>
            <a href="{link_firma}" style="color: {primary_color}; word-break: break-all;">{link_firma}</a>
        </p>
    </div>
    """
    
    enviado = send_evaluation_email(
        to_emails=[docente.email],
        subject=f"Firma Pendiente: Acompañamiento #{evaluacion.id}",
        body="Por favor firme su acta abriendo el enlace proporcionado.",
        body_html=html_body,
        school_type=school_type
    )
    
    if not enviado:
        raise HTTPException(status_code=500, detail="Error al enviar el correo electrónico")
        
    return {"message": "Enlace de firma remota enviado exitosamente."}

@router.post("/public-sign-remote")
async def public_sign_remote(
    data: dict,
    db: Session = Depends(get_db)
):
    token = data.get("token")
    if not token:
        raise HTTPException(status_code=400, detail="Token es requerido")
        
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        eval_id = payload.get("eval_id")
        purpose = payload.get("purpose")
        
        if purpose != "remote_sign":
            raise HTTPException(status_code=401, detail="Tipo de token inválido")
            
    except JWTError as e:
        print(f"JWT decode error in public_sign_remote: {e}")
        raise HTTPException(status_code=401, detail=f"Token inválido o expirado. Detalle: {str(e)}")
        
    evaluacion = db.query(Evaluacion).filter(Evaluacion.id == eval_id).first()
    if not evaluacion:
        raise HTTPException(status_code=404, detail="Acompañamiento no encontrado")
        
    if evaluacion.estado != EvaluacionEstado.LISTO_PARA_FIRMA:
        raise HTTPException(status_code=400, detail="El acompañamiento ya no está disponible para firma")
        
    import secrets
    import uuid
    # Generar código único de verificación
    verif_code = f"FA-{secrets.token_hex(3).upper()}"
    
    evaluacion.estado = EvaluacionEstado.CERRADA
    evaluacion.fecha_firma_docente = datetime.now()
    evaluacion.codigo_firma = verif_code
    
    # Generar tokens UUID de seguridad
    evaluacion.token_full = str(uuid.uuid4())
    evaluacion.token_pedagogico = str(uuid.uuid4())
    
    db.commit()
    
    # NOTIFICAR POR WEBSOCKET (si hay alguien mirando el dashboard)
    await manager.notify_signature(eval_id, {
        "event": "DOCENTE_FIRMO",
        "docente_nombre": evaluacion.docente.nombre,
        "verificacion": verif_code,
        "timestamp": datetime.now().isoformat()
    })
    
    return {
        "message": "Firma remota realizada exitosamente",
        "codigo_verificacion": verif_code
    }

@router.post("/{eval_id}/finalize")
async def finalize_evaluation(
    eval_id: int,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_active_user)
):
    evaluacion = db.query(Evaluacion).filter(Evaluacion.id == eval_id).first()
    if not evaluacion:
        raise HTTPException(status_code=404, detail="Acompañamiento no encontrado")
    
    if evaluacion.estado != EvaluacionEstado.FIRMADA_DOCENTE:
        raise HTTPException(status_code=400, detail="El docente debe firmar antes de cerrar")
    
    evaluacion.estado = EvaluacionEstado.CERRADA
    db.commit()
    return {"message": "Acompañamiento cerrado definitivamente", "estado": evaluacion.estado.value}


@router.delete("/{evaluacion_id}")
def eliminar_evaluacion(
    evaluacion_id: int,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_active_user)
):
    query = db.query(Evaluacion).options(
        joinedload(Evaluacion.docente).joinedload(Docente.colegio),
        joinedload(Evaluacion.curso).joinedload(Curso.nivel),
        joinedload(Evaluacion.asignatura)
    )

    if current_user.rol_id == 3:
        query = query.filter(
            Evaluacion.id == evaluacion_id,
            Evaluacion.usuario_id == current_user.id
        )
    else:
        query = query.filter(Evaluacion.id == evaluacion_id)

    evaluacion = query.first()

    if not evaluacion:
        raise HTTPException(status_code=404, detail="Evaluación no encontrada")

    # Bloquear eliminación de pautas CERRADAS, excepto para el rol administrador (rol_id == 1)
    if evaluacion.estado == EvaluacionEstado.CERRADA and current_user.rol_id != 1:
        raise HTTPException(
            status_code=400, 
            detail="No se puede eliminar una pauta cerrada. Las pautas firmadas están protegidas."
        )

    # Guardar registro de auditoría antes de eliminar
    registro = DeletedEvaluation(
        original_eval_id=evaluacion.id,
        docente_nombre=evaluacion.docente.nombre if evaluacion.docente else "N/A",
        colegio_nombre=evaluacion.docente.colegio.nombre if evaluacion.docente and evaluacion.docente.colegio else "N/A",
        curso_nombre=f"{evaluacion.curso.nivel.nombre} {evaluacion.curso.letra}" if evaluacion.curso and evaluacion.curso.nivel else "N/A",
        asignatura_nombre=evaluacion.asignatura.nombre if evaluacion.asignatura else "N/A",
        fecha_observacion=evaluacion.fecha,
        promedio=evaluacion.promedio,
        estado_al_eliminar=evaluacion.estado.value if evaluacion.estado else "BORRADOR",
        eliminado_por_id=current_user.id,
        eliminado_por_username=current_user.username
    )
    db.add(registro)

    db.delete(evaluacion)
    db.commit()
    return {"message": "Evaluación eliminada correctamente. Se ha guardado un registro de auditoría."}


@router.post("/{eval_id}/send-email")
async def send_email_accompaniment(
    eval_id: int,
    target: str = "all",  # "all", "docente", "directivo"
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_active_user)
):
    evaluacion = db.query(Evaluacion).filter(Evaluacion.id == eval_id).first()
    if not evaluacion:
        raise HTTPException(status_code=404, detail="Acompañamiento no encontrado")
    
    # 1. Recopilar destinatarios
    recipients = []
    
    # Email del docente (Destinatario Principal)
    if evaluacion.docente and evaluacion.docente.email:
        recipients.append(evaluacion.docente.email)
    
    # 2. Recopilar destinatarios con copia (CC)
    cc_list = []
    
    # Email del observador (con copia)
    if evaluacion.observador and evaluacion.observador.email:
        cc_list.append(evaluacion.observador.email)
    
    # Otros destinatarios con copia (CC) filtrados por colegio
    from sqlalchemy import or_
    docente_colegio_id = evaluacion.docente.colegio_id
    extras = db.query(EmailRecipient).filter(
        EmailRecipient.activo == True,
        or_(EmailRecipient.colegio_id == docente_colegio_id, EmailRecipient.colegio_id == None)
    ).all()
    cc_list.extend([extra.email for extra in extras])
    
    # Eliminar duplicados
    recipients = list(set(recipients))
    cc_list = list(set(cc_list))
    
    if not recipients and not cc_list:
        raise HTTPException(status_code=400, detail="No hay destinatarios válidos para enviar el correo")

    # 3. Determinar Branding y Escuela
    colegio_nombre = evaluacion.docente.colegio.nombre.upper() if evaluacion.docente and evaluacion.docente.colegio else ""
    school_type = "DP" if "DIEGO PORTALES" in colegio_nombre else "MC" if "MACAYA" in colegio_nombre else None
    
    # Colores: Macaya Verde (#064e3b), Diego Portales Azul (#004080)
    primary_color = "#064e3b" if school_type == "MC" else "#004080"
    secondary_color = "#065f46" if school_type == "MC" else "#002b5e"
    
    # 2. Enviar correo
    subject = f"Acompañamiento Docente - {evaluacion.docente.nombre}"
    
    # Enlaces (Uso de Tokens UUID por seguridad)
    token_d = evaluacion.token_pedagogico or evaluacion.codigo_firma
    token_f = evaluacion.token_full or evaluacion.codigo_firma
    link_docente = f"{BASE_URL}/ver-acta.html?c={token_d}"
    link_directivo = f"{BASE_URL}/ver-acta.html?c={token_f}"
    
    # Texto plano para clientes que no soportan HTML
    body_plain_docente = f"""
    Estimado/a {evaluacion.docente.nombre},
    
    Se ha generado un nuevo registro del acompañamiento docente realizado el {evaluacion.fecha.strftime('%d/%m/%Y') if evaluacion.fecha else 'N/A'}.
    
    Docente: {evaluacion.docente.nombre}
    Estado: {evaluacion.estado.value}
    Verificación: {evaluacion.codigo_firma or 'N/A'}
    
    Puede visualizar el acta oficial en línea en el siguiente enlace:
    {link_docente}
    """

    body_plain_directivo = f"""
    Estimado/a,
    
    Se ha generado un nuevo registro del acompañamiento docente realizado el {evaluacion.fecha.strftime('%d/%m/%Y') if evaluacion.fecha else 'N/A'}.
    
    Docente: {evaluacion.docente.nombre}
    Estado: {evaluacion.estado.value}
    Verificación: {evaluacion.codigo_firma or 'N/A'}
    
    Puede visualizar el acta oficial en línea en el siguiente enlace:
    {link_directivo}
    """
    
    # Versión HTML Profesional
    body_html = f"""
    <!DOCTYPE html>
    <html>
    <head>
        <style>
            body {{ font-family: 'Inter', sans-serif, Arial; line-height: 1.6; color: #333; margin: 0; padding: 0; background-color: #f4f7f9; }}
            .container {{ max-width: 600px; margin: 20px auto; background: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 15px rgba(0,0,0,0.1); border: 1px solid #e1e8ed; }}
            .header {{ background: linear-gradient(135deg, {secondary_color} 0%, {primary_color} 100%); color: #ffffff; padding: 35px 25px; text-align: center; }}
            .header h1 {{ margin: 0; font-size: 24px; font-weight: 700; letter-spacing: -0.5px; text-transform: uppercase; }}
            .header p {{ margin: 8px 0 0; font-size: 14px; opacity: 0.9; font-style: italic; font-weight: 300; }}
            .content {{ padding: 30px 40px; }}
            .greeting {{ font-size: 18px; font-weight: 600; color: {secondary_color}; margin-bottom: 20px; }}
            .data-table {{ width: 100%; border-collapse: separate; border-spacing: 0; margin: 25px 0; background: #f8fafc; border-radius: 8px; border: 1px solid #e2e8f0; }}
            .data-table td {{ padding: 12px 15px; border-bottom: 1px solid #e2e8f0; font-size: 14px; }}
            .data-table tr:last-child td {{ border-bottom: none; }}
            .label {{ font-weight: 700; color: #64748b; width: 35%; }}
            .value {{ color: #1e293b; font-weight: 500; }}
            .status-badge {{ background: #28a745; color: white; padding: 4px 10px; border-radius: 4px; font-size: 11px; font-weight: 700; }}
            .btn-container {{ text-align: center; margin: 35px 0 10px; }}
            .btn {{ background-color: #004080; color: #ffffff !important; padding: 14px 30px; border-radius: 8px; text-decoration: none; font-weight: 700; font-size: 15px; display: inline-block; box-shadow: 0 4px 6px rgba(0,64,128,0.2); }}
            .footer {{ background: #f8fafc; padding: 20px; text-align: center; font-size: 12px; color: #94a3b8; border-top: 1px solid #e2e8f0; }}
            .footer p {{ margin: 5px 0; }}
        </style>
    </head>
    <body>
        <div class="container">
            <div class="header">
                <h1>Acompañamiento Docente</h1>
                <p>Fortaleciendo la práctica pedagógica para una gestión de excelencia</p>
            </div>
            <div class="content">
                <div class="greeting">Estimado/a {evaluacion.docente.nombre},</div>
                <p>Se ha generado el registro oficial del acompañamiento docente realizado. Ya puede visualizar las observaciones y acuerdos alcanzados durante la sesión.</p>
                
                <table class="data-table">
                    <tr>
                        <td class="label">Docente</td>
                        <td class="value">{evaluacion.docente.nombre}</td>
                    </tr>
                    <tr>
                        <td class="label">Fecha</td>
                        <td class="value">{evaluacion.fecha.strftime('%d/%m/%Y') if evaluacion.fecha else 'N/A'}</td>
                    </tr>
                    <tr>
                        <td class="label">Estado</td>
                        <td class="value"><span class="status-badge">{evaluacion.estado.value}</span></td>
                    </tr>
                    <tr>
                        <td class="label">Verificación</td>
                        <td class="value" style="font-family: monospace; font-weight: 700; color: #004080;">{evaluacion.codigo_firma or 'N/A'}</td>
                    </tr>
                </table>
                
                <div class="btn-container">
                    <a href="__PUBLIC_LINK__" class="btn" style="background-color: {primary_color}; box-shadow: 0 4px 6px {primary_color}33;">Visualizar Acta Oficial</a>
                </div>
            </div>
            <div class="footer">
                <p><strong>Sistema de Acompañamiento Docente</strong></p>
                <p>Colegio Diego Portales y Macaya - Red de Acompañamiento</p>
                <p>© {datetime.now().year} - Equipo de Innovación Tecnológica</p>
            </div>
        </div>
    </body>
    </html>
    """
    
    # 4. Enviar correos por separado - Condicionado por 'target'
    
    # --- Email 1: Para el Docente (Copia al Observador) ---
    if target in ["all", "docente"] and recipients:
        html_docente = body_html.replace("__PUBLIC_LINK__", link_docente)
        docente_cc = [evaluacion.observador.email] if (evaluacion.observador and evaluacion.observador.email) else []
        send_evaluation_email(
            to_emails=recipients,
            subject=subject,
            body=body_plain_docente,
            body_html=html_docente,
            cc_emails=docente_cc,
            school_type=school_type
        )
    
    # --- Email 2: Para Directivos y Observador (CC) ---
    if cc_list:
        obs_email = evaluacion.observador.email if (evaluacion.observador and evaluacion.observador.email) else None
        # Filtrar para no enviar al docente aquí
        directivos_to = [email for email in cc_list if email != obs_email and email not in recipients]
        directivos_cc = [obs_email] if obs_email else []
        
        html_directivo = body_html.replace("__PUBLIC_LINK__", link_directivo)
        send_evaluation_email(
            to_emails=directivos_to,
            subject=subject + " (Informe Directivo)",
            body=body_plain_directivo,
            body_html=html_directivo,
            cc_emails=directivos_cc,
            school_type=school_type
        )
        
    return {
        "message": f"Envío '{target}' procesado", 
        "docente_enviado": target in ["all", "docente"] and bool(recipients), 
        "directivos_enviado": target in ["all", "directivo"] and bool(cc_list)
    }



