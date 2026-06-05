from sqlalchemy import create_engine, text
import os
from dotenv import load_dotenv

load_dotenv()

# Prioritize DATABASE_URL from .env
DATABASE_URL = os.getenv("DATABASE_URL")
if not DATABASE_URL:
    # Try the one from the root .env or a default
    DATABASE_URL = "mysql+pymysql://mcdp_user:mcdp_password@localhost:3306/gb_lider"

engine = create_engine(DATABASE_URL)

with engine.connect() as conn:
    try:
        print("Adding colegio_id column to cfg_email_recipients...")
        conn.execute(text("ALTER TABLE cfg_email_recipients ADD COLUMN colegio_id INT NULL"))
        conn.execute(text("ALTER TABLE cfg_email_recipients ADD CONSTRAINT fk_recipient_colegio FOREIGN KEY (colegio_id) REFERENCES cat_colegios(id)"))
        conn.commit()
        print("Column added successfully.")
    except Exception as e:
        print(f"Error or column already exists: {e}")
