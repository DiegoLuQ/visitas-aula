import { api } from './api.js';
import { state } from './state.js';
import { loadUserInfo, setupNavigation, navigateTo, logout } from './navigation.js';
import { mostrarLoading, showAlert, closeAlert, showConfirm, closeConfirm, capitalize, loadModularPages } from './utils.js';
import { showModal, closeModal } from './modules/ui.js';
import { 
    loadDocentes, saveDocente, deleteDocente, editDocente, 
    loadColegiosForFilter, exportarDocentesExcel, descargarDocentesPlantilla, importarDocentesExcel,
    setupTOTP, confirmTOTP, closeModalTotp
} from './modules/docentes.js';
import { 
    loadEvaluaciones, initEvaluacionForm, guardarEvaluacion, 
    calcularPromedios, closeResumen, verDetalle, deleteEvaluacion,
    previsualizarPDF, cerrarPreviewPDF, descargarPDF, imprimirResumen, crearNuevaEvaluacion,
    limpiarFiltrosEval, loadColegiosForEvalFilter, verFormularioSoloLectura, sortData,
    descargarFormularioPDF, prepareSignature, finalizeEvaluation,
    closeModalSignature, cancelSignatureProcess, submitManualSignature,
    sendEmailAccompaniment,
    showEmailSuccessModal, copyShareLink, sendEmailWithSummary, showEmailResendModal, showEmailResendModalFromHeader,
    guardarCambiosBorrador, resumeEditingDraft, requestRemoteSign, requestRemoteSignFromForm, executeRemoteSignFromForm
} from './modules/evaluaciones.js';
import { 
    loadDashboardStats, loadColegiosForDashboardFilter 
} from './modules/dashboard_stats.js';
import { 
    respaldarManual, enviarRespaldoCorreo, ejecutarReporteSemanal, ejecutarRespaldoProgramado, loadReportHistory
} from './modules/config.js';

import {
    loadColegios, saveColegio, deleteColegio, editColegio,
    loadCursos, saveCurso, deleteCurso,
    loadAsignaturas, saveAsignatura, deleteAsignatura,
    loadUsuarios, deleteUsuario, editUsuario, closeUserModal,
    exportarUsuariosExcel, descargarUsuariosPlantilla, importarUsuariosExcel
} from './modules/admin.js';
import {
    initReportes, actualizarReportes, exportarReportePDF
} from './modules/reportes.js';
import {
    loadMetas, editMeta, deleteMeta, closeMetaModal,
    exportarMetasExcel, descargarMetasPlantilla, importarMetasExcel
} from './modules/metas.js';
import {
    loadPlantilla, showModalDimension, saveDimension, deleteDimension,
    showModalIndicador, saveIndicador, deleteIndicador, exportarPlantillaExcel,
    showModalEditPlantilla, savePlantilla, duplicarPlantilla, confirmarDuplicarPlantilla,
    exportarEstructuraPlantilla, showModalImportPlantilla, confirmImportPlantilla, deletePlantilla
} from './modules/plantilla.js';
import {
    showPlatformSelector, selectPlatform, updateContextUI, togglePlatform
} from './modules/platform_selector.js';
import { initTheme } from './modules/theme.js';
import { 
    loadVisitasDashboard, initVisitaForm, guardarVisita, nuevaVisitaDocente, loadVisitaDocentes, cambiarTipoPauta,
    showModalDetalleVisitasDocente, setVisitaDetalleFiltro, setVisitaDetalleAnio, agregarFilaEstudiante, reordenarNumeracionEstudiantes, verLiderazgoDocente,
    actualizarPromediosPie, filtrarDocentesVisitados
} from './modules/visitas.js';
import {
    loadVisitasHistorial, aplicarFiltros as aplicarFiltrosVisitas, limpiarFiltros as limpiarFiltrosVisitas,
    toggleFiltrosVisitas,
    verDetalleVisita, eliminarVisita, abrirModalFirma, iniciarFirmaDigital, iniciarFirmaEmail, confirmarEnvioFirma,
    regenerarLinkFirma, enviarPautaResumida, confirmarEnvioPauta
} from './modules/visitas_historial.js';
import {
    initUtpPauta, updateUtpScore, updateUtpEvidence, addUtpPlanRow, removeUtpPlanRow, updateUtpPlanField, confirmUtpSave,
    nextStep, prevStep, setUtpViewMode
} from './modules/utp_pauta.js';
import {
    initSubirVisita, loadSubirVisitaDocentes, onSubirVisitaArchivo, guardarSubirVisita,
    setSubirVisitaModo, loadSubirVisitaMasivaColegio, onSubirVisitaMasivaArchivos,
    subirFilaMasiva, subirTodasMasiva, eliminarFilaMasiva, limpiarSubirMasiva
} from './modules/subir_visita.js';
import { openPdfViewer, descargarPdfVisita } from './modules/pdf_viewer.js';
import { submitChangePassword } from './modules/cambiar_contrasena.js';

