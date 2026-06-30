# Referencia técnica — Pautas de Visita

Fuente de verdad: `backend/models.py`, `backend/routers/plantillas.py`,
`backend/main.py` (`auto_migrate_pie_plantilla`), `backend/seed_convivencia.py`,
`frontend/js/modules/visitas.js`. Verifica contra el código si algo cambió.

## 1. Modelo de datos

Tres tablas en cascada: **Plantilla → Dimensión → Subdimensión (indicador)**.
Las respuestas del docente se guardan aparte en `eval_respuestas`.

### `Plantilla` (`eval_plantillas`)
| Campo | Tipo | Notas |
|---|---|---|
| `nombre` | String(200) | Obligatorio. Nombre corto visible. |
| `nombre_largo` | String(255) | Opcional. Título completo. |
| `slug` | String(20) **unique** | ≤20 chars, saneado. Usar `_slug_unico()`. |
| `tipo` | String(50) | `'VISITA'` o `'LIDERAZGO'`. (El router compara con `UPPER()`.) |
| `formato` | String(20) | `ORIENTACION` \| `PIE` \| `UTP` \| `LIDERAZGO`. Decide el render. |
| `colegio_id` | FK `cat_colegios` nullable | VISITA → un colegio. `NULL` = global. |
| `config_puntuacion` | Text (JSON o marcador) | Ver §3. |
| `activa` | Boolean | Default `True`. Borrado lógico = `activa=False`. |

### `Dimension` (`eval_dimensiones`)
`plantilla_id` (FK), `nombre` (String 100), `descripcion` (Text, opcional), `orden` (Int, 1..n).

### `Subdimension` (`eval_subdimensiones`) — el "indicador"
`dimension_id` (FK), `nombre` (String 200, etiqueta corta tipo `"Indicador 1.2"`),
`descripcion` (Text = **el enunciado completo del indicador**, es lo que se muestra),
`orden` (Int).

### `EvaluacionRespuesta` (`eval_respuestas`) — solo contexto
Cada respuesta: `subdimension_id`, `valor` (Int), `estrategia` (Text, opcional — lo usa
ORIENTACION/PIE para el texto por indicador). No la crea la pauta; la crea la evaluación.

## 2. Matriz Formato × Escala (lo que ya soporta el frontend)

| `formato` | Escala (valores) | `config_puntuacion` | Extras de UI |
|---|---|---|---|
| `ESCALA` | **Cualquier escala numérica** definida en config | JSON con `niveles[]` (ver §3) | **Genérica:** render de escala + promedios en vivo guiados por config; textarea por indicador opcional (`texto_por_indicador`); observaciones/retro al final |
| `ORIENTACION` | Binaria: Observado=`1`, No observado=`0` | `"observado"` (marcador) | Textarea "Estrategia a mejorar" por indicador; tabla "estudiantes observados" |
| `PIE` | 0–4: N/O, Deficiente, Básico, Competente, Excelente | JSON (ver §3) | Comentarios por indicador; bloque retroalimentación coordinadora/especialista; promedios en vivo (excluye N/O) |
| `UTP` | Definida por su módulo | (según módulo) | Asistente por pasos (`utp_pauta.js`); estructura distinta |
| `LIDERAZGO` | Escala de liderazgo | JSON de liderazgo | Módulo de Liderazgo (no es Visita) |
| genérico binario | Observado/No observado | `"observado"` | Solo observaciones/retroalimentación al final |

**El render de la escala se guía por `config_puntuacion`, no por el `formato`.** El helper
`parseEscala()` (en `visitas.js`) interpreta `config_puntuacion`:
- JSON con `niveles[]` → escala numérica (cualquier cantidad de niveles y etiquetas).
- `"observado"` / vacío → escala binaria Observado/No observado.
- `formato=PIE` sin config → fallback a la escala PIE clásica.

