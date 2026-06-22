A continuación, se presenta la propuesta de estructura JSON para integrar la pauta de acompañamiento PIE en su sistema, seguida de una guía técnica que detalla la lógica de puntaje, el manejo del estado "No Observado" y la configuración para el rol específico.

---

### 1. Estructura de Datos en formato JSON

Esta estructura sigue el modelo jerárquico descrito (Plantilla $\rightarrow$ Dimensiones $\rightarrow$ Indicadores) e incorpora la escala de notas y puntajes especificada en el documento.

```json
{
  "plantilla": {
    "nombre": "Informe de Acompañamiento al Aula Común PIE",
    "tipo": "VISITA",
    "roles_permitidos": ["pie", "admin"],
    "colegio_id": null,
    "config_puntuacion": {
      "tipo_calculo": "promedio_simple",
      "escala": [
        {
          "puntaje": 4,
          "rango_nota": "7.0 - 6.0",
          "etiqueta": "Excelente",
          "descripcion": "Desempeño excelente, destacado de frecuentes logros."
        },
        {
          "puntaje": 3,
          "rango_nota": "5.9 - 5.0",
          "etiqueta": "Competente",
          "descripcion": "Desempeño competente, regular, de acuerdo a lo medianamente esperado."
        },
        {
          "puntaje": 2,
          "rango_nota": "4.0 - 4.9",
          "etiqueta": "Básico",
          "descripcion": "Desempeño básico, de escasos avances, mínimo."
        },
        {
          "puntaje": 1,
          "rango_nota": "3.9 - 1.0",
          "etiqueta": "Deficiente",
          "descripcion": "Desempeño deficiente, precario, insatisfactorio."
        }
      ],
      "opcion_no_observado": {
        "permitido": true,
        "valor_guardado": null,
        "excluir_del_calculo": true
      }
    }
  },
  "dimensiones": [
    {
      "orden": 1,
      "codigo": "I",
      "nombre": "CO-ENSEÑANZA",
      "descripcion_adicional": "¿Cuál tipo de enseñanza se observa?",
      "indicadores": [
        {
          "numero": "1.1",
          "texto": "Se evidencia enseñanza complementaria.",
          "requiere_observacion": true
        },
        {
          "numero": "1.2",
          "texto": "Evidencia enseñanza en equipo (co-enseñanza).",
          "requiere_observacion": true
        }
      ]
    },
    {
      "orden": 2,
      "codigo": "II",
      "nombre": "ESTRUCTURA DE LA CLASE",
      "indicadores": [
        {
          "numero": "2.1",
          "texto": "Participa del saludo o saluda al grupo curso al iniciar su actividad.",
          "requiere_observacion": true
        },
        {
          "numero": "2.2",
          "texto": "Maneja la planificación o contenidos de la clase, lo que le permite intervenir en la misma.",
          "requiere_observacion": true
        },
        {
          "numero": "2.3",
          "texto": "Interviene en el inicio.",
          "requiere_observacion": true
        },
        {
          "numero": "2.4",
          "texto": "Participa activamente del desarrollo de la clase.",
          "requiere_observacion": true
        },
        {
          "numero": "2.5",
          "texto": "Ejecuta el cierre mediante la retroalimentación o síntesis de lo enseñado.",
          "requiere_observacion": true
        },
        {
          "numero": "2.6",
          "texto": "Se hace uso adecuado del tiempo, permitiendo ejecutar todos los momentos de la clase.",
          "requiere_observacion": true
        },
        {
          "numero": "2.7",
          "texto": "Se evidencia material digital, concreto u otro recurso apropiado para facilitar los aprendizajes y el acceso a los objetivos.",
          "requiere_observacion": true
        },
        {
          "numero": "2.8",
          "texto": "Promueve la participación de los estudiantes, especialmente los que presentan NEE.",
          "requiere_observacion": true
        },
        {
          "numero": "2.9",
          "texto": "Realiza monitoreo constante de los aprendizajes de los estudiantes.",
          "requiere_observacion": true
        },
        {
          "numero": "2.10",
          "texto": "Complementa con diferentes estrategias los momentos de la clase para el logro de habilidades cognitivas según la diversidad del grupo curso.",
          "requiere_observacion": true
        },
        {
          "numero": "2.11",
          "texto": "Realiza o participa en pausas activas durante la clase o cambio de hora.",
          "requiere_observacion": true
        }
      ]
    },
    {
      "orden": 3,
      "codigo": "III",
      "nombre": "AMBIENTE PARA EL APRENDIZAJE",
      "indicadores": [
        {
          "numero": "3.1",
          "texto": "Se cumple con el protocolo mencionando las normas dentro de la clase.",
          "requiere_observacion": true
        },
        {
          "numero": "3.2",
          "texto": "Maneja de forma adecuada la disciplina de los estudiantes.",
          "requiere_observacion": true
        },
        {
          "numero": "3.3",
          "texto": "Mantiene una relación cercana con los estudiantes.",
          "requiere_observacion": true
        },
        {
          "numero": "3.4",
          "texto": "Contribuye a mantener un buen ambiente y orden a nivel del aula.",
          "requiere_observacion": true
        },
        {
          "numero": "3.5",
          "texto": "Cumple con los horarios de inicio de clases.",
          "requiere_observacion": true
        },
        {
          "numero": "3.6",
          "texto": "Se observan factores externos que interfieren en el desarrollo adecuado de la clase.",
          "requiere_observacion": true
        },
        {
          "numero": "3.7",
          "texto": "Emplea Lenguaje formal y cálido en el trato con los estudiantes.",
          "requiere_observacion": true
        },
        {
          "numero": "3.8",
          "texto": "Evidencia empleo de refuerzos positivos frente a las conductas o respuestas adecuadas de los estudiantes.",
          "requiere_observacion": true
        }
      ]
    }
  ],
  "secciones_retroalimentacion": [
    {
      "codigo": "IV",
      "titulo": "OBSERVACIONES",
      "subcampos": [
        { "id": "obs_coordinadora", "label": "Comentarios de Coordinadora PIE" },
        { "id": "obs_especialista", "label": "Comentarios de Especialista PIE" }
      ]
    },
    {
      "codigo": "V",
      "titulo": "¿QUÉ SE DESTACA DE LA EXPERIENCIA OBSERVADA?",
      "subcampos": [
        { "id": "destaca_coordinadora", "label": "Comentarios de Coordinadora PIE" },
        { "id": "destaca_especialista", "label": "Comentarios de Especialista PIE" }
      ]
    },
    {
      "codigo": "VI",
      "titulo": "¿QUÉ SE PODRÍA MEJORAR DE LO OBSERVADO?",
      "subcampos": [
        { "id": "mejorar_coordinadora", "label": "Comentarios de Coordinadora PIE" },
        { "id": "mejorar_especialista", "label": "Comentarios de Especialista PIE" }
      ]
    }
  ]
}
```

