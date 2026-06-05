-- ============================================================
-- Migración de ESTRUCTURA (no datos): local (models.py) -> servidor
-- Base de datos: gb_lider  |  Motor: MariaDB 12.x
-- Generado a partir del diff contra backend/models.py (2026-05-29)
--
-- Seguro de ejecutar: usa IF NOT EXISTS, no toca datos existentes.
-- Recomendación: hacer respaldo completo antes (Exportar en phpMyAdmin).
-- Pegar en phpMyAdmin -> pestaña SQL.
-- ============================================================

USE `gb_lider`;

-- 1) auth_usuarios: colegio(s) asignado(s) al usuario (texto, admite "1" o "1,2")
ALTER TABLE `auth_usuarios`
  ADD COLUMN IF NOT EXISTS `colegio_id` VARCHAR(50) NULL;

-- 2) eval_plantillas: nombre largo + slug (identificador corto único)
ALTER TABLE `eval_plantillas`
  ADD COLUMN IF NOT EXISTS `nombre_largo` VARCHAR(255) NULL,
  ADD COLUMN IF NOT EXISTS `slug` VARCHAR(20) NULL;

ALTER TABLE `eval_plantillas`
  ADD UNIQUE INDEX IF NOT EXISTS `ix_eval_plantillas_slug` (`slug`);

-- 3) eval_respuestas: estrategia asociada a la respuesta
ALTER TABLE `eval_respuestas`
  ADD COLUMN IF NOT EXISTS `estrategia` TEXT NULL;

-- 4) eval_plantillas: colegio dueño de la plantilla (NULL = global / LIDERAZGO)
ALTER TABLE `eval_plantillas`
  ADD COLUMN IF NOT EXISTS `colegio_id` INT NULL;

-- 5) eval_plantillas: formato/diseño del formulario ('LIDERAZGO' | 'ORIENTACION' | 'UTP')
ALTER TABLE `eval_plantillas`
  ADD COLUMN IF NOT EXISTS `formato` VARCHAR(20) NULL;

UPDATE `eval_plantillas` SET `formato`='LIDERAZGO'  WHERE id=1 AND `formato` IS NULL;
UPDATE `eval_plantillas` SET `formato`='ORIENTACION' WHERE id=2 AND `formato` IS NULL;
UPDATE `eval_plantillas` SET `formato`='UTP'         WHERE id=3 AND `formato` IS NULL;


-- ============================================================
-- OPCIONAL (datos): poblar valores para las plantillas que ya existen,
-- para que los reportes no muestren "N/A". Solo si ya tienes plantillas.
-- ============================================================

-- nombre_largo = nombre cuando esté vacío (igual que migrate_db_v3.py)
UPDATE `eval_plantillas`
   SET `nombre_largo` = `nombre`
 WHERE `nombre_largo` IS NULL OR `nombre_largo` = '';

-- slug único derivado del id cuando esté vacío (ajusta a tus valores reales si el frontend espera slugs concretos)
UPDATE `eval_plantillas`
   SET `slug` = CONCAT('plantilla-', `id`)
 WHERE `slug` IS NULL OR `slug` = '';
