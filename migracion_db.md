# Guía de Migración de Base de Datos - Sistema Liderazgo V2

Este documento contiene las consultas SQL necesarias para actualizar la base de datos de producción y asegurar la compatibilidad con las nuevas funcionalidades de firmas digitales, borradores y dashboard.

> [!IMPORTANT]
> Se recomienda realizar un respaldo de la base de datos antes de ejecutar estas consultas.

## Script de Migración (SQL)

Ejecuta el siguiente script en tu motor de base de datos (SQLite/PostgreSQL):

```sql
-- =============================================
-- 1. ACTUALIZACIÓN DE LA TABLA EVALUACIONES
-- =============================================
-- Soporte para estados de evaluación (Borrador/Cerrada)
ALTER TABLE evaluaciones ADD COLUMN IF NOT EXISTS estado VARCHAR(20) DEFAULT 'CERRADA';

-- Soporte para verificación de identidad (Firma Digital)
ALTER TABLE evaluaciones ADD COLUMN IF NOT EXISTS codigo_verificacion VARCHAR(6);

-- Registro de firmas electrónicas
ALTER TABLE evaluaciones ADD COLUMN IF NOT EXISTS firma_docente TEXT;
ALTER TABLE evaluaciones ADD COLUMN IF NOT EXISTS fecha_firma_docente DATETIME;
ALTER TABLE evaluaciones ADD COLUMN IF NOT EXISTS firma_observador TEXT;
ALTER TABLE evaluaciones ADD COLUMN IF NOT EXISTS fecha_firma_observador DATETIME;

-- =============================================
-- 2. ACTUALIZACIÓN DE SEGURIDAD PARA USUARIOS
-- =============================================
-- Soporte para Doble Factor de Autenticación (TOTP)
ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS totp_secret VARCHAR(32);
ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS totp_enabled BOOLEAN DEFAULT FALSE;

-- =============================================
-- 3. NUEVA TABLA: VISITAS DE AULA
-- =============================================
-- Para el registro de acompañamiento previo
CREATE TABLE IF NOT EXISTS visitas_aula (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    docente_id INTEGER,
    observador_id INTEGER,
    colegio_id INTEGER,
    asignatura_id INTEGER,
    curso_id INTEGER,
    fecha DATETIME DEFAULT CURRENT_TIMESTAMP,
    objetivo TEXT,
    observaciones TEXT,
    acuerdos TEXT,
    proxima_visita DATETIME,
    estado VARCHAR(20) DEFAULT 'REALIZADA',
    FOREIGN KEY (docente_id) REFERENCES usuarios(id),
    FOREIGN KEY (observador_id) REFERENCES usuarios(id)
);
```

## Resumen de Impacto

1.  **Firmas Digitales**: Se habilita el almacenamiento de las firmas en formato Base64 y los timestamps de validación.
2.  **Dashboard**: Los nuevos campos de `estado` permiten que el dashboard filtre correctamente los borradores pendientes de las evaluaciones terminadas.
3.  **Seguridad**: Se preparan los campos necesarios para implementar el código de 6 dígitos que solicitaste para las firmas.

---
*Generado por Antigravity - Asistente de Desarrollo*
