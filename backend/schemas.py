from pydantic import BaseModel, EmailStr, computed_field, Field
from datetime import date, datetime
from typing import Optional, List, Any


class RolBase(BaseModel):
    nombre: str


class RolResponse(RolBase):
    id: int

    class Config:
        from_attributes = True


class UsuarioBase(BaseModel):
    username: str
    nombre_completo: Optional[str] = None
    email: str


class UsuarioCreate(UsuarioBase):
    password: str
    rol_id: Optional[int] = 3
    acceso: Optional[str] = "liderazgo"
    colegio_id: Optional[str] = None
    activo: Optional[int] = 1


class UsuarioResponse(UsuarioBase):
    id: int
    rol_id: int
    acceso: Optional[str] = None
    colegio_id: Optional[str] = None
    activo: int
    rol: Optional[RolResponse] = None
    created_at: Optional[datetime]

    class Config:
        from_attributes = True


class UsuarioUpdate(BaseModel):
    username: Optional[str] = None
    nombre_completo: Optional[str] = None
    email: Optional[str] = None
    rol_id: Optional[int] = None
    acceso: Optional[str] = None
    colegio_id: Optional[str] = None
    activo: Optional[int] = None
    password: Optional[str] = None


class Token(BaseModel):
    access_token: str
    token_type: str


class TokenData(BaseModel):
    username: Optional[str] = None


class PasswordChangeRequest(BaseModel):
    new_password: str


class ForgotPasswordRequest(BaseModel):
    email: str


class ColegioBase(BaseModel):
    nombre: str
    direccion: Optional[str] = None


class ColegioCreate(ColegioBase):
    pass


class ColegioResponse(ColegioBase):
    id: int
    created_by: Optional[int]
    created_at: Optional[datetime]

    class Config:
        from_attributes = True


class NivelBase(BaseModel):
    nombre: str
    orden: Optional[int] = 0


class NivelCreate(NivelBase):
    pass


class NivelResponse(NivelBase):
    id: int

    class Config:
        from_attributes = True


class CursoBase(BaseModel):
    nivel_id: int
    letra: str


class CursoCreate(CursoBase):
    pass


class CursoResponse(CursoBase):
    id: int
    nivel: Optional[NivelResponse] = None
    created_by: Optional[int]
    created_at: Optional[datetime]

    class Config:
        from_attributes = True


class AsignaturaBase(BaseModel):
    nombre: str


class AsignaturaCreate(AsignaturaBase):
    pass


class AsignaturaResponse(AsignaturaBase):
    id: int
    created_by: Optional[int]
    created_at: Optional[datetime]

    class Config:
        from_attributes = True


class DocenteBase(BaseModel):
    nombre: str
    rut: str
    email: str
    colegio_id: int


class DocenteCreate(DocenteBase):
    pass


class DocenteResponse(DocenteBase):
    id: int
    created_by: Optional[int]
    created_at: Optional[datetime]
    colegio: Optional[ColegioResponse] = None
    totp_secret: Optional[str] = Field(None, exclude=True)
    @computed_field
    @property
    def has_totp(self) -> bool:
        return bool(self.totp_secret)

    class Config:
        from_attributes = True


class PlantillaBase(BaseModel):
    nombre: str
    nombre_largo: Optional[str] = None
    slug: Optional[str] = None
    tipo: str
    formato: Optional[str] = None
    colegio_id: Optional[int] = None
    config_puntuacion: Optional[str] = None
    activa: Optional[bool] = True


class PlantillaUpdate(BaseModel):
    nombre: Optional[str] = None
    nombre_largo: Optional[str] = None
    slug: Optional[str] = None
    tipo: Optional[str] = None
    formato: Optional[str] = None
    colegio_id: Optional[int] = None
    config_puntuacion: Optional[str] = None
    activa: Optional[bool] = None


class PlantillaCreate(PlantillaBase):
    pass


class PlantillaDuplicate(BaseModel):
    colegio_id: Optional[int] = None  # colegio destino (obligatorio para admin / director con varios colegios)