// Expose to window for HTML onclick/onchange handlers
const app = {
    logout,
    submitChangePassword,
    navigateTo,
    showModal,
    closeModal,
    // Docentes
    loadDocentes, saveDocente, deleteDocente, editDocente,
    loadColegiosForFilter, exportarDocentesExcel, descargarDocentesPlantilla, importarDocentesExcel,
    setupTOTP, confirmTOTP, closeModalTotp,
    // Evaluaciones
    loadEvaluaciones, initEvaluacionForm, guardarEvaluacion,
    calcularPromedios, closeResumen, verDetalle, deleteEvaluacion,
    previsualizarPDF, cerrarPreviewPDF, descargarPDF, imprimirResumen, crearNuevaEvaluacion,
    limpiarFiltrosEval, loadColegiosForEvalFilter, verFormularioSoloLectura, sortData, descargarFormularioPDF,
    prepareSignature, finalizeEvaluation,
    closeModalSignature, cancelSignatureProcess, submitManualSignature,
    sendEmailAccompaniment,
    showEmailResendModal,
    showEmailResendModalFromHeader,
    showEmailSuccessModal,
    copyShareLink,
    sendEmailWithSummary,
    guardarCambiosBorrador,
    resumeEditingDraft,
    requestRemoteSign,
    requestRemoteSignFromForm,
    executeRemoteSignFromForm,
    // Dashboard
    loadDashboardStats, loadColegiosForDashboardFilter,
    // Config
    respaldarManual, enviarRespaldoCorreo, ejecutarReporteSemanal, ejecutarRespaldoProgramado,

    // Admin CRUDs
    loadColegios, saveColegio, deleteColegio, editColegio,
    loadCursos, saveCurso, deleteCurso,
    loadAsignaturas, saveAsignatura, deleteAsignatura,
    loadUsuarios, deleteUsuario, editUsuario, closeUserModal,
    exportarUsuariosExcel, descargarUsuariosPlantilla, importarUsuariosExcel,
    // Reportes
    initReportes, actualizarReportes, exportarReportePDF,
    // Metas
    loadMetas, editMeta, deleteMeta, closeMetaModal,
    exportarMetasExcel, descargarMetasPlantilla, importarMetasExcel,
    // Plantilla
    loadPlantilla, showModalDimension, saveDimension, deleteDimension,
    showModalIndicador, saveIndicador, deleteIndicador, exportarPlantillaExcel,
    showModalEditPlantilla, savePlantilla, duplicarPlantilla, confirmarDuplicarPlantilla,
    exportarEstructuraPlantilla, showModalImportPlantilla, confirmImportPlantilla, deletePlantilla,
    // Utils
    showAlert, closeAlert, showConfirm, closeConfirm, mostrarLoading, capitalize,
    // Configuración de Correos
    loadEmailRecipients,
    addEmailRecipient,
    editEmailRecipient,
    saveEmailRecipientEdit,
    deleteEmailRecipient,
    loadReportHistory,
    // Platform Selector
    showPlatformSelector,
    selectPlatform,
    togglePlatform,
    // Visitas
    loadVisitasDashboard, initVisitaForm, guardarVisita, nuevaVisitaDocente, loadVisitaDocentes, cambiarTipoPauta,
    showModalDetalleVisitasDocente, setVisitaDetalleFiltro, setVisitaDetalleAnio, agregarFilaEstudiante, reordenarNumeracionEstudiantes, verLiderazgoDocente,
    actualizarPromediosPie, filtrarDocentesVisitados,
    // UTP Pauta
    initUtpPauta, updateUtpScore, updateUtpEvidence, addUtpPlanRow, removeUtpPlanRow, updateUtpPlanField, confirmUtpSave,
    nextStep, prevStep, setUtpViewMode,
    // Subir Visita (PDF histórico)
    initSubirVisita, loadSubirVisitaDocentes, onSubirVisitaArchivo, guardarSubirVisita,
    setSubirVisitaModo, loadSubirVisitaMasivaColegio, onSubirVisitaMasivaArchivos,
    subirFilaMasiva, subirTodasMasiva, eliminarFilaMasiva, limpiarSubirMasiva,
    // Visor de PDF
    openPdfViewer, descargarPdfVisita,
    // Visitas Historial
    loadVisitasHistorial, aplicarFiltrosVisitas, limpiarFiltrosVisitas, toggleFiltrosVisitas,
    verDetalleVisita, eliminarVisita,
    abrirModalFirma, iniciarFirmaDigital, iniciarFirmaEmail, confirmarEnvioFirma, regenerarLinkFirma, enviarPautaResumida, confirmarEnvioPauta
};

