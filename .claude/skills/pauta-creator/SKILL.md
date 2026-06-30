---
name: pauta-creator
description: Crea nuevas pautas/plantillas de evaluación para la plataforma de Visitas (UTP, PIE, Orientación/Convivencia, Liderazgo u otra área). Úsala cuando el usuario quiera "crear una pauta", "nueva plantilla de visita", "agregar una pauta de UTP/PIE/Convivencia/Orientación", definir dimensiones e indicadores, o configurar la escala de puntaje (con escala numérica o sin escala — observado/no observado). Guía el modelado de datos (Plantilla → Dimensión → Subdimensión), la elección de `tipo`/`formato`/`config_puntuacion`, el alcance por colegio y la generación del script de seed siguiendo los patrones existentes del backend.
---

# Pauta_Creator — Creador de Pautas de Visita

Skill para crear nuevas **pautas/plantillas** de evaluación en la plataforma de Visitas
siguiendo el modelo de datos, los formatos de UI y los patrones de seguridad ya existentes
en este repositorio. No inventes estructuras nuevas: reutiliza los formatos soportados.

## Antes de empezar — lee la referencia

Lee **`reference.md`** (en esta misma carpeta) antes de generar nada. Contiene el modelo de
datos exacto (`Plantilla` / `Dimension` / `Subdimension`), la matriz de formatos vs. escala,
el formato JSON de `config_puntuacion` y las reglas de seguridad. La plantilla de script está
en `templates/seed_pauta_template.py`.

## Paso 1 — Definir el área (define `formato`)

Pregunta al usuario para cuál área es la pauta. Esto determina el `formato` y **cómo se
renderiza** en el frontend (`frontend/js/modules/visitas.js`):

| Área | `tipo` | `formato` | Render | ¿Listo sin tocar frontend? |
|---|---|---|---|---|
| **Cualquier escala numérica nueva** | `VISITA` | `ESCALA` | escala + promedios guiados por `config_puntuacion`; textarea por indicador opcional | ✅ Sí |
| Orientación / Convivencia | `VISITA` | `ORIENTACION` | binario + estrategia por indicador + tabla de estudiantes observados | ✅ Sí |
| PIE | `VISITA` | `PIE` | escala 0–4 + comentarios por indicador + retroalimentación coordinadora/especialista | ✅ Sí |
| UTP | `VISITA` | `UTP` | módulo propio por pasos (`utp_pauta.js`) | ⚠️ Estructura por pasos, ver nota |
| Liderazgo | `LIDERAZGO` | `LIDERAZGO` | módulo de Liderazgo (no es Visita) | ✅ Sí |

**Regla clave:** la **escala** ya no depende del `formato` — la dibuja `parseEscala()` leyendo
`config_puntuacion` (ver `reference.md`). Para una pauta con **escala numérica nueva**
(cualquier cantidad de niveles y etiquetas), usa **`formato=ESCALA`** y define los niveles en
`config_puntuacion`: funciona sin tocar el frontend. Usa `ORIENTACION`/`PIE`/`UTP` solo si
necesitas sus extras específicos (tabla de estudiantes, retro coordinadora/especialista,
asistente por pasos). Solo si pides extras de UI realmente nuevos (secciones de observaciones
distintas, campos de cabecera nuevos) hay que tocar `visitas.js`/modelo — **avísalo**.

## Paso 2 — Definir la escala (define `config_puntuacion`)

Pregunta si la pauta tiene **escala de puntaje** o **sin escala**:

- **Sin escala (binaria) — Observado / No observado:** valores `1` / `0`.
  → `config_puntuacion = "observado"` (marcador de texto, no JSON). Es lo que usa
  Orientación/Convivencia y cualquier pauta binaria genérica.
- **Con escala numérica** (p. ej. niveles 0–4 como PIE): `config_puntuacion` es un **JSON
  string** con `escala`, `niveles[]` y `opcion_no_observado`. Copia la estructura exacta de
  `reference.md`. Define los niveles (valor, nombre, color) según lo que pida el usuario.

Confirma también:
- ¿Se permite "No observado / N/O"? ¿Ese valor se **excluye** del cálculo de promedio?
  (en PIE, N/O = 0 y se excluye).

## Paso 3 — Capturar dimensiones e indicadores

Toda pauta necesita **al menos una `Dimension`**. Cada indicador es una `Subdimension`:
- `Dimension`: `nombre`, `orden` (1..n), `descripcion` opcional.
- `Subdimension` (indicador): `nombre` = etiqueta corta (`"Indicador 1.2"`),
  `descripcion` = **el texto completo del indicador** (esto es lo que se muestra), `orden`.

