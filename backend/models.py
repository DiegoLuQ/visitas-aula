from sqlalchemy import Column, Integer, String, Float, Text, DateTime, Date, ForeignKey, UniqueConstraint, Enum, Boolean
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from database import Base
import enum


class Rol(Base):
    __tablename__ = "auth_roles"

    id = Column(Integer, primary_key=True, index=True)
    nombre = Column(String(50), unique=True, nullable=False)

    usuarios = relationship("Usuario", back_populates="rol")


class Usuario(Base):
    __tablename__ = "auth_usuarios"

    id = Column(Integer, primary_key=True, index=True)
    username = Column(String(50), unique=True, index=True, nullable=False)
    nombre_completo = Column(String(150), nullable=True)  # Nombre y apellido del usuario
    email = Column(String(100), unique=True, index=True, nullable=False)
    password_hash = Column(String(255), nullable=False)
    rol_id = Column(Integer, ForeignKey("auth_roles.id"), nullable=False, default=3)
    acceso = Column(String(20), default="liderazgo") # liderazgo, visita, todos
    colegio_id = Column(String(50), nullable=True) # ID del colegio asignado (puede ser "1", "1,2", etc.)
    activo = Column(Integer, default=1)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    rol = relationship("Rol", back_populates="usuarios")
    evaluaciones = relationship("Evaluacion", foreign_keys="[Evaluacion.usuario_id]", back_populates="usuario")
    colegios_creados = relationship("Colegio", back_populates="creado_por")
    docentes_creados = relationship("Docente", back_populates="creado_por")
    cursos_creados = relationship("Curso", back_populates="creado_por")
    asignaturas_creadas = relationship("Asignatura", back_populates="creado_por")


class Colegio(Base):
    __tablename__ = "cat_colegios"

    id = Column(Integer, primary_key=True, index=True)
    nombre = Column(String(200), nullable=False)
    direccion = Column(String(255))
    created_by = Column(Integer, ForeignKey("auth_usuarios.id"))
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    creado_por = relationship("Usuario", back_populates="colegios_creados")
    docentes = relationship("Docente", back_populates="colegio")


class Nivel(Base):
    __tablename__ = "cat_niveles"

    id = Column(Integer, primary_key=True, index=True)
    nombre = Column(String(100), nullable=False)
    orden = Column(Integer, default=0)

    cursos = relationship("Curso", back_populates="nivel")


class Curso(Base):
    __tablename__ = "cat_cursos"

    id = Column(Integer, primary_key=True, index=True)
    nivel_id = Column(Integer, ForeignKey("cat_niveles.id"), nullable=False)
    letra = Column(String(5), nullable=False)
    created_by = Column(Integer, ForeignKey("auth_usuarios.id"))
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    __table_args__ = (
        UniqueConstraint('nivel_id', 'letra', name='unique_nivel_letra'),
    )

    nivel = relationship("Nivel", back_populates="cursos")
    creado_por = relationship("Usuario", back_populates="cursos_creados")
    evaluaciones = relationship("Evaluacion", back_populates="curso")


class Asignatura(Base):
    __tablename__ = "cat_asignaturas"

    id = Column(Integer, primary_key=True, index=True)
    nombre = Column(String(100), nullable=False)
    created_by = Column(Integer, ForeignKey("auth_usuarios.id"))
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    creado_por = relationship("Usuario", back_populates="asignaturas_creadas")
    evaluaciones = relationship("Evaluacion", back_populates="asignatura")


class TipoFuncionario(Base):
    __tablename__ = "cat_tipo_funcionario"

    id = Column(Integer, primary_key=True, index=True)
    nombre = Column(String(100), nullable=False)

    docentes = relationship("Docente", back_populates="tipo_funcionario")