---

### 2. Guía Técnica para el Desarrollador: Lógica de Negocio y Aplicación

Para integrar esta pauta de manera adecuada en su aplicación frontend (HTML/JS/CSS) y backend, considere las siguientes especificaciones sobre el funcionamiento del sistema:

#### A. Filtrado y Permisos por Rol (`roles_permitidos`)
*   **Restricción de Acceso:** Al cargar el listado de pautas disponibles, el frontend debe verificar el rol del usuario activo. Esta pauta solo debe mostrarse si el usuario posee el rol `"pie"` (o `"admin"` para fines de supervisión global).
*   **Asociación de Establecimiento:** Solo se deben listar los docentes que compartan el `colegio_id` del usuario evaluador PIE.

#### B. Lógica del "No Observado" (N/O)
El documento impreso incluye la columna "NO OBSERVADO". En la base de datos, esto debe gestionarse con cuidado para evitar distorsiones en el promedio final del docente:
*   **Comportamiento en Frontend:** Si el evaluador selecciona la casilla "No Observado" para un indicador, la selección numérica (1 a 4) debe deshabilitarse y su valor almacenado debe ser `null` o una bandera específica (por ejemplo, `0`).
*   **Exclusión del Promedio:** Al calcular el promedio de una dimensión o el promedio general de la pauta, el backend y el frontend **no deben** incluir los ítems marcados como "No Observado" en el divisor. 
    $$\text{Promedio Dimensión} = \frac{\sum \text{Puntajes válidos obtenidos}}{\text{Cantidad de indicadores evaluados (excluyendo N/O)}}$$
*   **Validación:** Si todos los indicadores de una dimensión son marcados como "No Observado", el promedio de dicha dimensión debe mostrarse como "N/O" o no aplicar puntaje, en lugar de generar una división por cero.

#### C. Lógica de Puntaje y Escala de Notas (Conversión)
El sistema utiliza una escala de 1 a 4 puntos que se correlaciona con rangos de calificación tradicionales chilenos (1.0 a 7.0):
*   **Puntaje Máximo Posible:** 4.0 (Equivale a un desempeño Excelente en rango de notas 6.0 - 7.0).
*   **Puntaje Mínimo Posible:** 1.0 (Equivale a un desempeño Deficiente en rango de notas 1.0 - 3.9).
*   **Cálculo de Categoría de Desempeño:** Al finalizar la evaluación, el promedio global obtenido (que estará entre 1.0 y 4.0) debe categorizarse automáticamente según la escala definida:
    *   $\text{Promedio} \ge 3.5 \rightarrow$ "Desempeño Excelente"
    *   $2.5 \le \text{Promedio} < 3.5 \rightarrow$ "Desempeño Competente"
    *   $1.5 \le \text{Promedio} < 2.5 \rightarrow$ "Desempeño Básico"
    *   $\text{Promedio} < 1.5 \rightarrow$ "Desempeño Deficiente"
    *(Nota: Estos rangos de corte para el promedio de puntajes pueden ser parametrizados según los criterios internos del establecimiento).*

#### D. Estructura de Retroalimentación en dos Actores (Coordinadora vs. Especialista)
Las secciones IV, V y VI del documento impreso diferencian explícitamente los comentarios escritos por la **Coordinadora PIE** y la **Especialista PIE**:
*   **Implementación en Formulario:** En el formulario HTML, renderice dos áreas de texto independientes (`textarea`) por cada una de estas secciones. Esto asegura que se resguarden las opiniones técnicas de ambos profesionales que participan en el proceso de acompañamiento en aula.