class PlantillaResponse(PlantillaBase):
    id: int
    created_at: Optional[datetime]

    class Config:
        from_attributes = True


class DimensionBase(BaseModel):
    plantilla_id: Optional[int] = None
    nombre: str
    descripcion: Optional[str] = None
    orden: Optional[int] = 0


class DimensionCreate(BaseModel):
    nombre: str
    descripcion: Optional[str] = None


class DimensionUpdate(BaseModel):
    nombre: Optional[str] = None
    descripcion: Optional[str] = None


class DimensionResponse(BaseModel):
    id: int
    nombre: str
    descripcion: Optional[str] = None
    orden: int
    subdimensiones: List["SubdimensionResponse"] = []

    class Config:
        from_attributes = True


class SubdimensionBase(BaseModel):
    dimension_id: int
    nombre: str
    descripcion: Optional[str] = None
    orden: Optional[int] = 0


class SubdimensionCreate(BaseModel):
    dimension_id: int
    nombre: str
    descripcion: Optional[str] = None


class SubdimensionUpdate(BaseModel):
    nombre: Optional[str] = None
    descripcion: Optional[str] = None


class SubdimensionResponse(BaseModel):
    id: int
    dimension_id: int
    nombre: str
    descripcion: Optional[str] = None
    orden: int

    class Config:
        from_attributes = True


class ReorderRequest(BaseModel):
    ids: List[int]


class RespuestaInput(BaseModel):
    subdimension_id: int
    valor: int
    estrategia: Optional[str] = None


class ApoyoInput(BaseModel):
    apoyo: str


class FortalezaAspectoInput(BaseModel):
    tipo: str
    contenido: str


class EstudianteInput(BaseModel):
    nombre_estudiante: str
    conducta_observada: str


class EvaluacionCreate(BaseModel):
    plantilla_id: Optional[int] = None
    docente_id: int
    curso_id: int
    asignatura_id: int
    fecha: date
    duracion: Optional[str] = None
    func_grupo: Optional[str] = "Adecuado"
    promedio: Optional[float] = None
    promedio_dim1: Optional[float] = None
    promedio_dim2: Optional[float] = None
    promedio_dim3: Optional[float] = None
    promedio_dim4: Optional[float] = None
    promedio_dim5: Optional[float] = None
    orientacion: Optional[str] = "Acompañamiento"
    nivel_apoyo: Optional[str] = "Nivel 1"
    comentarios: Optional[str] = None
    # Sección X
    fecha_retro: Optional[date] = None
    modalidad_retro: Optional[str] = None
    sintesis_retro: Optional[str] = None
    acuerdos_mejora: Optional[str] = None
    respuestas: Optional[List[RespuestaInput]] = []
    apoyos: Optional[List[ApoyoInput]] = []
    fortalezas_aspectos: Optional[List[FortalezaAspectoInput]] = []
    estudiantes_observados: Optional[List[EstudianteInput]] = []


class EvaluacionUpdate(BaseModel):
    plantilla_id: Optional[int] = None
    docente_id: Optional[int] = None
    colegio_id: Optional[int] = None
    curso_id: Optional[int] = None
    asignatura_id: Optional[int] = None
    fecha: Optional[date] = None
    duracion: Optional[str] = None
    func_grupo: Optional[str] = None
    promedio: Optional[float] = None
    promedio_dim1: Optional[float] = None
    promedio_dim2: Optional[float] = None
    promedio_dim3: Optional[float] = None
    promedio_dim4: Optional[float] = None
    promedio_dim5: Optional[float] = None
    orientacion: Optional[str] = None
    nivel_apoyo: Optional[str] = None
    comentarios: Optional[str] = None
    # Sección X
    fecha_retro: Optional[date] = None
    modalidad_retro: Optional[str] = None
    sintesis_retro: Optional[str] = None
    acuerdos_mejora: Optional[str] = None
    estado: Optional[str] = None
    respuestas: Optional[List[RespuestaInput]] = None
    apoyos: Optional[List[ApoyoInput]] = None
    fortalezas_aspectos: Optional[List[FortalezaAspectoInput]] = None
    estudiantes_observados: Optional[List[EstudianteInput]] = None