class Docente(Base):
    __tablename__ = "cat_docentes"

    id = Column(Integer, primary_key=True, index=True)
    nombre = Column(String(100), nullable=False)
    rut = Column(String(20), nullable=False)
    email = Column(String(100))
    colegio_id = Column(Integer, ForeignKey("cat_colegios.id"), nullable=False)
    id_tipo_funcionario = Column(Integer, ForeignKey("cat_tipo_funcionario.id"), nullable=True)
    totp_secret = Column(String(100), nullable=True)  # Secreto Base32 para TOTP
    created_by = Column(Integer, ForeignKey("auth_usuarios.id"))
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    __table_args__ = (
        UniqueConstraint('rut', 'colegio_id', name='unique_rut_colegio'),
    )

    colegio = relationship("Colegio", back_populates="docentes")
    tipo_funcionario = relationship("TipoFuncionario", back_populates="docentes")
    creado_por = relationship("Usuario", back_populates="docentes_creados")
    evaluaciones = relationship("Evaluacion", back_populates="docente")

class Plantilla(Base):
    __tablename__ = "eval_plantillas"

    id = Column(Integer, primary_key=True, index=True)
    nombre = Column(String(200), nullable=False)
    nombre_largo = Column(String(255), nullable=True)
    slug = Column(String(20), unique=True, index=True)
    tipo = Column(String(50), nullable=False) # 'LIDERAZGO' o 'VISITA'
    formato = Column(String(20), nullable=True) # Diseño del formulario: 'LIDERAZGO', 'ORIENTACION' o 'UTP'
    colegio_id = Column(Integer, ForeignKey("cat_colegios.id"), nullable=True) # NULL = global (LIDERAZGO); las VISITA pertenecen a un colegio
    config_puntuacion = Column(Text, nullable=True) # Almacenado como JSON string
    activa = Column(Boolean, default=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    colegio = relationship("Colegio")
    dimensiones = relationship("Dimension", back_populates="plantilla")
    evaluaciones = relationship("Evaluacion", back_populates="plantilla")


class Dimension(Base):
    __tablename__ = "eval_dimensiones"

    id = Column(Integer, primary_key=True, index=True)
    plantilla_id = Column(Integer, ForeignKey("eval_plantillas.id"), nullable=True)
    nombre = Column(String(100), nullable=False)
    descripcion = Column(Text)
    orden = Column(Integer, default=0)

    plantilla = relationship("Plantilla", back_populates="dimensiones")
    subdimensiones = relationship("Subdimension", back_populates="dimension")


class Subdimension(Base):
    __tablename__ = "eval_subdimensiones"

    id = Column(Integer, primary_key=True, index=True)
    dimension_id = Column(Integer, ForeignKey("eval_dimensiones.id"), nullable=False)
    nombre = Column(String(200), nullable=False)
    descripcion = Column(Text)
    orden = Column(Integer, default=0)

    dimension = relationship("Dimension", back_populates="subdimensiones")
    respuestas = relationship("EvaluacionRespuesta", back_populates="subdimension")


class EvaluacionEstado(enum.Enum):
    BORRADOR = "BORRADOR"
    LISTO_PARA_FIRMA = "LISTO_PARA_FIRMA"
    FIRMADA_DOCENTE = "FIRMADA_DOCENTE"
    CERRADA = "CERRADA"


class Evaluacion(Base):
    __tablename__ = "eval_evaluaciones"

    id = Column(Integer, primary_key=True, index=True)
    plantilla_id = Column(Integer, ForeignKey("eval_plantillas.id"), nullable=True)
    usuario_id = Column(Integer, ForeignKey("auth_usuarios.id"), nullable=False)
    docente_id = Column(Integer, ForeignKey("cat_docentes.id"), nullable=False)
    # Nullable: las visitas históricas subidas como PDF no registran curso ni asignatura.
    curso_id = Column(Integer, ForeignKey("cat_cursos.id"), nullable=True)
    asignatura_id = Column(Integer, ForeignKey("cat_asignaturas.id"), nullable=True)
    observador_id = Column(Integer, ForeignKey("auth_usuarios.id"), nullable=True)
    fecha = Column(Date, nullable=False)
    duracion = Column(String(50))
    func_grupo = Column(String(20))
    promedio = Column(Float)
    promedio_dim1 = Column(Float)
    promedio_dim2 = Column(Float)
    promedio_dim3 = Column(Float)
    promedio_dim4 = Column(Float)
    promedio_dim5 = Column(Float)
    orientacion = Column(String(50))
    nivel_apoyo = Column(String(50))
    comentarios = Column(Text)
    # Sección X: Psicología Organizacional
    fecha_retro = Column(Date, nullable=True)
    modalidad_retro = Column(String(255), nullable=True)
    sintesis_retro = Column(Text, nullable=True)
    acuerdos_mejora = Column(Text, nullable=True)
    estado = Column(Enum(EvaluacionEstado), default=EvaluacionEstado.BORRADOR, nullable=False)
    fecha_firma_docente = Column(DateTime(timezone=True), nullable=True)
    codigo_firma = Column(String(20), nullable=True)
    token_full = Column(String(50), nullable=True, index=True)
    token_pedagogico = Column(String(50), nullable=True, index=True)
    fecha_guardado = Column(DateTime(timezone=True), server_default=func.now())

    plantilla = relationship("Plantilla", back_populates="evaluaciones")
    usuario = relationship("Usuario", foreign_keys=[usuario_id], back_populates="evaluaciones")
    docente = relationship("Docente", back_populates="evaluaciones")
    curso = relationship("Curso", back_populates="evaluaciones")
    asignatura = relationship("Asignatura", back_populates="evaluaciones")
    observador = relationship("Usuario", foreign_keys=[observador_id])
    respuestas = relationship("EvaluacionRespuesta", back_populates="evaluacion", cascade="all, delete-orphan")
    apoyos = relationship("EvaluacionApoyo", back_populates="evaluacion", cascade="all, delete-orphan")
    fortalezas_aspectos = relationship("FortalezaAspecto", back_populates="evaluacion", cascade="all, delete-orphan")
    estudiantes_observados = relationship("EvaluacionEstudiante", back_populates="evaluacion", cascade="all, delete-orphan")
    pdf_visita = relationship("PdfVisita", back_populates="evaluacion", uselist=False, cascade="all, delete-orphan")


class EvaluacionEstudiante(Base):
    __tablename__ = "eval_estudiantes_observados"

    id = Column(Integer, primary_key=True, index=True)
    evaluacion_id = Column(Integer, ForeignKey("eval_evaluaciones.id"), nullable=False)
    nombre_estudiante = Column(String(200), nullable=True)
    conducta_observada = Column(Text, nullable=True)

    evaluacion = relationship("Evaluacion", back_populates="estudiantes_observados")


class EvaluacionRespuesta(Base):
    __tablename__ = "eval_respuestas"

    id = Column(Integer, primary_key=True, index=True)
    evaluacion_id = Column(Integer, ForeignKey("eval_evaluaciones.id"), nullable=False)
    subdimension_id = Column(Integer, ForeignKey("eval_subdimensiones.id"), nullable=False)
    valor = Column(Integer, nullable=False)
    estrategia = Column(Text, nullable=True)

    evaluacion = relationship("Evaluacion", back_populates="respuestas")
    subdimension = relationship("Subdimension", back_populates="respuestas")


class EvaluacionApoyo(Base):
    __tablename__ = "eval_apoyos"

    id = Column(Integer, primary_key=True, index=True)
    evaluacion_id = Column(Integer, ForeignKey("eval_evaluaciones.id"), nullable=False)
    apoyo = Column(String(100), nullable=False)

    evaluacion = relationship("Evaluacion", back_populates="apoyos")


class FortalezaAspecto(Base):
    __tablename__ = "eval_fortalezas_aspectos"

    id = Column(Integer, primary_key=True, index=True)
    evaluacion_id = Column(Integer, ForeignKey("eval_evaluaciones.id"), nullable=False)
    tipo = Column(String(20), nullable=False)
    contenido = Column(Text, nullable=False)

    evaluacion = relationship("Evaluacion", back_populates="fortalezas_aspectos")


class EmailRecipient(Base):
    __tablename__ = "cfg_email_recipients"

    id = Column(Integer, primary_key=True, index=True)
    email = Column(String(255), nullable=False)
    nombre = Column(String(255), nullable=False)
    colegio_id = Column(Integer, ForeignKey("cat_colegios.id"), nullable=True)
    recibe_reporte = Column(Boolean, default=False)  # Opción B: Check para reporte semanal
    activo = Column(Boolean, default=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    colegio = relationship("Colegio")


class ReportHistory(Base):
    __tablename__ = "log_report_history"

    id = Column(Integer, primary_key=True, index=True)
    tipo_reporte = Column(String(50))  # 'SEMANAL', 'BACKUP'
    destinatarios = Column(Text)       # Lista de correos
    fecha_envio = Column(DateTime(timezone=True), server_default=func.now())
    status = Column(String(20))        # 'EXITO', 'ERROR'
    error_message = Column(Text, nullable=True)


class Meta(Base):
    """Meta de visitas por USUARIO (cantidad de visitas por semestre o año).

    Cada visitador tiene su propia meta individual; dos usuarios con el mismo rol
    (p. ej. dos UTP) tienen metas y conteos independientes.
    """
    __tablename__ = "cfg_metas"
    __table_args__ = (UniqueConstraint("usuario_id", "anio", name="uq_meta_usuario_anio"),)

    id = Column(Integer, primary_key=True, index=True)
    usuario_id = Column(Integer, ForeignKey("auth_usuarios.id"), nullable=False)
    colegio_id = Column(Integer, ForeignKey("cat_colegios.id"), nullable=True)  # derivado del usuario
    anio = Column(Integer, nullable=False)
    periodo = Column(String(20), nullable=False, default="ANUAL")  # SEMESTRE | ANUAL
    cantidad = Column(Integer, nullable=False, default=0)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    usuario = relationship("Usuario")
    colegio = relationship("Colegio")


class DeletedEvaluation(Base):
    __tablename__ = "form_eliminados"

    id = Column(Integer, primary_key=True, index=True)
    original_eval_id = Column(Integer, nullable=False)
    docente_nombre = Column(String(200))
    colegio_nombre = Column(String(200))
    curso_nombre = Column(String(100))
    asignatura_nombre = Column(String(100))
    fecha_observacion = Column(Date, nullable=True)
    promedio = Column(Float, nullable=True)
    estado_al_eliminar = Column(String(50))
    eliminado_por_id = Column(Integer, nullable=False)
    eliminado_por_username = Column(String(100))
    fecha_eliminacion = Column(DateTime(timezone=True), server_default=func.now())
    motivo = Column(Text, nullable=True)


class PdfVisita(Base):
    """Respaldo documental de visitas históricas subidas como PDF.

    Cada registro apunta a una Evaluacion (estado CERRADA) creada solo con los
    datos esenciales (docente, plantilla, usuario, fechas). El PDF se comprime y
    se guarda en el filesystem del backend; aquí solo se almacena la ruta.
    """
    __tablename__ = "pdf_visita"

    id = Column(Integer, primary_key=True, index=True)
    evaluacion_id = Column(Integer, ForeignKey("eval_evaluaciones.id"), nullable=False, unique=True)
    ruta_archivo = Column(String(500), nullable=False)   # ruta relativa dentro de backend/uploads
    nombre_original = Column(String(255), nullable=True)
    tamano_original = Column(Integer, nullable=True)     # bytes antes de comprimir
    tamano_comprimido = Column(Integer, nullable=True)   # bytes luego de comprimir
    fecha_subida = Column(DateTime(timezone=True), server_default=func.now())

    evaluacion = relationship("Evaluacion", back_populates="pdf_visita")
