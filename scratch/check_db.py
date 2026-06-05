
import sqlite3

def check_plantillas():
    try:
        conn = sqlite3.connect('backend/database.db')
        cursor = conn.cursor()
        cursor.execute("SELECT id, nombre, activa FROM eval_plantillas")
        rows = cursor.fetchall()
        print("--- PLANTILLAS ---")
        for row in rows:
            print(f"ID: {row[0]}, Nombre: {row[1]}, Activa: {row[2]}")
        
        cursor.execute("SELECT id, plantilla_id, nombre FROM dimensiones")
        rows = cursor.fetchall()
        print("\n--- DIMENSIONES ---")
        for row in rows:
            print(f"ID: {row[0]}, Plantilla: {row[1]}, Nombre: {row[2]}")
            
        conn.close()
    except Exception as e:
        print(f"Error: {e}")

if __name__ == "__main__":
    check_plantillas()
