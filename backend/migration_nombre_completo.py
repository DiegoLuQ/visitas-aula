"""Migración: agrega la columna nombre_completo a auth_usuarios.

Úsalo si la columna no apareció automáticamente al arrancar el backend.
Ejecutar desde el directorio backend/ con el venv activado:

    python migration_nombre_completo.py
"""
import sys
import os
from sqlalchemy import text, inspect
from database import engine


def run_migration():
    print("Iniciando migración: nombre_completo en auth_usuarios...")

    inspector = inspect(engine)
    columns = [col["name"] for col in inspector.get_columns("auth_usuarios")]

    if "nombre_completo" in columns:
        print("La columna 'nombre_completo' ya existe. Nada que hacer.")
        return

    with engine.connect() as conn:
        try:
            print("Agregando columna nombre_completo VARCHAR(150) NULL...")
            conn.execute(text("ALTER TABLE auth_usuarios ADD COLUMN nombre_completo VARCHAR(150) NULL"))
            conn.commit()
            print("OK. Columna agregada correctamente.")
        except Exception as e:
            conn.rollback()
            print(f"Error al agregar la columna (puede que ya exista): {e}")


if __name__ == "__main__":
    run_migration()
