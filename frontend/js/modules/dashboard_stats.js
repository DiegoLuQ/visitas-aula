import { api } from '../api.js';
import { getBadgeClass } from '../utils.js';

export async function loadDashboardStats() {
    const filterColegio = document.getElementById('filterColegioDashboard')?.value || 'all';
    const colegioId = filterColegio !== 'all' ? filterColegio : null;

    try {
        // 1. Cargar estadísticas principales
        const stats = await api.evaluaciones.getDashboardStats(colegioId, 1); // 1 = Liderazgo
        document.getElementById('statTotal').textContent = stats.total_cerradas;
        document.getElementById('statPromedio').textContent = stats.promedio_general;
        document.getElementById('statDocentes').textContent = stats.total_docentes_evaluados;

        // 2. Cargar evaluaciones para extraer los borradores
        const todas = await api.evaluaciones.getAll(colegioId);
        const borradores = todas.filter(ev => ev.estado === 'BORRADOR');
        
        renderBorradoresDashboard(borradores);
        
    } catch (error) {
        console.error('Error cargando estadísticas:', error);
    }
}

function renderBorradoresDashboard(borradores) {
    const tbody = document.getElementById('tableBorradoresDashboard');
    const badge = document.getElementById('badgeBorradoresCount');
    if (!tbody) return;

    if (borradores.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="4" class="text-center p-5">
                    <i class="fas fa-check-circle" style="font-size: 2rem; color: var(--success); margin-bottom: 10px; display: block;"></i>
                    <p style="color: var(--text-light);">No tienes borradores pendientes. ¡Buen trabajo!</p>
                </td>
            </tr>
        `;
        if (badge) badge.style.display = 'none';
        return;
    }

    if (badge) {
        badge.textContent = `${borradores.length} Pendientes`;
        badge.style.display = 'inline-block';
    }

    tbody.innerHTML = borradores.map(ev => `
        <tr>
            <td>
                <div style="font-weight: 700; color: var(--text);">${ev.docente_nombre || 'Sin nombre'}</div>
                <div style="font-size: 0.8em; color: var(--primary); font-weight: 500;">
                    <i class="fas fa-school" style="font-size: 0.75rem; margin-right: 4px;"></i> 
                    ${ev.colegio_nombre || 'Sin colegio'}
                </div>
            </td>
            <td>
                ${new Date(ev.fecha).toLocaleDateString('es-CL')}
            </td>
            <td class="text-center">
                <span class="avg-badge ${getBadgeClass(ev.promedio)}">
                    ${ev.promedio ? ev.promedio.toFixed(2) : '-.--'}
                </span>
            </td>
            <td class="text-right">
                <button class="btn btn-sm btn-secondary" onclick="app.verFormularioSoloLectura(${ev.id})" title="Ver Formulario">
                    <i class="far fa-file-alt"></i> Ver Formulario
                </button>
                <button class="btn btn-sm btn-outline" onclick="app.verDetalle(${ev.id})" title="Ver Resumen">
                    <i class="fas fa-search"></i> Ver Resumen
                </button>
            </td>
        </tr>
    `).join('');
}

export async function loadColegiosForDashboardFilter() {
    const filterSelect = document.getElementById('filterColegioDashboard');
    if (!filterSelect) return;

    try {
        const colegios = await api.colegios.getAll();
        const currentValue = filterSelect.value;
        filterSelect.innerHTML = '<option value="all">Todos los Colegios</option>';
        colegios.forEach(c => {
            const opt = document.createElement('option');
            opt.value = c.id;
            opt.textContent = c.nombre;
            if (c.id == currentValue) opt.selected = true;
            filterSelect.appendChild(opt);
        });
    } catch (error) {
        console.error('Error cargando filtros del dashboard:', error);
    }
}