Object.assign(window, app);
window.app = app;

// Orchestrate global navigation events
window.addEventListener('page-navigation', async (e) => {
    const { page } = e.detail;
    console.log('Navigating to module:', page);
    
    switch (page) {
        case 'inicio':
            await loadColegiosForDashboardFilter();
            await loadDashboardStats();
            break;
        case 'evaluaciones':
            await loadEvaluaciones();
            break;
        case 'nueva-evaluacion':
            await initEvaluacionForm();
            break;
        case 'docentes':
            await loadDocentes();
            await loadColegiosForFilter();
            break;
        case 'colegios':
            await loadColegios();
            break;
        case 'cursos':
            await loadCursos();
            break;
        case 'asignaturas':
            await loadAsignaturas();
            break;
        case 'usuarios':
            await loadUsuarios();
            break;
        case 'metas':
            await loadMetas();
            break;
        case 'plantilla':
            await loadPlantilla();
            break;
        case 'reportes':
            await initReportes();
            break;
        case 'resumen-evaluacion':
            window.scrollTo(0, 0);
            break;
        case 'config-emails':
            // Cargar colegios para el dropdown de destinatarios
            try {
                const colegios = await api.colegios.getAll();
                const selectColegio = document.getElementById('newRecipientColegio');
                if (selectColegio) {
                    selectColegio.innerHTML = '<option value="">Todos los colegios (Global)</option>' + 
                        colegios.map(c => `<option value="${c.id}">${c.nombre}</option>`).join('');
                }
            } catch (err) {
                console.error('Error loading schools for config:', err);
            }
            await loadEmailRecipients();
            break;
        case 'sistema':
            await loadReportHistory();
            break;
        case 'visitas-dashboard':
            await loadVisitasDashboard();
            break;
        case 'visitas-nueva':
            // Por defecto carga el formulario de aula (plantilla 2), 
            // a menos que se llame explícitamente a initUtpPauta después.
            await initVisitaForm();
            break;
        case 'utp-pauta':
            navigateTo('visitas-nueva', true); // skipEvent para evitar recarga de initVisitaForm
            await initUtpPauta();
            break;
        case 'visitas-historial':
            await loadVisitasHistorial();
            break;
        case 'subir-visita':
            await initSubirVisita();
            break;
        case 'cambiar-contrasena':
            document.getElementById('newPasswordInput')?.focus();
            break;
    }
});

