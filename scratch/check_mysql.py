
import pymysql
import os
from dotenv import load_dotenv

load_dotenv('backend/.env')

def check_db():
    try:
        # Extraer datos de DATABASE_URL
        # mysql+pymysql://mcdp_user:mcdp_password@localhost:3306/gb_lider
        conn = pymysql.connect(
            host='localhost',
            user='mcdp_user',
            password='mcdp_password',
            database='gb_lider',
            port=3306
        )
        cursor = conn.cursor()
        
        print("--- TABLAS ---")
        cursor.execute("SHOW TABLES")
        for (table_name,) in cursor:
            print(table_name)
            
        print("\n--- PLANTILLAS ---")
        cursor.execute("SELECT id, nombre, activa FROM eval_plantillas")
        for row in cursor:
            print(f"ID: {row[0]}, Nombre: {row[1]}, Activa: {row[2]}")
            
        conn.close()
    except Exception as e:
        print(f"Error: {e}")

if __name__ == "__main__":
    check_db()
