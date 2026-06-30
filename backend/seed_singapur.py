"""
Seed de la pauta "Observación Método Singapur" (Matemática) para la plataforma de Visitas.

Generada a partir de json-pautas/pauta-singapur.json con la skill pauta-creator.
Usa escala numérica 0–3 guiada por `config_puntuacion` (formato=ESCALA), por lo que
NO requiere cambios de frontend: el render lo resuelve parseEscala() en visitas.js.

Uso (una sola vez, con el venv activo o dentro del contenedor):

    1) Edita COLEGIO_ID con el id del colegio destino (cat_colegios).
    2) python backend/seed_singapur.py

Es IDEMPOTENTE: si la plantilla (slug 'singapur') ya existe, no la duplica.
"""

import sys
import os
import json

sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from database import SessionLocal
from models import Plantilla, Dimension, Subdimension, Colegio

# ---------------------------------------------------------------------------
# CONFIGURACIÓN  (ajusta COLEGIO_ID antes de ejecutar)
# ---------------------------------------------------------------------------

NOMBRE       = "Observación Método Singapur"
NOMBRE_LARGO = "Pauta de Observación de Aula — Método Singapur (Matemática)"
SLUG         = "singapur"        # ≤ 20 chars, único en eval_plantillas
TIPO         = "VISITA"
FORMATO      = "ESCALA"          # render guiado por config_puntuacion
COLEGIO_ID   = None             # TODO: id del colegio destino (obligatorio)

# Escala de apreciación 3..0 (No observado se excluye del promedio).
CONFIG_PUNTUACION = json.dumps({
    "escala": "4_niveles_0_3",
    "niveles": [
        {"valor": 3, "nombre": "Logrado",              "color": "emerald"},
        {"valor": 2, "nombre": "Medianamente logrado", "color": "amber"},
        {"valor": 1, "nombre": "No logrado",           "color": "rose"},
        {"valor": 0, "nombre": "No observado",         "color": "slate"},
    ],
    "opcion_no_observado": {"permitido": True, "valor_guardado": 0, "excluir_del_calculo": True},
    "texto_por_indicador": {
        "mostrar": True,
        "etiqueta": "Evidencia",
        "placeholder": "Registre la evidencia observada para este indicador...",
    },
})

DIMENSIONES = [
    {
        "nombre": "Aspectos Formales",
        "descripcion": None,
        "indicadores": [
            "Establece las metas y/u objetivos de aprendizaje y la estructura de la clase. Fase Indagación.",
            "En el desarrollo de la clase se aprecia un trabajo sistemático y planificado, manteniendo la atención del grupo. Fase Exploración.",
            "Realiza un cierre en que sistematiza los conocimientos y habilidad matemática surgida o trabajados en la clase. Fase sistematización.",
        ],
    },
    {
        "nombre": "Gestión Curricular de Aula",
        "descripcion": None,
        "indicadores": [
            "Utiliza distintos tipos de representación (concreto – pictórico – simbólico) de la noción matemática en estudio.",
            "Gestiona la actividad propuesta generando las condiciones para que los alumnos exploren sobre el conocimiento matemático en estudio.",
            "Articula los conocimientos matemáticos estudiados en la clase y en clases anteriores.",
            "Promueve que los estudiantes argumenten sus respuestas y procedimientos.",
            "Promueve la participación y monitorea el aprendizaje colaborativo, permitiendo comunicar y contrastar conjeturas y procesos. Procesos en conjunto con docente o asistente que colabora en la clase.",
            "Realiza una gestión frente a los errores que posibilita a los estudiantes reconocer por qué se han equivocado, promoviendo nuevos aprendizajes.",
            "Muestra dominio del tema en estudio y un lenguaje matemático apropiado durante la clase.",
            "Logra relacionar los contenidos matemáticos en estudio con el material didáctico.",
            "Permite a los alumnos experiencias meta cognitivas, orientando a los alumnos para lograr procesos introspectivos.",
            "Otorga el tiempo necesario para que los estudiantes logren realizar cada una de las actividades planteadas en clases.",
        ],
    },
]

# ---------------------------------------------------------------------------
# LÓGICA
# ---------------------------------------------------------------------------

def seed():
    if COLEGIO_ID is None:
        raise SystemExit("⚠️  Define COLEGIO_ID (id de cat_colegios) antes de ejecutar este seed.")

    db = SessionLocal()
    try:
        existente = db.query(Plantilla).filter(Plantilla.slug == SLUG).first()
        if existente:
            print(f"⏭️  La plantilla '{SLUG}' ya existe (ID {existente.id}). Nada que hacer.")
            return

        if not db.query(Colegio).filter(Colegio.id == COLEGIO_ID).first():
            raise ValueError(f"colegio_id={COLEGIO_ID} no existe en cat_colegios.")

        plantilla = Plantilla(
            nombre=NOMBRE,
            nombre_largo=NOMBRE_LARGO,
            slug=SLUG,
            tipo=TIPO,
            formato=FORMATO,
            colegio_id=COLEGIO_ID,
            config_puntuacion=CONFIG_PUNTUACION,
            activa=True,
        )
        db.add(plantilla)
        db.flush()

        for d_idx, dim_data in enumerate(DIMENSIONES, start=1):
            dim = Dimension(
                plantilla_id=plantilla.id,
                nombre=dim_data["nombre"],
                descripcion=dim_data.get("descripcion"),
                orden=d_idx,
            )
            db.add(dim)
            db.flush()

            for i_idx, texto in enumerate(dim_data["indicadores"], start=1):
                db.add(Subdimension(
                    dimension_id=dim.id,
                    nombre=f"Indicador {d_idx}.{i_idx}",
                    descripcion=texto,
                    orden=i_idx,
                ))

        db.commit()
        print(f"✅ Plantilla '{NOMBRE}' creada (ID {plantilla.id}, slug '{SLUG}', colegio {COLEGIO_ID}).")
    except Exception as e:
        db.rollback()
        print(f"❌ Error al sembrar la pauta: {e}")
        raise
    finally:
        db.close()


if __name__ == "__main__":
    seed()
