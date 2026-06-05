from sqlalchemy import text
from sqlalchemy.orm import Session
import io
from datetime import datetime
from models import Base

def generate_sql_dump(db: Session):
    output = io.StringIO()
    output.write(f"-- Backup generado el {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}\n")
    output.write("SET FOREIGN_KEY_CHECKS = 0;\n\n")

    # Obtener todas las tablas en el orden correcto
    tables = Base.metadata.sorted_tables
    
    for table in tables:
        table_name = table.name
        output.write(f"-- Estructura y datos para la tabla `{table_name}`\n")
        
        # Obtener estructura de la tabla
        try:
            create_result = db.execute(text(f"SHOW CREATE TABLE `{table_name}`"))
            create_sql = create_result.fetchone()[1]
            output.write(f"DROP TABLE IF EXISTS `{table_name}`;\n")
            output.write(f"{create_sql};\n\n")
        except Exception as e:
            output.write(f"-- No se pudo obtener la estructura de {table_name}: {str(e)}\n\n")
        
        # Obtener datos de la tabla
        result = db.execute(text(f"SELECT * FROM `{table_name}`"))
        columns = result.keys()
        rows = result.fetchall()
        
        if rows:
            for row in rows:
                col_names = ", ".join([f"`{c}`" for c in columns])
                values = []
                for val in row:
                    if val is None:
                        values.append("NULL")
                    elif isinstance(val, (int, float)):
                        values.append(str(val))
                    else:
                        # Escapar comillas simples para SQL
                        escaped = str(val).replace("'", "''")
                        values.append(f"'{escaped}'")
                
                val_str = ", ".join(values)
                output.write(f"INSERT INTO `{table_name}` ({col_names}) VALUES ({val_str});\n")
        
        output.write("\n")

    output.write("SET FOREIGN_KEY_CHECKS = 1;\n")
    return output.getvalue()
