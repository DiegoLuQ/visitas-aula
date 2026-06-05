# Proyecto: Sistema de Pauta de Liderazgo Docente (v2.0)

Este documento resume el estado actual del proyecto, sus objetivos principales, la arquitectura técnica y el flujo de trabajo implementado.

## 1. Objetivo del Proyecto
El objetivo principal es proporcionar una plataforma centralizada para la evaluación, seguimiento y acompañamiento del **liderazgo docente** en instituciones educativas. El sistema permite:
- Evaluar el desempeño en sala basado en 5 dimensiones clave.
- Generar reportes visuales dinámicos para detectar fortalezas y áreas de mejora.
- Identificar cursos o docentes que requieran intervención o coaching prioritario.
- Centralizar la gestión de colegios, docentes, cursos y asignaturas.

---

## 2. Arquitectura y Tecnologías
El sistema utiliza una arquitectura desacoplada (Frontend/Backend) y está preparado para entornos de producción mediante contenedores.

- **Backend**: 
    - **FastAPI**: Framework de alto rendimiento para la API.
    - **SQLAlchemy (MariaDB/MySQL)**: ORM para la persistencia de datos.
    - **Pydantic**: Validación de esquemas de datos.
    - **JWT (Python-JOSE)**: Autenticación segura mediante tokens.
    - **APScheduler**: Tareas programadas (Backups automáticos semanales).
- **Frontend**:
    - **Vanilla HTML/JS/CSS**: Interfaz rápida y sin dependencias pesadas.
    - **Chart.js**: Visualización de KPIs y comparativas multidimensionales.
    - **Bootstrap/Custom Styles**: Diseño moderno con "Glassmorphism" y modo oscuro opcional.
- **Despliegue**:
    - **Docker Compose**: Orquestación de contenedores (Frontend, Backend).
    - **Nginx**: Proxy inverso para servir el frontend y redirigir peticiones API.

---

## 3. Módulos del Sistema

### Gestión Administrativa
- **Colegios**: Registro de establecimientos educacionales.
- **Docentes**: Gestión de perfiles docentes vinculados a colegios (con soporte para importación/exportación masiva mediante Excel).
- **Cursos y Asignaturas**: Estructura académica adaptable.
- **Usuarios**: Control de acceso basado en roles (Admin, Auditor, etc.).

### Evaluación y Seguimiento
- **Nueva Evaluación (Plantilla)**: Interfaz interactiva para evaluar 21 indicadores divididos en 5 dimensiones:
    1. Comunicación.
    2. Presencia de Liderazgo.
    3. Organización.
    4. Conducción del Grupo.
    5. Coherencia y Consecuencia.
- **Generación de PDF**: Creación automática de reportes de acompañamiento listos para imprimir y firmar.

### Dashboards y Reportes
- **KPIs Globales**: Total de acompañamientos, promedios generales.
- **Gráfico de Dimensiones**: Puntaje promedio en cada una de las 5 áreas.
- **Análisis por Curso**:
    - **Promedio por Curso**: Identificación de los niveles con mejor y menor desempeño.
    - **Comparativa Multidimensional**: Gráfico detallado que permite ver cómo se comporta cada curso en cada dimensión específica para detectar anomalías.
- **Mapa de Talentos (9-Box Lite)**: Matriz que cruza el puntaje de liderazgo con la orientación al desarrollo.

---

## 4. Flujo de Trabajo (Workflow)

1. **Configuración Inicial**:
    - Carga de colegios, cursos y docentes (manualmente o vía Excel).
2. **Proceso de Evaluación**:
    - El observador selecciona al docente, curso y asignatura.
    - Completa la pauta interactiva. El sistema calcula promedios en tiempo real.
    - Se guarda la evaluación, generando un registro histórico y el PDF correspondiente.
3. **Análisis de Datos**:
    - Los directivos revisan el **Dashboard de Reportes**.
    - Se filtran datos por colegio, asignatura o rango de fechas.
    - Se identifican cursos con "comportamientos extraños" o bajos promedios para planificar acciones de coaching.
4. **Mantenimiento**:
    - El sistema realiza respaldos SQL automáticos todos los viernes a las 18:00 (enviados por correo).
    - Permite descargas manuales de la base de datos desde el menú de Configuración.

---

## 5. Entorno de Ejecución
Actualmente el sistema está configurado para ejecutarse mediante:
```bash
docker-compose up -d --build
```
Con disponibilidad del Frontend en el puerto `80` (dentro de Docker) y el Backend en el puerto `8001`.