Por eso **una pauta con escala nueva NO requiere tocar el frontend**: úsala con
`formato=ESCALA` y define los niveles en `config_puntuacion`. Reserva `ORIENTACION`/`PIE`/`UTP`
solo cuando necesites sus extras específicos (tabla de estudiantes, retro coordinadora/
especialista, asistente por pasos). Si registras un `formato` nuevo distinto de los de la
tabla, agrégalo a `VISITA_FORMATOS` en `visitas.js` y `subir_visita.js` para que cuente como
visita en el dashboard y la carga de PDF.

Colores permitidos para los niveles (clases Tailwind ya presentes): `slate`, `rose`, `amber`,
`emerald`, `indigo`. Cualquier otro color cae al estilo índigo por defecto.

## 3. `config_puntuacion`

Es un `Text`. Dos formas válidas:

**A) Binaria (marcador de texto):**
```python
config_puntuacion = "observado"
```

**B) Escala numérica (JSON string)** — patrón PIE (de `main.py`):
```python
import json
config = {
    "escala": "4_niveles",
    "niveles": [
        {"valor": 0, "nombre": "N/O",        "color": "slate"},
        {"valor": 1, "nombre": "Deficiente", "color": "rose"},
        {"valor": 2, "nombre": "Básico",     "color": "amber"},
        {"valor": 3, "nombre": "Competente", "color": "emerald"},
        {"valor": 4, "nombre": "Excelente",  "color": "indigo"},
    ],
    "opcion_no_observado": {
        "permitido": True,
        "valor_guardado": 0,
        "excluir_del_calculo": True,
    },
    # Opcional: textarea por indicador (Evidencia / Comentarios / etc.).
    "texto_por_indicador": {
        "mostrar": True,
        "etiqueta": "Evidencia",
        "placeholder": "Registre la evidencia observada...",
    },
}
config_puntuacion = json.dumps(config)
```
Notas sobre la escala:
- Los `niveles` se **renderizan en el orden del array** (asc o desc, como quieras mostrarlos).
- El cálculo de promedio **excluye** el nivel marcado en `opcion_no_observado`
  (`excluir_del_calculo: True`). El valor se guarda igual en `eval_respuestas.valor`.
- `texto_por_indicador` (opcional): muestra un `<textarea>` por indicador cuyo texto se guarda
  en `eval_respuestas.estrategia`. `etiqueta` y `placeholder` son configurables.
- Colores válidos (clases Tailwind ya usadas): `slate`, `rose`, `amber`, `emerald`, `indigo`.

## 4. Métodos de creación (ya existentes)

1. **Script seed independiente** — patrón `backend/seed_convivencia.py`. Recomendado para
   pautas de un colegio. Se ejecuta una vez con `python backend/seed_xxx.py`.
2. **Auto-migración en arranque** — patrón `auto_migrate_pie_plantilla()` en `main.py`,
   registrado al final junto a las demás `auto_migrate_*`. Idempotente (chequea por `slug`).
   Úsalo solo para built-ins globales.
3. **API REST** (`routers/plantillas.py`, prefijo `/eval_plantillas`):
   - `POST /` → crea solo la cabecera (sin dimensiones). Requiere `require_admin`.
   - `POST /import/excel` → crea plantilla + dimensiones + indicadores desde un Excel con
     columnas `Dimensión`, `Indicador`, `Descripción`. Requiere `require_plantilla_manager`.
   - `POST /{id}/duplicar` → clona una existente a otro colegio. `require_plantilla_manager`.
   - `GET /{id}/export/excel` → exporta la estructura (útil como plantilla base).

## 5. Seguridad (resumen)

- Roles: **1=Admin**, **2=Auditor**, **3=Usuario**; además roles por nombre `director`,
  `utp`, `pie`, `orien_conv`.
- `require_admin` → solo rol 1. `require_plantilla_manager` → admin/director/utp/pie/orien_conv.
- **Aislamiento por colegio:** el director solo ve/gestiona plantillas de su(s) `colegio_id`
  (`_verificar_acceso_plantilla`, filtros en `list_plantillas`).
- No se puede **eliminar** una plantilla con evaluaciones asociadas (HTTP 409). Para retirarla,
  `activa=False`.
- Scripts seed: acceso directo a BD → solo servidor, nunca expuestos; importan `SessionLocal`
  de `database` (config por entorno); transaccionales e idempotentes.
