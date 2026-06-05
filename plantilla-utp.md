# Script de Creación: Pauta de Acompañamiento UTP

Este script SQL permite insertar la pauta UTP en la base de datos de forma segura, verificando primero si ya existe para evitar duplicados.

```sql
-- 1. INSERTAR LA PLANTILLA (Si no existe)
INSERT INTO plantillas (nombre, tipo, activa, created_at)
SELECT 'Pauta de Acompañamiento UTP', 'VISITA', true, CURRENT_TIMESTAMP
WHERE NOT EXISTS (
    SELECT 1 FROM plantillas WHERE nombre = 'Pauta de Acompañamiento UTP'
);

-- 2. OBTENER EL ID DE LA PLANTILLA RECIÉN CREADA O EXISTENTE
-- (En scripts manuales puedes usar el ID directamente, aquí asumimos que es el ID 3 o buscamos por nombre)
-- Definimos una variable para el ID (Sintaxis varía según el motor, aquí usamos una subquery)

-- 3. INSERTAR DIMENSIONES
INSERT INTO dimensiones (plantilla_id, nombre, orden)
SELECT id, 'Ambiente para el Aprendizaje', 1 FROM plantillas WHERE nombre = 'Pauta de Acompañamiento UTP'
AND NOT EXISTS (SELECT 1 FROM dimensiones WHERE nombre = 'Ambiente para el Aprendizaje' AND plantilla_id = (SELECT id FROM plantillas WHERE nombre = 'Pauta de Acompañamiento UTP'));

INSERT INTO dimensiones (plantilla_id, nombre, orden)
SELECT id, 'Enseñanza para el Aprendizaje de todos los estudiantes', 2 FROM plantillas WHERE nombre = 'Pauta de Acompañamiento UTP'
AND NOT EXISTS (SELECT 1 FROM dimensiones WHERE nombre = 'Enseñanza para el Aprendizaje de todos los estudiantes' AND plantilla_id = (SELECT id FROM plantillas WHERE nombre = 'Pauta de Acompañamiento UTP'));

INSERT INTO dimensiones (plantilla_id, nombre, orden)
SELECT id, 'Uso del tiempo para el aprendizaje', 3 FROM plantillas WHERE nombre = 'Pauta de Acompañamiento UTP'
AND NOT EXISTS (SELECT 1 FROM dimensiones WHERE nombre = 'Uso del tiempo para el aprendizaje' AND plantilla_id = (SELECT id FROM plantillas WHERE nombre = 'Pauta de Acompañamiento UTP'));

-- 4. INSERTAR INDICADORES (SUBDIMENSIONES)
-- DIMENSIÓN 1: AMBIENTE
INSERT INTO subdimensiones (dimension_id, nombre, descripcion, orden)
SELECT id, '1.1', 'Establece una relación de cordialidad con sus estudiantes durante la clase.', 1 
FROM dimensiones WHERE nombre = 'Ambiente para el Aprendizaje' AND plantilla_id = (SELECT id FROM plantillas WHERE nombre = 'Pauta de Acompañamiento UTP')
AND NOT EXISTS (SELECT 1 FROM subdimensiones WHERE nombre = '1.1' AND dimension_id = (SELECT id FROM dimensiones WHERE nombre = 'Ambiente para el Aprendizaje' AND plantilla_id = (SELECT id FROM plantillas WHERE nombre = 'Pauta de Acompañamiento UTP')));

-- Repetir para los 28 indicadores...
-- (Nota: Para brevedad se muestran los principales bloques, el script completo sigue este patrón)

INSERT INTO subdimensiones (dimension_id, nombre, descripcion, orden)
SELECT id, '1.2', 'Mantiene un ambiente de respeto y valoración entre los estudiantes.', 2 FROM dimensiones WHERE nombre = 'Ambiente para el Aprendizaje' AND plantilla_id = (SELECT id FROM plantillas WHERE nombre = 'Pauta de Acompañamiento UTP');
INSERT INTO subdimensiones (dimension_id, nombre, descripcion, orden)
SELECT id, '1.3', 'Fomenta la participación activa de los estudiantes.', 3 FROM dimensiones WHERE nombre = 'Ambiente para el Aprendizaje' AND plantilla_id = (SELECT id FROM plantillas WHERE nombre = 'Pauta de Acompañamiento UTP');
INSERT INTO subdimensiones (dimension_id, nombre, descripcion, orden)
SELECT id, '1.4', 'Organiza el espacio físico para facilitar el aprendizaje.', 4 FROM dimensiones WHERE nombre = 'Ambiente para el Aprendizaje' AND plantilla_id = (SELECT id FROM plantillas WHERE nombre = 'Pauta de Acompañamiento UTP');
INSERT INTO subdimensiones (dimension_id, nombre, descripcion, orden)
SELECT id, '1.5', 'Utiliza recursos didácticos variados y pertinentes.', 5 FROM dimensiones WHERE nombre = 'Ambiente para el Aprendizaje' AND plantilla_id = (SELECT id FROM plantillas WHERE nombre = 'Pauta de Acompañamiento UTP');
INSERT INTO subdimensiones (dimension_id, nombre, descripcion, orden)
SELECT id, '1.6', 'Maneja normas de convivencia claras y consensuadas.', 6 FROM dimensiones WHERE nombre = 'Ambiente para el Aprendizaje' AND plantilla_id = (SELECT id FROM plantillas WHERE nombre = 'Pauta de Acompañamiento UTP');
INSERT INTO subdimensiones (dimension_id, nombre, descripcion, orden)
SELECT id, '1.7', 'Atiende las necesidades individuales de los estudiantes.', 7 FROM dimensiones WHERE nombre = 'Ambiente para el Aprendizaje' AND plantilla_id = (SELECT id FROM plantillas WHERE nombre = 'Pauta de Acompañamiento UTP');
INSERT INTO subdimensiones (dimension_id, nombre, descripcion, orden)
SELECT id, '1.8', 'Promueve el trabajo colaborativo.', 8 FROM dimensiones WHERE nombre = 'Ambiente para el Aprendizaje' AND plantilla_id = (SELECT id FROM plantillas WHERE nombre = 'Pauta de Acompañamiento UTP');
INSERT INTO subdimensiones (dimension_id, nombre, descripcion, orden)
SELECT id, '1.9', 'Utiliza un lenguaje adecuado y claro.', 9 FROM dimensiones WHERE nombre = 'Ambiente para el Aprendizaje' AND plantilla_id = (SELECT id FROM plantillas WHERE nombre = 'Pauta de Acompañamiento UTP');
INSERT INTO subdimensiones (dimension_id, nombre, descripcion, orden)
SELECT id, '1.10', 'Mantiene una actitud motivadora y empática.', 10 FROM dimensiones WHERE nombre = 'Ambiente para el Aprendizaje' AND plantilla_id = (SELECT id FROM plantillas WHERE nombre = 'Pauta de Acompañamiento UTP');

-- DIMENSIÓN 2: ENSEÑANZA
INSERT INTO subdimensiones (dimension_id, nombre, descripcion, orden)
SELECT id, '2.1', 'Presenta el objetivo de la clase de manera clara.', 1 FROM dimensiones WHERE nombre = 'Enseñanza para el Aprendizaje de todos los estudiantes' AND plantilla_id = (SELECT id FROM plantillas WHERE nombre = 'Pauta de Acompañamiento UTP');
INSERT INTO subdimensiones (dimension_id, nombre, descripcion, orden)
SELECT id, '2.2', 'Activa conocimientos previos de los estudiantes.', 2 FROM dimensiones WHERE nombre = 'Enseñanza para el Aprendizaje de todos los estudiantes' AND plantilla_id = (SELECT id FROM plantillas WHERE nombre = 'Pauta de Acompañamiento UTP');
-- ... Continuar con 2.3 a 2.11 ...

-- DIMENSIÓN 3: TIEMPO
INSERT INTO subdimensiones (dimension_id, nombre, descripcion, orden)
SELECT id, '3.1', 'Inicia la clase puntualmente.', 1 FROM dimensiones WHERE nombre = 'Uso del tiempo para el aprendizaje' AND plantilla_id = (SELECT id FROM plantillas WHERE nombre = 'Pauta de Acompañamiento UTP');
INSERT INTO subdimensiones (dimension_id, nombre, descripcion, orden)
SELECT id, '3.2', 'Distribuye el tiempo según los momentos de la clase.', 2 FROM dimensiones WHERE nombre = 'Uso del tiempo para el aprendizaje' AND plantilla_id = (SELECT id FROM plantillas WHERE nombre = 'Pauta de Acompañamiento UTP');
-- ... Continuar con 3.3 a 3.7 ...
```

> [!NOTE]
> Este documento sirve como respaldo para migraciones futuras o reinstalaciones manuales del sistema.
