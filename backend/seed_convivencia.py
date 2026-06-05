
import sys
import os

# Añadir el directorio actual al path para importar database y models
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from database import SessionLocal
from models import Plantilla, Dimension, Subdimension

def seed():
    db = SessionLocal()
    try:
        # 1. Crear la Plantilla
        nueva_plantilla = Plantilla(
            nombre="Orientación y Convivencia Escolar",
            tipo="visita",
            config_puntuacion="observado", # Marcador especial para UI
            activa=True
        )
        db.add(nueva_plantilla)
        db.flush()

        # 2. Crear la Dimensión Principal
        dimension = Dimension(
            plantilla_id=nueva_plantilla.id,
            nombre="Gestión de la Convivencia y Clima de Aula",
            orden=1
        )
        db.add(dimension)
        db.flush()

        # 3. Listado de Indicadores
        indicadores = [
            'Establece una relación de cordialidad con sus estudiantes durante la clase.',
            'Promueve el respeto mutuo, la reciprocidad y el compañerismo entre los/as estudiantes.',
            'Promueve que los y las estudiantes participen activamente en el proceso de aprendizaje, respetando turnos y ordenadamente.',
            'Establece y aplica normas que favorecen el aprendizaje en conjunto con sus estudiantes.',
            'Monitorea y aborda formativamente el cumplimiento de las normas establecidas en el Manual de Convivencia Escolar.',
            'Se observa una sala ordenada y limpia en base a las características de la clase dispuestas por el profesor.',
            'El/la docente tiene el manejo adecuado de la disciplina de los/las estudiantes en el aula, en base al Manual de Convivencia Escolar.',
            'Se promueve la resolución adecuada de conflictos en el aula.',
            'Aborda el desplazamiento innecesario de los estudiantes durante la clase.',
            'Se evidencia durante la clase que se aborde la confianza, como valor formativo de nuestro colegio, ya sea de forma explícita o implícita.',
            'Se evidencia durante la clase que se aborde la responsabilidad como valor formativo de nuestro colegio, ya sea de forma explícita o implícita.'
        ]

        for i, texto in enumerate(indicadores):
            sub = Subdimension(
                dimension_id=dimension.id,
                nombre=f"Indicador {i+1}",
                descripcion=texto,
                orden=i+1
            )
            db.add(sub)
        
        db.commit()
        print(f"✅ Plantilla '{nueva_plantilla.nombre}' creada con éxito (ID: {nueva_plantilla.id})")
    except Exception as e:
        db.rollback()
        print(f"❌ Error al sembrar plantilla: {e}")
    finally:
        db.close()

if __name__ == "__main__":
    seed()