document.addEventListener('DOMContentLoaded', async () => {
    console.log('Initializing Modular Frontend...');

    // Aplicar de inmediato el último tema conocido para evitar parpadeo
    initTheme();

    try {
        await loadModularPages();
        console.log('Modular pages loaded successfully');

        if (!api.checkAuth()) return;

        setupNavigation();
        
        await loadUserInfo();
        console.log('User info loaded successfully');
        
        // Global Event Listeners
        document.getElementById('btnLogout')?.addEventListener('click', logout);
        document.getElementById('evaluacionForm')?.addEventListener('submit', (e) => {
            if (window.app && window.app.guardarEvaluacion) window.app.guardarEvaluacion(e);
        });
        document.getElementById('visitaForm')?.addEventListener('submit', (e) => {
            if (window.app && window.app.guardarVisita) window.app.guardarVisita(e);
        });
        
        // Initialize default page
        const lastPage = localStorage.getItem('lastPage') || 'inicio';
        
        // Verificar si se requiere selección de plataforma
        const userAccess = localStorage.getItem('userAccess');
        if (userAccess === 'todos' && !state.currentContext) {
            showPlatformSelector();
        } else {
            updateContextUI();
            
            // Redirigir a inicio del contexto si la página guardada no aplica
            if (state.currentContext === 'visita' && lastPage === 'inicio') {
                navigateTo('visitas-dashboard');
            } else {
                navigateTo(lastPage);
            }
        }

        // Menú de configuración: Ahora son links directos manejados por setupNavigation
    } catch (globalErr) {
        console.error('Fatal initialization error:', globalErr);
        document.body.innerHTML = `
            <div style="display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100vh; font-family: sans-serif; text-align: center; padding: 20px;">
                <h1 style="color: #dc3545;">Error de Inicialización</h1>
                <p>No se pudo cargar el sistema correctamente. Por favor, intenta recargar la página.</p>
                <div style="background: #f8f9fa; padding: 15px; border-radius: 8px; margin-top: 20px; text-align: left; max-width: 600px; overflow: auto; border: 1px solid #ddd;">
                    <code style="color: #c62828;">${globalErr.message}</code>
                </div>
            </div>
        `;
    }
});

// --- Funciones de Configuración de Correos ---
async function loadEmailRecipients() {
    try {
        const recipients = await api.config.getEmailRecipients();
        const listEl = document.getElementById('emailRecipientsList');
        if (!listEl) return;
        
        listEl.innerHTML = recipients.map(r => `
            <tr>
                <td>${r.nombre}</td>
                <td>${r.email}</td>
                <td><span class="badge badge-info">${r.colegio_nombre || 'Global'}</span></td>
                <td><span class="badge ${r.recibe_reporte ? 'badge-primary' : 'badge-secondary'}">${r.recibe_reporte ? 'SÍ' : 'NO'}</span></td>
                <td><span class="badge ${r.activo ? 'badge-success' : 'badge-secondary'}">${r.activo ? 'Activo' : 'Inactivo'}</span></td>
                <td>
                    <button class="btn btn-primary btn-sm" onclick="window.app.editEmailRecipient(${r.id})" style="margin-right: 4px;">Editar</button>
                    <button class="btn btn-danger btn-sm" onclick="window.app.deleteEmailRecipient(${r.id})">Eliminar</button>
                </td>
            </tr>
        `).join('') || '<tr><td colspan="6" class="text-center">No hay destinatarios configurados.</td></tr>';
    } catch (error) {
        console.error('Error loadEmailRecipients:', error);
    }
}

async function addEmailRecipient(e) {
    if (e) e.preventDefault();
    const nombre = document.getElementById('newRecipientNombre').value;
    const email = document.getElementById('newRecipientEmail').value;
    const colegio_id = document.getElementById('newRecipientColegio').value;
    const recibe_reporte = document.getElementById('newRecipientRecibeReporte').checked;
    
    if (!nombre || !email) return;
    
    try {
        mostrarLoading(true, 'Agregando destinatario...');
        await api.config.createEmailRecipient({ 
            nombre, 
            email, 
            colegio_id: colegio_id ? parseInt(colegio_id) : null,
            recibe_reporte,
            activo: true 
        });
        mostrarLoading(false);
        document.getElementById('formAddRecipient').reset();
        await loadEmailRecipients();
        showAlert('Éxito', 'Destinatario agregado correctamente', 'success');
    } catch (error) {
        mostrarLoading(false);
        showAlert('Error', error.message, 'error');
    }
}

