# 🚀 Flujo de Trabajo: Sistema de Liderazgo Docente

Este documento explica paso a paso cómo funciona el sistema, desde el registro de un docente hasta el cierre definitivo de un acompañamiento con firma digital.

---

## 1. Configuración de Firma Digital (Enrolamiento)
Antes de poder firmar digitalmente, cada docente debe vincular su cuenta con una aplicación de autenticación (como **Google Authenticator**).

1.  **Acceso Administrativo**: El administrador o observador ingresa a la sección **Docentes**.
2.  **Generación de Clave**: Hace clic en el botón **🔑 Firma** del docente correspondiente.
3.  **Vinculación**: Se muestra un código QR. El docente lo escanea con su celular.
4.  **Confirmación**: El docente ingresa el código de 6 dígitos que aparece en su app para validar la conexión.
    - *Este paso se realiza una sola vez por docente.*

---

## 2. Realización del Acompañamiento
El observador registra la práctica docente en el aula.

1.  **Nuevo Registro**: Clic en **"Nuevo Acompañamiento"**.
2.  **Datos**: Selecciona Docente, Curso y Asignatura.
3.  **Rúbrica**: Completa los indicadores de las 5 dimensiones de liderazgo. El sistema calcula los promedios automáticamente.
4.  **Guardado**: Al hacer clic en **"Guardar"**, el estado inicial es **BORRADOR**.
    - *En este estado, el observador puede seguir editando el contenido.*

---

## 3. Proceso de Firma Conjunta
Una vez que el observador termina la retroalimentación con el docente, proceden a la firma.

1.  **Preparación**: El observador hace clic en **"Preparar Firma Digital"** en la pantalla de resumen.
    - El estado cambia a **LISTO PARA FIRMA**.
    - Aparece un código QR en la pantalla del observador.
2.  **Firma del Docente**: 
    - El docente escanea el QR con su propio celular (no requiere iniciar sesión).
    - Se abre una página móvil donde el docente ve el resumen de su evaluación.
    - El docente ingresa su código de 6 dígitos de **Google Authenticator**.
3.  **Notificación Instantánea**:
    - El servidor valida el código.
    - Mediante **WebSockets**, la pantalla del observador se actualiza automáticamente a **"FIRMADA DOCENTE"**.

---

## 4. Cierre y Archivo
El paso final para legalizar el proceso.

1.  **Cierre Definitivo**: El observador hace clic en **"Finalizar y Cerrar"**.
    - El estado cambia a **CERRADA**.
    - El documento queda bloqueado (ya no se puede editar).
2.  **Reportería**:
    - Se puede descargar el **PDF del Acta Final** con los timbres de estado.
    - Los datos alimentan automáticamente el **Panel de Estadísticas** y el **Mapa de Talentos**.
    - El acompañamiento ahora cuenta para los promedios históricos por curso y dimensión.

---

## 📌 Resumen de Estados
| Estado | Descripción | Permite Editar |
| :--- | :--- | :---: |
| **BORRADOR** | Guardado inicial por el observador. | ✅ Sí |
| **LISTO PARA FIRMA** | QR generado, esperando al docente. | ✅ Sí |
| **FIRMADA DOCENTE** | Docente ya validó con su código. | ⚠️ Limitado |
| **CERRADA** | Proceso legalmente finalizado. | ❌ No |
