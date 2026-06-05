import pymysql
from dotenv import load_dotenv

load_dotenv('backend/.env')

def inspect_roles_users():
    try:
        conn = pymysql.connect(
            host='localhost',
            user='mcdp_user',
            password='mcdp_password',
            database='gb_lider',
            port=3306
        )
        cursor = conn.cursor()
        
        print("--- ROLES ---")
        cursor.execute("SELECT id, nombre FROM auth_roles")
        for row in cursor.fetchall():
            print(f"Role ID: {row[0]}, Name: {row[1]}")
            
        print("\n--- USUARIOS ---")
        cursor.execute("SELECT id, username, email, rol_id, colegio_id, activo, acceso FROM auth_usuarios")
        for row in cursor.fetchall():
            print(f"User ID: {row[0]}, Username: {row[1]}, Email: {row[2]}, RolID: {row[3]}, ColegioID: {row[4]}, Activo: {row[5]}, Acceso: {row[6]}")
            
        print("\n--- COLEGIOS ---")
        cursor.execute("SELECT id, nombre FROM cat_colegios")
        for row in cursor.fetchall():
            print(f"Colegio ID: {row[0]}, Name: {row[1]}")
            
        conn.close()
    except Exception as e:
        print(f"Error: {e}")

if __name__ == "__main__":
    inspect_roles_users()