class EvaluacionRespuestaResponse(BaseModel):
    id: int
    subdimension_id: int
    valor: int
    estrategia: Optional[str] = None

    class Config:
        from_attributes = True


class EvaluacionApoyoResponse(BaseModel):
    id: int
    apoyo: str

    class Config:
        from_attributes = True


class FortalezaAspectoResponse(BaseModel):
    id: int
    tipo: str
    contenido: str

    class Config:
        from_attributes = True


class EvaluacionEstudianteResponse(BaseModel):
    id: int
    nombre_estudiante: Optional[str]
    conducta_observada: Optional[str]

    class Config:
        from_attributes = True


class EvaluacionResponse(BaseModel):
    id: int
    plantilla_id: Optional[int] = None
    usuario_id: int
    docente_id: int
    curso_id: int
    asignatura_id: int
    observador_id: int
    fecha: date
    duracion: Optional[str]
    func_grupo: str
    promedio: Optional[float] = None
    promedio_dim1: Optional[float] = None
    promedio_dim2: Optional[float] = None
    promedio_dim3: Optional[float] = None
    promedio_dim4: Optional[float] = None
    promedio_dim5: Optional[float] = None
    orientacion: str
    nivel_apoyo: str
    comentarios: Optional[str]
    # Sección X
    fecha_retro: Optional[date]
    modalidad_retro: Optional[str]
    sintesis_retro: Optional[str]
    acuerdos_mejora: Optional[str]
    estado: str
    codigo_firma: Optional[str] = None
    token_full: Optional[str] = None
    token_pedagogico: Optional[str] = None
    fecha_guardado: Optional[datetime]
    docente: Optional[DocenteResponse] = None
    curso: Optional[CursoResponse] = None
    asignatura: Optional[AsignaturaResponse] = None
    observador: Optional[UsuarioResponse] = None
    respuestas: List[EvaluacionRespuestaResponse] = []
    apoyos: List[EvaluacionApoyoResponse] = []
    fortalezas_aspectos: List[FortalezaAspectoResponse] = []
    estudiantes_observados: List[EvaluacionEstudianteResponse] = []

    class Config:
        from_attributes = True


class EvaluacionListResponse(BaseModel):
    id: int
    plantilla_id: Optional[int] = None
    plantilla_nombre: Optional[str] = None
    plantilla_slug: Optional[str] = None
    plantilla_formato: Optional[str] = None
    fecha: date
    promedio: Optional[float] = None
    func_grupo: Optional[str] = None
    orientacion: Optional[str] = None
    docente_id: int
    docente_nombre: Optional[str] = None
    colegio_id: Optional[int] = None
    colegio_nombre: Optional[str] = None
    curso_nombre: Optional[str] = None
    asignatura_nombre: Optional[str] = None
    observador_id: Optional[int] = None
    observador_nombre: Optional[str] = None
    usuario_id: Optional[int] = None
    estado: str
    codigo_firma: Optional[str] = None
    token_full: Optional[str] = None
    token_pedagogico: Optional[str] = None
    fecha_guardado: Optional[datetime]
    tiene_pdf: bool = False  # True si es una visita histórica subida como PDF

    class Config:
        from_attributes = True


DimensionResponse.model_rebuild()


# ===================== Metas de Visitas (por usuario) =====================
class MetaBase(BaseModel):
    usuario_id: int
    anio: int
    periodo: str = "ANUAL"   # SEMESTRE | ANUAL
    cantidad: int = 0


class MetaCreate(MetaBase):
    pass


class MetaUpdate(BaseModel):
    usuario_id: Optional[int] = None
    anio: Optional[int] = None
    periodo: Optional[str] = None
    cantidad: Optional[int] = None


class MetaResponse(MetaBase):
    id: int
    colegio_id: Optional[int] = None
    colegio_nombre: Optional[str] = None
    usuario_nombre: Optional[str] = None
    rol_nombre: Optional[str] = None
    created_at: Optional[datetime] = None

    class Config:
        from_attributes = True
