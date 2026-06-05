/**
 * UI Utilities and Helpers
 */

export function mostrarLoading(show, text = 'Cargando...') {
    const overlay = document.getElementById('loadingOverlay');
    const loadingText = document.getElementById('loadingText');
    if (!overlay) return;

    if (show) {
        if (loadingText) loadingText.textContent = text;
        overlay.classList.add('active');
    } else {
        overlay.classList.remove('active');
    }
}

export function showAlert(title, message, type = 'info', onCloseCallback = null) {
    const overlay = document.getElementById('alertOverlay');
    if (!overlay) {
        alert(`${title}: ${message}`);
        if (onCloseCallback) onCloseCallback();
        return;
    }
    
    document.getElementById('alertTitle').textContent = title;
    document.getElementById('alertBody').innerHTML = `<p style="font-size: 1.1em; line-height: 1.5;">${message}</p>`;
    
    const header = document.getElementById('alertHeader');
    header.className = 'modal-header ' + type;
    
    const okBtn = overlay.querySelector('.modal-footer .btn-primary');
    const closeBtn = overlay.querySelector('.modal-header .modal-close');
    
    const handler = () => {
        closeAlert();
        if (onCloseCallback) onCloseCallback();
    };
    
    if (okBtn) okBtn.onclick = handler;
    if (closeBtn) closeBtn.onclick = handler;
    
    overlay.classList.add('active');
}

export function closeAlert() {
    const overlay = document.getElementById('alertOverlay');
    if (overlay) {
        overlay.classList.remove('active');
        // Restaurar handlers originales de cierre
        const okBtn = overlay.querySelector('.modal-footer .btn-primary');
        const closeBtn = overlay.querySelector('.modal-header .modal-close');
        if (okBtn) okBtn.onclick = () => closeAlert();
        if (closeBtn) closeBtn.onclick = () => closeAlert();
    }
}

export function showConfirm(title, message, onConfirmCallback, onCancelCallback = null) {
    const overlay = document.getElementById('confirmOverlay');
    if (!overlay) {
        if (confirm(`${title}\n\n${message}`)) {
            if (onConfirmCallback) onConfirmCallback();
        } else {
            if (onCancelCallback) onCancelCallback();
        }
        return;
    }
    
    document.getElementById('confirmTitle').textContent = title;
    document.getElementById('confirmBody').innerHTML = `<p style="font-size: 1.1em; line-height: 1.5;">${message}</p>`;
    
    const okBtn = document.getElementById('confirmBtnOk');
    const cancelBtn = overlay.querySelector('.modal-footer .btn-secondary');
    const closeBtn = overlay.querySelector('.modal-header .modal-close');
    
    const handleConfirm = () => {
        closeConfirm();
        if (onConfirmCallback) onConfirmCallback();
    };
    
    const handleCancel = () => {
        closeConfirm();
        if (onCancelCallback) onCancelCallback();
    };
    
    if (okBtn) okBtn.onclick = handleConfirm;
    if (cancelBtn) cancelBtn.onclick = handleCancel;
    if (closeBtn) closeBtn.onclick = handleCancel;
    
    overlay.classList.add('active');
}

export function closeConfirm() {
    const overlay = document.getElementById('confirmOverlay');
    if (overlay) {
        overlay.classList.remove('active');
    }
}

export function capitalize(str) {
    if (!str) return '';
    return str.replace(/-/g, ' ').split(' ').map(part => part.charAt(0).toUpperCase() + part.slice(1)).join('');
}

export function getInterpretacion(promedio) {
    if (promedio === null || promedio === undefined || promedio === 0) return 'N/A';
    if (promedio >= 4.0) return 'Liderazgo consolidado';
    if (promedio >= 3.0) return 'Liderazgo adecuado';
    if (promedio >= 2.0) return 'Liderazgo en desarrollo';
    return 'Liderazgo bajo';
}

export function getBadgeClass(promedio) {
    if (promedio === null || promedio === undefined || promedio === 0) return 'badge-secondary';
    const p = parseFloat(promedio);
    if (p >= 4.5) return 'score-excellent';
    if (p >= 3.0) return 'score-high';
    if (p >= 2.0) return 'score-mid';
    return 'score-low';
}

export function getRoleName(rolId) {
    switch (parseInt(rolId)) {
        case 1: return 'Administrador';
        case 2: return 'Auditor';
        case 3: return 'Observador';
        default: return 'Usuario';
    }
}

export function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

export function formatFecha(fechaStr) {
    if (!fechaStr) return '-';
    // Si viene como YYYY-MM-DD (fecha pura sin hora), evitar el shift de zona horaria
    if (typeof fechaStr === 'string' && fechaStr.includes('-') && !fechaStr.includes('T') && !fechaStr.includes(':')) {
        const parts = fechaStr.split('-');
        if (parts.length === 3) return `${parts[2]}/${parts[1]}/${parts[0]}`;
    }
    const date = new Date(fechaStr);
    return date.toLocaleDateString('es-CL', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric'
    });
}

export async function loadModularPages() {
    const container = document.querySelector('.main-content');
    if (!container) return;

    const pages = [
        'page-inicio.html',
        'page-evaluaciones.html',
        'page-nueva-evaluacion.html',
        'page-colegios.html',
        'page-docentes.html',
        'page-cursos.html',
        'page-reportes.html',
        'page-asignaturas.html',
        'page-plantilla.html',
        'page-usuarios.html',
        'page-metas.html',
        'page-respaldo.html',
        'page-config-emails.html',
        'page-sistema.html',
        'page-resumen-evaluacion.html',
        'page-visitas-dashboard.html',
        'page-visitas-nueva.html',
        'page-visitas-historial.html',
        'page-utp-pauta.html'
    ];

    // Limpiar contenedor (opcional, pero para asegurar que está vacío)
    container.innerHTML = '<div class="text-center p-5"><div class="spinner"></div><p>Cargando módulos...</p></div>';

    try {
        const results = await Promise.all(pages.map(async (page) => {
            const resp = await fetch(`${page}?t=${new Date().getTime()}`);
            if (!resp.ok) throw new Error(`No se pudo cargar el módulo: ${page}`);
            return await resp.text();
        }));

        container.innerHTML = results.join('\n');
    } catch (err) {
        console.error('Error cargando páginas modulares:', err);
        container.innerHTML = `<p class="text-danger text-center">Error al cargar los módulos del sistema: ${err.message}</p>`;
        throw err; // Re-throw to be caught by main.js
    }
}
