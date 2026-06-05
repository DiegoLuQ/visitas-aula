import pymysql
import os
from dotenv import load_dotenv

load_dotenv()
db_url = os.getenv("DATABASE_URL")

connection_str = db_url.split("://")[1]
user_pass, host_port_db = connection_str.split("@")
user, password = user_pass.split(":")
host_port, db_name = host_port_db.split("/")
if ":" in host_port:
    host, port = host_port.split(":")
    port = int(port)
else:
    host = host_port
    port = 3306

connection = pymysql.connect(host=host, port=port, user=user, password=password, database=db_name)
try:
    with connection.cursor() as cursor:
        # Create cfg_email_recipients table
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS cfg_email_recipients (
                id INT AUTO_INCREMENT PRIMARY KEY,
                email VARCHAR(255) NOT NULL,
                nombre VARCHAR(255) NOT NULL,
                activo BOOLEAN DEFAULT TRUE,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        """)
        
        # Add some default recipients if empty (optional, but requested "others")
        # cursor.execute("INSERT INTO cfg_email_recipients (email, nombre) VALUES ('admin@escuela.cl', 'Administrador')")
        
        connection.commit()
        print("Tabla cfg_email_recipients creada con éxito.")
finally:
    connection.close()
