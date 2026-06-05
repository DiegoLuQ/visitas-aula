# # Use Python 3.11 slim image
# FROM python:3.11-slim

# # Set working directory
# WORKDIR /app

# # Install system dependencies for MySQL/MariaDB and networking
# RUN apt-get update && apt-get install -y \
#     default-libmysqlclient-dev \
#     build-essential \
#     pkg-config \
#     curl \
#     && rm -rf /var/lib/apt/lists/*

# # Copy requirements and install
# COPY requirements.txt .
# RUN pip install --no-cache-dir -r requirements.txt

# # Copy application code
# COPY . .

# # Expose port (default FastAPI)
# EXPOSE 8000

# # Run with uvicorn
# CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]

# ETAPA 1: Construcción
FROM python:3.11-slim AS builder

WORKDIR /app

# Instalar dependencias del sistema necesarias para compilar
RUN apt-get update && apt-get install -y \
    build-essential \
    default-libmysqlclient-dev \
    pkg-config \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
# Instalar dependencias en una carpeta local
RUN pip install --user --no-cache-dir -r requirements.txt

# ETAPA 2: Imagen Final (más pequeña)
FROM python:3.11-slim

WORKDIR /app

# Instalar solo la librería de cliente de mysql necesaria para runtime
RUN apt-get update && apt-get install -y \
    libmariadb3 \
    && rm -rf /var/lib/apt/lists/*

# Copiar las librerías instaladas desde la etapa builder
COPY --from=builder /root/.local /root/.local
COPY . .

# Asegurar que los binarios estén en el PATH
ENV PATH=/root/.local/bin:$PATH

EXPOSE 8000
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]