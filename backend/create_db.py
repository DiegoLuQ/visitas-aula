import pymysql
import os
from dotenv import load_dotenv
from urllib.parse import urlparse
import sys

# Cargar variables de entorno del backend
load_dotenv()

def create_database():
    database_url = os.getenv("DATABASE_URL")
    if not database_url:
        print("❌ Error: DATABASE_URL no encontrada en el archivo .env del backend.")
        sys.exit(1)

    try:
        # Extraer componentes de la URL (mysql+pymysql://user:pass@host:port/dbname)
        # Reemplazamos el protocolo para que urlparse lo reconozca
        clean_url = database_url.replace("mysql+pymysql://", "http://")
        parsed = urlparse(clean_url)
        
        db_name = parsed.path.lstrip('/')
        db_user = parsed.username
        db_pass = parsed.password
        db_host = parsed.hostname
        db_port = parsed.port or 3306

        if not db_name:
            print("❌ Error: No se pudo extraer el nombre de la base de datos de la URL.")
            sys.exit(1)

        print(f"🔍 Conectando a MariaDB/MySQL en {db_host}:{db_port}...")
        
        # Conectar sin base de datos para crearla
        conn = pymysql.connect(
            host=db_host,
            port=db_port,
            user=db_user,
            password=db_pass,
            charset='utf8mb4'
        )
        
        cursor = conn.cursor()
        print(f"🛠️  Creando base de datos `{db_name}` si no existe...")
        cursor.execute(f"CREATE DATABASE IF NOT EXISTS `{db_name}` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;")
        
        print(f"✅ Base de datos `{db_name}` lista para usar.")
        conn.close()
        
    except Exception as e:
        print(f"❌ Error al intentar crear la base de datos: {e}")
        sys.exit(1)

if __name__ == "__main__":
    create_database()
