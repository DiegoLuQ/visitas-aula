import sys
import os
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "../backend")))

import json
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from backend.models import Evaluacion, Plantilla

# Database URL
DATABASE_URL = "mysql+pymysql://mcdp_user:mcdp_password@localhost:3306/gb_lider"

engine = create_engine(DATABASE_URL)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
db = SessionLocal()

# Fetch evaluation #79
e = db.query(Evaluacion).filter(Evaluacion.id == 79).first()
if e:
    print(f"ID: {e.id}")
    print(f"Plantilla ID: {e.plantilla_id}")
    if e.plantilla:
        print(f"Plantilla Nombre: {e.plantilla.nombre}")
        print(f"Plantilla Formato: {e.plantilla.formato}")
    print(f"Comentarios: {repr(e.comentarios)}")
    print(f"Sintesis Retro: {repr(e.sintesis_retro)}")
    print(f"Acuerdos Mejora: {repr(e.acuerdos_mejora)}")
    print("Fortalezas/Aspectos:")
    for fa in e.fortalezas_aspectos:
        print(f"  - {fa.tipo}: {fa.contenido}")
else:
    print("Evaluation #79 not found")

# List all evaluations and their plantillas
print("\nAll recent evaluations:")
evals = db.query(Evaluacion).order_by(Evaluacion.id.desc()).limit(5).all()
for ev in evals:
    print(f"ID {ev.id}: Plantilla ID={ev.plantilla_id}, Formato={ev.plantilla.formato if ev.plantilla else 'None'}, Estado={ev.estado}")