async function editEmailRecipient(id) {
    try {
        mostrarLoading(true, 'Cargando información del destinatario...');
        const recipients = await api.config.getEmailRecipients();
        const r = recipients.find(x => x.id === id);
        const colegios = await api.colegios.getAll();
        mostrarLoading(false);

        if (!r) {
            showAlert('Error', 'Destinatario no encontrado', 'error');
            return;
        }

        const modalHtml = `
            <div id="modalEditRecipient" class="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center z-[9999] p-4">
                <div class="bg-white rounded-[32px] shadow-2xl w-full max-w-md overflow-hidden animate-in zoom-in duration-300">
                    <div class="bg-indigo-600 p-8 text-white">
                        <h3 class="text-2xl font-black italic tracking-tight">EDITAR DESTINATARIO</h3>
                        <p class="text-indigo-100 text-xs mt-1">Modifique los datos del destinatario para copia (CC).</p>
                    </div>
                    <div class="p-8">
                        <form id="formEditRecipientSubmit" onsubmit="window.app.saveEmailRecipientEdit(event, ${id})">
                            <div class="space-y-4">
                                <div class="form-group">
                                    <label class="block text-xs font-bold text-slate-500 uppercase mb-1">Nombre / Cargo:</label>
                                    <input type="text" id="editRecipientNombre" class="form-control w-full border p-2 rounded-lg" value="${r.nombre}" required>
                                </div>
                                <div class="form-group">
                                    <label class="block text-xs font-bold text-slate-500 uppercase mb-1">Correo Electrónico:</label>
                                    <input type="email" id="editRecipientEmail" class="form-control w-full border p-2 rounded-lg" value="${r.email}" required>
                                </div>
                                <div class="form-group">
                                    <label class="block text-xs font-bold text-slate-500 uppercase mb-1">Colegio (Filtro):</label>
                                    <select id="editRecipientColegio" class="form-control w-full border p-2 rounded-lg">
                                        <option value="">Todos los colegios (Global)</option>
                                        ${colegios.map(c => `<option value="${c.id}" ${c.id == r.colegio_id ? 'selected' : ''}>${c.nombre}</option>`).join('')}
                                    </select>
                                </div>
                                <div class="form-group flex flex-col gap-2 pt-2">
                                    <label class="flex items-center gap-3 cursor-pointer">
                                        <input type="checkbox" id="editRecipientRecibeReporte" style="width: 20px; height: 20px;" ${r.recibe_reporte ? 'checked' : ''}>
                                        <span class="text-sm font-semibold text-slate-700">¿Recibe Reporte Semanal Global?</span>
                                    </label>
                                    <label class="flex items-center gap-3 cursor-pointer">
                                        <input type="checkbox" id="editRecipientActivo" style="width: 20px; height: 20px;" ${r.activo ? 'checked' : ''}>
                                        <span class="text-sm font-semibold text-slate-700">Estado Activo</span>
                                    </label>
                                </div>
                            </div>
                            <div class="flex gap-4 mt-8">
                                <button type="button" onclick="document.getElementById('modalEditRecipient').remove()" class="flex-1 py-3 text-slate-400 hover:text-slate-600 font-black uppercase tracking-widest text-xs">
                                    Cancelar
                                </button>
                                <button type="submit" class="flex-1 bg-indigo-600 hover:bg-indigo-700 text-white py-3 rounded-xl font-black uppercase tracking-widest text-xs shadow-md">
                                    Guardar Cambios
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            </div>
        `;
        document.body.insertAdjacentHTML('beforeend', modalHtml);
    } catch (error) {
        mostrarLoading(false);
        showAlert('Error', 'No se pudo cargar la información: ' + error.message, 'error');
    }
}

async function saveEmailRecipientEdit(e, id) {
    if (e) e.preventDefault();
    const nombre = document.getElementById('editRecipientNombre').value;
    const email = document.getElementById('editRecipientEmail').value;
    const colegio_id = document.getElementById('editRecipientColegio').value;
    const recibe_reporte = document.getElementById('editRecipientRecibeReporte').checked;
    const activo = document.getElementById('editRecipientActivo').checked;
    
    if (!nombre || !email) return;

    try {
        mostrarLoading(true, 'Guardando cambios...');
        await api.config.updateEmailRecipient(id, {
            nombre,
            email,
            colegio_id: colegio_id ? parseInt(colegio_id) : null,
            recibe_reporte,
            activo
        });
        mostrarLoading(false);
        document.getElementById('modalEditRecipient')?.remove();
        await loadEmailRecipients();
        showAlert('Éxito', 'Destinatario actualizado correctamente', 'success');
    } catch (error) {
        mostrarLoading(false);
        showAlert('Error', error.message, 'error');
    }
}

async function deleteEmailRecipient(id) {
    if (!confirm('¿Desea eliminar este destinatario?')) return;
    try {
        mostrarLoading(true, 'Eliminando...');
        await api.config.deleteEmailRecipient(id);
        mostrarLoading(false);
        await loadEmailRecipients();
        showAlert('Éxito', 'Destinatario eliminado', 'success');
    } catch (error) {
        mostrarLoading(false);
        showAlert('Error', error.message, 'error');
    }
}
