import sys
import os
from sqlalchemy import text
from database import engine, SessionLocal
from models import Base, Rol, Plantilla, Dimension, Evaluacion

def run_migration():
    print("Iniciando migración para Módulo Visitas a Aula...")
    
    # 1. Crear tabla eval_plantillas si no existe
    # Usamos create_all para asegurarnos que las nuevas tablas se creen según el modelo actualizado
    Base.metadata.create_all(bind=engine)
    print("Tablas verificadas/creadas.")

    queries = [
        # 2. Agregar columnas a tablas existentes (si no existen)
        "ALTER TABLE auth_usuarios ADD COLUMN acceso VARCHAR(20) DEFAULT 'liderazgo'",
        "ALTER TABLE eval_dimensiones ADD COLUMN plantilla_id INTEGER REFERENCES eval_plantillas(id)",
        "ALTER TABLE eval_evaluaciones ADD COLUMN plantilla_id INTEGER REFERENCES eval_plantillas(id)"
    ]

    with engine.connect() as conn:
        for q in queries:
            try:
                print(f"Ejecutando: {q}")
                conn.execute(text(q))
                conn.commit()
                print("OK.")
            except Exception as e:
                print(f"Información (posiblemente ya existe): {e}")

    # 3. Datos iniciales y asociaciones
    db = SessionLocal()
    try:
        # A. Crear Plantilla base de Liderazgo
        liderazgo_plantilla = db.query(Plantilla).filter_by(tipo='LIDERAZGO').first()
        if not liderazgo_plantilla:
            print("Creando plantilla base de Liderazgo...")
            liderazgo_plantilla = Plantilla(
                nombre="Acompañamiento y Liderazgo - Estándar",
                tipo="LIDERAZGO",
                activa=True
            )
            db.add(liderazgo_plantilla)
            db.commit()
            db.refresh(liderazgo_plantilla)
        
        # B. Asociar dimensiones existentes a la plantilla de Liderazgo
        print("Asociando dimensiones existentes a la plantilla de Liderazgo...")
        db.query(Dimension).filter(Dimension.plantilla_id == None).update({Dimension.plantilla_id: liderazgo_plantilla.id})
        
        # C. Asociar evaluaciones existentes a la plantilla de Liderazgo
        print("Asociando evaluaciones existentes a la plantilla de Liderazgo...")
        db.query(Evaluacion).filter(Evaluacion.plantilla_id == None).update({Evaluacion.plantilla_id: liderazgo_plantilla.id})
        
        # D. Crear nuevos roles directivos
        nuevos_roles = ["Director", "UTP", "Encargado de Convivencia", "Orientador"]
        for nombre_rol in nuevos_roles:
            existe = db.query(Rol).filter_by(nombre=nombre_rol.lower()).first()
            if not existe:
                print(f"Creando rol: {nombre_rol}")
                rol = Rol(nombre=nombre_rol.lower())
                db.add(rol)
        
        db.commit()
        print("Migración de datos completada exitosamente.")

    except Exception as e:
        db.rollback()
        print(f"Error durante la migración de datos: {e}")
    finally:
        db.close()

if __name__ == "__main__":
    run_migration()
