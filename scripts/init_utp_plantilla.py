
import sys
import os
sys.path.append(os.path.join(os.getcwd(), 'backend'))

from database import SessionLocal
from models import Plantilla, Dimension, Subdimension
import json

def init_utp():
    db = SessionLocal()
    try:
        # 1. Crear la Plantilla
        plantilla_utp = Plantilla(
            nombre="Pauta de Acompañamiento UTP",
            tipo="VISITA",
            config_puntuacion=json.dumps({
                "escala": "5_niveles",
                "niveles": [
                    {"valor": 0, "nombre": "N/A", "color": "slate"},
                    {"valor": 1, "nombre": "Inicial", "color": "rose"},
                    {"valor": 2, "nombre": "En Desarrollo", "color": "amber"},
                    {"valor": 3, "nombre": "Adecuado", "color": "emerald"},
                    {"valor": 4, "nombre": "Destacado", "color": "indigo"}
                ]
            }),
            activa=True
        )
        db.add(plantilla_utp)
        db.flush() # Para obtener el ID

        # 2. Dimensiones e Indicadores
        dims_data = [
            {
                "nombre": "CREACIÓN DE UN AMBIENTE PROPICIO PARA EL APRENDIZAJE",
                "indicadores": [
                    "Se observan rutinas instaladas en los estudiantes que favorecen el uso del tiempo destinado al aprendizaje (como, por ejemplo: ingreso oportuno a la sala e inicio de la clase, limpieza u orden del aula, organización de los estudiantes en sus puestos, solicitud para tomar la palabra, formar grupos de trabajo etc.).",
                    "Comunica objetivos, instrucciones y explicaciones de modo claro y preciso para guiar el proceso de APRENDIZAJE; posibilitando el trabajo autónomo de los estudiantes.",
                    "El/la docente implementa pausas activas en el cambio de hora o durante la sesión (Al observar fatiga en sus estudiantes) generando adecuadas interacciones con su alumnado.",
                    "Utiliza ejemplos contextualizados a las necesidades y características del curso y nivel según el OBJETIVO de clase abordado en la sesión.",
                    "Genera una ambiente cercano durante la clase, con el propósito de visualizar el estado emocional de los estudiantes.",
                    "La (el) docente promueve la participación de los estudiantes en todos los momentos de la clase.",
                    "La (el) docente verbaliza conductas positivas observadas durante la clase, que contribuyen al aprendizaje (“Qué bien hecha esa tarea” “me gusta tu respuesta”, “gracias por tu aporte”, etc.)",
                    "El/la docente aplica sistemáticamente estrategias para centrar la atención en la tarea."
                ]
            },
            {
                "nombre": "MODELO DE ENSEÑANZA",
                "indicadores": [
                    "El/la docente propician espacios de participación activa y de producción individual y/o grupal por parte de los estudiantes. Los estudiantes Hacen en la sesión.",
                    "El/la docente utiliza recursos didácticos, para visibilizar de manera concreta y oportuna la participación de los estudiantes en sus aprendizajes. (ticket de entrada - salida, quizziz, entre otros)",
                    "Tanto al inicio de la clase como durante la sesión, el/la docente formula preguntas o implementa actividades que permiten activar conocimientos de los estudiantes.",
                    "Los ejemplos utilizados por el/la docente permiten la comprensión del contenido, procedimiento o actitud trabajada durante la clase.",
                    "El/la docente recurre a variadas estrategias didácticas para enseñar el mismo concepto, respetando así el principio de DIVERSIDAD.",
                    "El docente formula preguntas desafiantes, que estimulan en los estudiantes algunas de las siguientes habilidades: reflexión, análisis crítico, indagación o aplicación de los contenidos que se están trabajando en la asignatura.",
                    "Por medio de preguntas, el/la docente guía al estudiante para que argumente sus procedimientos, utilizando vocabulario de la asignatura, de acuerdo al nivel en que se enseña.",
                    "Ante las dificultades que observa el docente al monitorear la realización de las actividades, éste gestiona el error por medio de preguntas, evitando dar las respuestas a sus estudiantes.",
                    "Durante la clase, el/la docente ejecuta actividades para recoger evidencias del logro del objetivo propuesto.",
                    "El/la docente promueve la metacognición, invitando a los estudiantes a tomar conciencia de su aprendizaje, sus fortalezas y aspectos a mejorar en la asignatura.",
                    "El/la docente utiliza estrategias y procedimientos de evaluación de tipo formativa para verificar el aprendizaje de los estudiantes (hace que los estudiantes creen sus propios apuntes/resúmenes/cuadros sinópticos/mapa mental, etc).",
                    "Todas las actividades son coherentes con el objetivo de aprendizaje declarado en la clase por el/la docente.",
                    "El/la docente hace uso de vocabulario técnico de su asignatura durante toda la clase.",
                    "La (el) docente retroalimenta constantemente las respuestas de los estudiantes por medio oral y/o escrito, de manera positiva y asertiva.",
                    "El docente guía a los estudiantes para hacer conexiones entre los contenidos de la clase con otros ejes temáticos de las asignaturas, situaciones de vida diaria o valores universales."
                ]
            },
            {
                "nombre": "USO DEL TIEMPO",
                "indicadores": [
                    "El/la docente inicia y concluye su clase en el horario establecido; cubriendo el horario planificado.",
                    "El tiempo destinado para cada actividad es suficiente para que la mayoría del curso termine su trabajo.",
                    "La clase se desarrolla de tal modo que los estudiantes siempre están trabajando y donde no hay tiempos de inactividad.",
                    "Durante toda la clase, las transiciones son fluidas y permiten mantener el ritmo de clases.",
                    "Durante la clase el docente desafía cognitivamente a los estudiantes graduando complejidad de tareas y distribuyendo los tiempos de la sesión."
                ]
            }
        ]

        for idx, d in enumerate(dims_data):
            dim = Dimension(
                plantilla_id=plantilla_utp.id,
                nombre=d["nombre"],
                orden=idx + 1
            )
            db.add(dim)
            db.flush()

            for s_idx, ind_text in enumerate(d["indicadores"]):
                sub = Subdimension(
                    dimension_id=dim.id,
                    nombre=f"Indicador {s_idx + 1}",
                    descripcion=ind_text,
                    orden=s_idx + 1
                )
                db.add(sub)
        
        db.commit()
        print(f"Plantilla UTP creada con ID: {plantilla_utp.id}")
        
    except Exception as e:
        db.rollback()
        print(f"Error: {e}")
    finally:
        db.close()

if __name__ == "__main__":
    init_utp()