Pide al usuario las dimensiones y, dentro de cada una, la lista de indicadores en orden.
Si solo hay una dimensión (como Orientación/Convivencia), está perfecto.

## Paso 4 — Alcance por colegio (`colegio_id`)

- Las pautas de **VISITA** pertenecen a un colegio → pide el `colegio_id` destino y
  **verifícalo contra `cat_colegios`** (no asumas que existe).
- `colegio_id = NULL` solo para pautas **globales** (típicamente las de tipo `LIDERAZGO` o
  built-ins como PIE que se ofrecen a todos). No dejes una VISITA sin colegio salvo que sea
  un built-in global intencional.

## Paso 5 — Elegir el método de creación

| Caso | Método | Por qué |
|---|---|---|
| Pauta específica de **un colegio** | Script seed independiente (ver `templates/seed_pauta_template.py`) | Reproducible, revisable, no toca el arranque |
| Pauta **global built-in** para todos los colegios | Función `auto_migrate_*` en `main.py` (patrón de `auto_migrate_pie_plantilla`) | Idempotente en el arranque, se versiona con el código |
| Carga puntual por usuario final | Endpoint `POST /eval_plantillas/import/excel` (ya existe) | Lo usa el admin/gestor desde la UI, sin código |

Por defecto genera un **script seed independiente** en `backend/` salvo que el usuario pida
un built-in global. Sigue el patrón de `backend/seed_convivencia.py` y la plantilla incluida.

## Paso 6 — Generar el artefacto

1. Copia `templates/seed_pauta_template.py` y rellena los marcadores `<<...>>`.
2. **Slug único, ≤ 20 chars** (`Plantilla.slug` es `unique`). Reutiliza la lógica de
   `_slug_unico` de `routers/plantillas.py` o genera uno y verifica que no exista.
3. **Idempotencia:** antes de insertar, comprueba si ya existe la plantilla (por `slug`) y
   no la dupliques (igual que `auto_migrate_pie_plantilla`).
4. Envuelve todo en una transacción con `try/except/rollback/finally: db.close()`.
5. Usa `db.flush()` para obtener IDs antes de crear hijos (dimensiones/indicadores).
6. Nombra etiquetas de indicador como `f"Indicador {dim_orden}.{ind_orden}"` y pon el texto
   real en `descripcion`.

## Paso 7 — Seguridad y buenas prácticas (obligatorio revisar)

- **Nunca** expongas un script seed como endpoint sin auth. La creación vía API ya está
  protegida por `require_plantilla_manager` (admin, director, utp, pie, orien_conv) o
  `require_admin`. Respeta ese modelo: si tocas un router, usa esas dependencias.
- **Aislamiento por colegio:** los directores solo gestionan plantillas de su `colegio_id`.
  No generes pautas que rompan ese filtro (`_verificar_acceso_plantilla`).
- **Validación de entrada:** `colegio_id` debe existir; `tipo`/`formato` de la lista soportada;
  `slug` único y saneado (`[a-z0-9-]`, ≤20).
- **No hardcodees credenciales ni `DATABASE_URL`** en el script: importa `SessionLocal` de
  `database` (lee la config del entorno).
- **Transaccional e idempotente:** rollback ante error; no dejes datos a medias.
- No borres ni desactives plantillas existentes "de paso". Una plantilla **en uso**
  (con evaluaciones asociadas) no se puede eliminar (ver `delete_plantilla`).

## Paso 8 — Verificar

1. Ejecuta el seed: `python backend/seed_xxx.py` (con el venv activo o dentro del contenedor).
2. Confirma en consola el ID creado y revisa que aparezca vía `GET /eval_plantillas/`.
3. Si el formato es nuevo, verifica el render en la UI de "Nueva Visita" antes de cerrar.

## Checklist final

- [ ] `tipo` y `formato` válidos y soportados (o frontend actualizado si es nuevo).
- [ ] `config_puntuacion` correcto: `"observado"` (binaria) o JSON de escala.
- [ ] Al menos 1 dimensión; indicadores con texto en `descripcion` y `orden` correlativo.
- [ ] `slug` único ≤20; `colegio_id` válido (o NULL solo si es global intencional).
- [ ] Script idempotente, transaccional, sin credenciales hardcodeadas.
- [ ] Verificado: plantilla creada y (si aplica) render correcto en la UI.
