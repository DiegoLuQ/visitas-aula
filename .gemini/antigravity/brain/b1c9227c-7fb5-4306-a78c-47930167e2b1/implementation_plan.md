# Implementación: Pauta de Acompañamiento UTP (SaaS Modern)

Este plan detalla la creación de un nuevo módulo de evaluación avanzada para el equipo de UTP, utilizando un diseño de "Dashboard Ejecutivo" y lógica de cálculo en tiempo real.

## User Review Required

> [!IMPORTANT]
> **Definición de Escala:** ¿Qué valores numéricos asignaremos a cada nivel para el cálculo del puntaje? 
> Sugerencia: N/A (0, excluido del promedio), Inicial (1), En Desarrollo (2), Adecuado (3), Destacado (4).

> [!WARNING]
> **Persistencia:** ¿Deseas que los borradores se guarden automáticamente en el servidor a medida que avanzas en el Wizard, o solo al final? Recomiendo guardado final para simplificar la primera versión.

## Proposed Changes

### [Componente Frontend]

#### [NEW] [utp_pauta.js](file:///c:/SISTEMAS-PRUEBA/LIDERAZGO-V2/frontend/js/modules/utp_pauta.js)
- **Gestión de Estado:** Objeto `utpState` para manejar las 3 dimensiones, el plan estratégico y el acta.
- **Lógica de Wizard:** Funciones `nextStep()` y `prevStep()` con validación de campos obligatorios.
- **Cálculo en Tiempo Real:** Listener global que actualiza los totales por dimensión cada vez que cambia un indicador.
- **Tabla Dinámica:** Funciones para inyectar/eliminar filas en el Plan Estratégico.

#### [MODIFY] [dashboard.html](file:///c:/SISTEMAS-PRUEBA/LIDERAZGO-V2/frontend/dashboard.html)
- Agregar opción "Pauta UTP" en el sidebar (sección de Visitas o una nueva categoría).
- Contenedor `#utpWizardContainer` para inyectar la interfaz.

#### [MODIFY] [main.js](file:///c:/SISTEMAS-PRUEBA/LIDERAZGO-V2/frontend/js/main.js)
- Registrar la nueva ruta `utp-pauta` en el router del frontend.

### [Componente Backend]

#### [MODIFY] [Plantilla]
- Crear una nueva entrada en la base de datos para la plantilla ID 3 ("Pauta Acompañamiento UTP").
- Asegurar que el endpoint de guardado acepte el formato extendido de esta pauta (incluyendo el Plan Estratégico).

---

## Plan de Verificación

### Pruebas Automatizadas
- Verificación de la fórmula de cálculo (especialmente el manejo de N/A para no castigar el promedio).
- Test de exportación JSON: Verificar que el objeto consolidado contiene los 28 indicadores y las filas del plan estratégico.

### Verificación Manual
- Navegar por el Wizard en modo tablet (inspeccionando el navegador) para asegurar que los controles de 5 niveles son fáciles de tocar.
- Añadir 5 compromisos al Plan Estratégico y verificar que se guardan correctamente.
