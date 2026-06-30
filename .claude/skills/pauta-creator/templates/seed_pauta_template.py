"""
Plantilla de seed para crear una nueva PAUTA de Visita.

Copia este archivo a backend/seed_<area>.py, reemplaza los marcadores <<...>> y
ejecútalo una sola vez con el venv activo (o dentro del contenedor):

    python backend/seed_<area>.py

Es IDEMPOTENTE: si la plantilla (por slug) ya existe, no la duplica.
Sigue el patrón de backend/seed_convivencia.py y auto_migrate_pie_plantilla (main.py).
"""

import sys
import os
import json

# Permite importar `database` y `models` al ejecutar el script directamente.
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from database import SessionLocal
from models import Plantilla, Dimension, Subdimension, Colegio

# ---------------------------------------------------------------------------
# CONFIGURACIÓN DE LA PAUTA  (rellena estos valores)
# ---------------------------------------------------------------------------

NOMBRE       = "<<Nombre corto de la pauta>>"
NOMBRE_LARGO = "<<Título completo (o None)>>"
SLUG         = "<<slug-unico>>"        # ≤ 20 chars, [a-z0-9-], único en eval_plantillas
TIPO         = "VISITA"                # "VISITA" | "LIDERAZGO"
FORMATO      = "<<ORIENTACION|PIE|UTP|LIDERAZGO>>"  # decide el render en visitas.js
COLEGIO_ID   = <<id_colegio_o_None>>   # int para VISITA; None solo si es global (built-in)

# --- Escala / config_puntuacion -------------------------------------------
# Opción A) Binaria (Observado=1 / No observado=0):
CONFIG_PUNTUACION = "observado"
#
# Opción B) Escala numérica (descomenta y ajusta; deja la línea de arriba comentada):
# CONFIG_PUNTUACION = json.dumps({
#     "escala": "4_niveles",
#     "niveles": [
#         {"valor": 0, "nombre": "N/O",        "color": "slate"},
#         {"valor": 1, "nombre": "Deficiente", "color": "rose"},
#         {"valor": 2, "nombre": "Básico",     "color": "amber"},
#         {"valor": 3, "nombre": "Competente", "color": "emerald"},
#         {"valor": 4, "nombre": "Excelente",  "color": "indigo"},
#     ],
#     "opcion_no_observado": {"permitido": True, "valor_guardado": 0, "excluir_del_calculo": True},
# })

# --- Dimensiones e indicadores --------------------------------------------
# Cada dimensión tiene su lista de indicadores (el texto que ve el evaluador).
DIMENSIONES = [
    {
        "nombre": "<<Nombre de la Dimensión 1>>",
        "descripcion": None,
        "indicadores": [
            "<<Texto del indicador 1.1>>",
            "<<Texto del indicador 1.2>>",
        ],
    },
    # Agrega más dimensiones si la pauta las tiene:
    # {"nombre": "...", "descripcion": None, "indicadores": ["...", "..."]},
]

# ---------------------------------------------------------------------------
# LÓGICA (normalmente no necesitas editar debajo de esta línea)
# ---------------------------------------------------------------------------

def seed():
    db = SessionLocal()
    try:
        # Idempotencia: no duplicar si el slug ya existe.
        existente = db.query(Plantilla).filter(Plantilla.slug == SLUG).first()
        if existente:
            print(f"⏭️  La plantilla '{SLUG}' ya existe (ID {existente.id}). Nada que hacer.")
            return

        # Validar colegio destino para pautas de VISITA.
        if TIPO.upper() == "VISITA" and COLEGIO_ID is not None:
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
        db.flush()  # obtiene plantilla.id sin cerrar la transacción

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
        print(f"✅ Plantilla '{NOMBRE}' creada (ID {plantilla.id}, slug '{SLUG}').")
    except Exception as e:
        db.rollback()
        print(f"❌ Error al sembrar la pauta: {e}")
        raise
    finally:
        db.close()


if __name__ == "__main__":
    seed()
