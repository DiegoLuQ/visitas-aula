import pymysql
import os
from dotenv import load_dotenv

# Cargar variables de entorno del directorio actual o padre
load_dotenv()
db_url = os.getenv("DATABASE_URL")

if not db_url:
    print("Error: DATABASE_URL no encontrada en .env")
    exit(1)

print(f"Usando DB_URL: {db_url}")

# Manejar mysql+pymysql://user:password@host:port/dbname
try:
    # Eliminar el prefijo
    connection_str = db_url.split("://")[1]
    # Separar user:pass y host:port/db
    user_pass, host_port_db = connection_str.split("@")
    user, password = user_pass.split(":")
    
    # Separar host:port y db
    if "/" in host_port_db:
        host_port, db_name = host_port_db.split("/")
    else:
        host_port = host_port_db
        db_name = ""
        
    if ":" in host_port:
        host, port = host_port.split(":")
        port = int(port)
    else:
        host = host_port
        port = 3306

    print(f"Conectando a {host}:{port} como {user}...")
    connection = pymysql.connect(
        host=host, 
        port=port, 
        user=user, 
        password=password, 
        database=db_name
    )
    
    try:
        with connection.cursor() as cursor:
            # Primero verificar si la columna ya existe
            cursor.execute("SHOW COLUMNS FROM eval_evaluaciones LIKE 'codigo_firma'")
            result = cursor.fetchone()
            if result:
                print("La columna 'codigo_firma' ya existe.")
            else:
                sql = "ALTER TABLE eval_evaluaciones ADD COLUMN codigo_firma VARCHAR(20) DEFAULT NULL;"
                cursor.execute(sql)
                connection.commit()
                print("Columna 'codigo_firma' añadida con éxito.")
    finally:
        connection.close()
except Exception as e:
    print(f"Error procesando la base de datos: {e}")
