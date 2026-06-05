from database import engine, SessionLocal, Base
from models import Rol, Usuario, Nivel, Dimension, Subdimension, Asignatura
from auth import get_password_hash
import sys


def seed_data():
    print("Iniciando seed de datos...")
    print("="*50)
    
    Base.metadata.create_all(bind=engine)
    
    db = SessionLocal()
    
    try:
        if db.query(Rol).count() > 0:
            print("Los datos ya existen. Saltando seed.")
            return

        print("1. Creando roles...")
        # El orden importa: admin debe quedar id=1 y usuario id=3
        # (la lógica de permisos y el rol por defecto dependen de esos ids).
        roles = [
            Rol(nombre="admin"),       # id 1
            Rol(nombre="director"),    # id 2
            Rol(nombre="usuario"),     # id 3 (rol por defecto)
            Rol(nombre="utp"),
            Rol(nombre="liderazgo"),
            Rol(nombre="orien_conv"),
            Rol(nombre="pie"),
            Rol(nombre="inspectoria"),
        ]
        for rol in roles:
            db.add(rol)
        db.commit()
        print("   Roles: admin, director, usuario, utp, liderazgo, orien_conv, pie, inspectoria")

        print("2. Creando usuarios...")
        admin = Usuario(
            username="admin",
            email="admin@liderazgo.cl",
            password_hash=get_password_hash("admin123"),
            rol_id=1
        )
        db.add(admin)

        gabriela = Usuario(
            username="gabriela",
            email="gabriela@liderazgo.cl",
            password_hash=get_password_hash("gabriela"),
            rol_id=3
        )
        db.add(gabriela)
        db.commit()
        print("   Admin: admin / admin123")
        print("   Usuario: gabriela / gabriela")

        print("3. Creando niveles educativos...")
        niveles_data = [
            ("Pre-Kinder", 1),
            ("Kinder", 2),
            ("1ro Básico", 3),
            ("2do Básico", 4),
            ("3ro Básico", 5),
            ("4to Básico", 6),
            ("5to Básico", 7),
            ("6to Básico", 8),
            ("7mo Básico", 9),
            ("8vo Básico", 10),
            ("1ro Medio", 11),
            ("2do Medio", 12),
            ("3ro Medio", 13),
            ("4to Medio", 14),
        ]
        for nombre, orden in niveles_data:
            nivel = Nivel(nombre=nombre, orden=orden)
            db.add(nivel)
        db.commit()
        print(f"   {len(niveles_data)} niveles creados")

        print("4. Creando dimensiones...")
        dimensiones_data = [
            ("Comunicación", "Indicadores relacionados con la comunicación verbal y no verbal del docente", 1),
            ("Presencia de Liderazgo", "Indicadores de presencia, seguridad y confiabilidad del docente", 2),
            ("Organización", "Indicadores de organización del trabajo y manejo del tiempo", 3),
            ("Conducción del Grupo", "Indicadores de dirección y gestión del grupo curso", 4),
            ("Coherencia y Consecuencia", "Indicadores de coherencia entre discurso y acción", 5),
        ]
        for nombre, desc, orden in dimensiones_data:
            dim = Dimension(nombre=nombre, descripcion=desc, orden=orden)
            db.add(dim)
        db.commit()
        print(f"   {len(dimensiones_data)} dimensiones creadas")

        print("5. Creando subdimensiones (15 indicadores)...")
        subdimensiones_data = [
            (1, "1. Expresión verbal", "El docente comunica indicaciones, orientaciones y expectativas de aprendizaje de manera clara hacia el grupo.", 1),
            (1, "2. Expresión corporal / comunicación no verbal", "El docente utiliza postura, desplazamiento, contacto visual y tono de voz para posicionarse frente al grupo y sostener la atención de los estudiantes.", 2),
            (1, "3. Claridad en las instrucciones", "Las indicaciones entregadas por el docente son comprendidas por los estudiantes, facilitando la participación y el desarrollo de las actividades.", 3),
            (2, "4. Presencia frente al grupo", "El docente logra posicionarse como referente frente al curso, generando orientación y conducción del proceso de aprendizaje.", 4),
            (2, "5. Seguridad y confianza", "El docente transmite seguridad, dominio y claridad en la conducción del grupo.", 5),
            (2, "6. Confiabilidad", "El docente transmite consistencia y responsabilidad en su actuar frente a los estudiantes.", 6),
            (3, "7. Organización del trabajo del grupo", "El docente organiza adecuadamente el desarrollo de la actividad en el aula, favoreciendo el logro de los objetivos de aprendizaje.", 7),
            (3, "8. Manejo del tiempo del grupo", "El docente mantiene un ritmo de trabajo adecuado durante la clase, optimizando el tiempo disponible para el aprendizaje.", 8),
            (3, "9. Claridad en la conducción de la actividad", "El docente orienta adecuadamente el desarrollo del trabajo en el aula, guiando a los estudiantes durante la actividad.", 9),
            (4, "10. Conducción del grupo curso", "El docente dirige adecuadamente la dinámica del grupo durante la clase, facilitando la participación y el trabajo colaborativo.", 10),
            (4, "11. Gestión del clima del grupo", "El docente promueve un ambiente de respeto, seguridad y disposición al aprendizaje.", 11),
            (4, "12. Manejo de situaciones dentro del aula", "El docente responde adecuadamente frente a interrupciones o situaciones del grupo, manteniendo el foco en el aprendizaje.", 12),
            (5, "13. Coherencia entre discurso y acción", "El docente actúa de manera coherente con lo que comunica al grupo.", 13),
            (5, "14. Consecuencia en la conducción del grupo", "El docente mantiene consistencia en las normas o indicaciones que entrega.", 14),
            (5, "15. Responsabilidad frente al grupo", "El docente demuestra compromiso y responsabilidad en la conducción de la clase.", 15),
        ]
        for dim_id, nombre, desc, orden in subdimensiones_data:
            sub = Subdimension(
                dimension_id=dim_id,
                nombre=nombre,
                descripcion=desc,
                orden=orden
            )
            db.add(sub)
        db.commit()
        print(f"   {len(subdimensiones_data)} subdimensiones creadas")

        print("6. Creando asignaturas base...")
        asignaturas_data = [
            "Lenguaje y Comunicación",
            "Matemática",
            "Historia, Geografía y Ciencias Sociales",
            "Ciencias Naturales",
            "Biología",
            "Química",
            "Física",
            "Educación Tecnológica",
            "Artes Visuales",
            "Música",
            "Educación Física",
            "Inglés",
            "Religión",
            "Filosofía",
            "Orientación",
        ]
        for nombre in asignaturas_data:
            asig = Asignatura(nombre=nombre, created_by=1)
            db.add(asig)
        db.commit()
        print(f"   {len(asignaturas_data)} asignaturas creadas")

        print("\n" + "="*50)
        print("SEED COMPLETADO EXITOSAMENTE")
        print("="*50)
        print("\nTablas creadas con prefijos:")
        print("  auth_roles, auth_usuarios")
        print("  cat_niveles, cat_cursos, cat_asignaturas")
        print("  cat_colegios, cat_docentes, cat_observadores")
        print("  eval_dimensiones, eval_subdimensiones")
        print("  eval_evaluaciones, eval_respuestas")
        print("  eval_apoyos, eval_fortalezas_aspectos")
        print("\nCredenciales:")
        print("  Admin:     usuario=admin,      password=admin123")
        print("  Usuario:   usuario=gabriela,  password=gabriela")

    except Exception as e:
        db.rollback()
        print(f"Error durante el seed: {e}")
        import traceback
        traceback.print_exc()
        raise
    finally:
        db.close()


if __name__ == "__main__":
    seed_data()
