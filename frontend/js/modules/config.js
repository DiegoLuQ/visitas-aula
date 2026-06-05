import { api } from '../api.js';
import { mostrarLoading, showAlert } from '../utils.js';

export async function respaldarManual() {
    try {
        mostrarLoading(true, 'Generando respaldo SQL...');
        const response = await api.config.backup.sql();
        
        if (!response.ok) throw new Error('Error al generar el respaldo');
        
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `respaldo_${new Date().toISOString().slice(0, 10)}.sql`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        window.URL.revokeObjectURL(url);
        
        mostrarLoading(false);
        showAlert('Éxito', 'Respaldo descargado correctamente.', 'success');
    } catch (error) {
        mostrarLoading(false);
        showAlert('Error', error.message, 'error');
    }
}

export async function enviarRespaldoCorreo() {
    if (!confirm('¿Desea enviar el respaldo por correo ahora?')) return;
    try {
        mostrarLoading(true, 'Enviando respaldo por correo...');
        const res = await api.config.backup.email();
        mostrarLoading(false);
        showAlert('Respaldo', res.message || 'Respaldo enviado con éxito.', 'info');
    } catch (error) {
        mostrarLoading(false);
        showAlert('Error', error.message, 'error');
    }
}

export async function ejecutarReporteSemanal() {
    if (!confirm('¿Desea ejecutar y enviar el REPORTE SEMANAL ahora mismo a todos los destinatarios configurados?')) return;
    try {
        const btn = document.getElementById('btnForceReport');
        if (btn) btn.disabled = true;
        
        mostrarLoading(true, 'Iniciando reporte semanal...');
        const res = await api.config.executeScheduledReport();
        mostrarLoading(false);
        showAlert('Reporte Programado', res.message, 'success');
        
        if (btn) btn.disabled = false;
        
        // Refrescar historial tras un breve delay
        setTimeout(() => loadReportHistory(), 1500);
    } catch (error) {
        mostrarLoading(false);
        showAlert('Error', error.message, 'error');
        const btn = document.getElementById('btnForceReport');
        if (btn) btn.disabled = false;
    }
}

export async function ejecutarRespaldoProgramado() {
    if (!confirm('¿Desea ejecutar el RESPALDO PROGRAMADO (SQL por correo) ahora mismo?')) return;
    try {
        mostrarLoading(true, 'Iniciando respaldo programado...');
        const res = await api.config.executeScheduledBackup();
        mostrarLoading(false);
        showAlert('Respaldo Programado', res.message, 'success');

        // Refrescar historial
        setTimeout(() => loadReportHistory(), 1500);
    } catch (error) {
        mostrarLoading(false);
        showAlert('Error', error.message, 'error');
    }
}

export async function loadReportHistory() {
    try {
        const logs = await api.config.getReportHistory();
        const listEl = document.getElementById('reportHistoryList');
        if (!listEl) return;

        listEl.innerHTML = logs.map(log => {
            const fecha = new Date(log.fecha_envio).toLocaleString('es-ES');
            const statusClass = log.status === 'EXITO' ? 'badge-success' : 'badge-danger';
            return `
                <tr>
                    <td>${fecha}</td>
                    <td><span class="badge badge-info">${log.tipo_reporte}</span></td>
                    <td style="font-size: 0.8em;">${log.destinatarios}</td>
                    <td><span class="badge ${statusClass}">${log.status}</span></td>
                    <td title="${log.error_message || ''}">${log.error_message || '-'}</td>
                </tr>
            `;
        }).join('') || '<tr><td colspan="5" class="text-center">No hay registros aún.</td></tr>';
    } catch (error) {
        console.error('Error loadReportHistory:', error);
    }
}


