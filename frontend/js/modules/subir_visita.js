import { api } from '../api.js';
import { state } from '../state.js';
import { mostrarLoading, showAlert } from '../utils.js';

// La pauta de Liderazgo (id 1) no es una visita.
const LIDERAZGO_PLANTILLA_ID = 1;
const VISITA_FORMATOS = ['UTP', 'ORIENTACION', 'PIE'];

let _initialized = false;

/**
 * Pautas de visita visibles para el usuario actual.
 * - Admin (rol_id 1): todas las pautas de visita.
 * - Resto: solo las pautas asignadas a su(s) colegio(s).
 */
function filtrarPlantillasVisita(plantillas) {
    let lista = (plantillas || []).filter(p => {
        if (p.id === LIDERAZGO_PLANTILLA_ID) return false;
        const fmt = (p.formato || '').toUpperCase();
        return fmt ? VISITA_FORMATOS.includes(fmt) : (p.id === 2 || p.id === 3);
    });
    const esAdmin = state.currentUser?.rol_id === 1;
    if (!esAdmin) {
        const misColegios = String(state.currentUser?.colegio_id || '')
            .split(',').map(s => s.trim()).filter(s => /^\d+$/.test(s)).map(Number);
        lista = lista.filter(p => p.colegio_id != null && misColegios.includes(p.colegio_id));
    }
    return lista;
}

/**
 * Inicializa el formulario de Subir Visita (carga colegios y pautas).
 */
export async function initSubirVisita() {
    const form = document.getElementById('subirVisitaForm');
    if (!form) return;

    mostrarLoading(true, 'Cargando formulario...');
    try {
        const user = state.currentUser;
        const [colegios, todasPlantillas] = await Promise.all([
            api.colegios.getAll(),
            api.plantillas.getAll()
        ]);

        // Colegios
        const selColegio = document.getElementById('subirVisitaColegio');
        selColegio.innerHTML = '<option value="">Seleccione Colegio</option>' +
            colegios.map(c => `<option value="${c.id}">${c.nombre}</option>`).join('');

        // Si el usuario tiene un único colegio asignado, preseleccionar y bloquear.
        const misColegios = String(user?.colegio_id || '')
            .split(',').map(s => s.trim()).filter(s => /^\d+$/.test(s));
        if (misColegios.length === 1) {
            selColegio.value = misColegios[0];
            selColegio.disabled = true;
            await loadSubirVisitaDocentes(misColegios[0]);
        } else {
            selColegio.disabled = false;
        }

        // Pautas de visita
        const plantillas = filtrarPlantillasVisita(todasPlantillas);
        const selPlantilla = document.getElementById('subirVisitaPlantilla');
        if (!plantillas.length) {
            selPlantilla.innerHTML = '<option value="">Sin pautas asignadas</option>';
            selPlantilla.disabled = true;
        } else {
            selPlantilla.innerHTML = '<option value="">Seleccione Pauta</option>' +
                plantillas.map(p => `<option value="${p.id}">${p.nombre_largo || p.nombre}</option>`).join('');
            selPlantilla.disabled = false;
        }

        // Reset de campos
        document.getElementById('subirVisitaFecha').value = new Date().toISOString().split('T')[0];
        document.getElementById('subirVisitaFechaRetro').value = '';
        const fileInput = document.getElementById('subirVisitaArchivo');
        if (fileInput) fileInput.value = '';
        const nombreEl = document.getElementById('subirVisitaArchivoNombre');
        if (nombreEl) nombreEl.textContent = 'Haz clic para seleccionar el PDF';

        // Registrar el submit una sola vez
        if (!_initialized) {
            form.addEventListener('submit', (e) => {
                e.preventDefault();
                guardarSubirVisita();
            });
            _initialized = true;
        }

        mostrarLoading(false);
    } catch (error) {
        mostrarLoading(false);
        showAlert('Error', `No se pudo cargar el formulario: ${error.message}`, 'error');
    }
}

/**
 * Carga docentes filtrados por colegio.
 */
export async function loadSubirVisitaDocentes(colegioId) {
    const sel = document.getElementById('subirVisitaDocente');
    if (!sel) return;
    if (!colegioId) {
        sel.innerHTML = '<option value="">Seleccione Docente</option>';
        sel.disabled = true;
        return;
    }
    try {
        const docentes = await api.docentes.getAll(colegioId);
        sel.innerHTML = '<option value="">Seleccione Docente</option>' +
            docentes.map(d => `<option value="${d.id}">${d.nombre}</option>`).join('');
        sel.disabled = false;
    } catch (error) {
        console.error('Error cargando docentes:', error);
    }
}

/**
 * Refleja el nombre del archivo elegido en la zona de subida.
 */
export function onSubirVisitaArchivo(input) {
    const nombreEl = document.getElementById('subirVisitaArchivoNombre');
    const file = input.files && input.files[0];
    if (nombreEl) {
        nombreEl.textContent = file ? file.name : 'Haz clic para seleccionar el PDF';
    }
}

/**
 * Envía el formulario (multipart) al backend.
 */
export async function guardarSubirVisita() {
    const docente_id = document.getElementById('subirVisitaDocente').value;
    const plantilla_id = document.getElementById('subirVisitaPlantilla').value;
    const fecha_visita = document.getElementById('subirVisitaFecha').value;
    const fecha_retro = document.getElementById('subirVisitaFechaRetro').value;
    const fileInput = document.getElementById('subirVisitaArchivo');
    const file = fileInput.files && fileInput.files[0];

    if (!docente_id || !plantilla_id || !fecha_visita) {
        showAlert('Atención', 'Docente, pauta y fecha de visita son obligatorios', 'warning');
        return;
    }
    if (!file) {
        showAlert('Atención', 'Debes seleccionar un archivo PDF', 'warning');
        return;
    }
    if (file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf')) {
        showAlert('Atención', 'El archivo debe ser un PDF', 'warning');
        return;
    }
    if (file.size > 25 * 1024 * 1024) {
        showAlert('Atención', 'El PDF supera el máximo de 25 MB', 'warning');
        return;
    }

    const formData = new FormData();
    formData.append('docente_id', docente_id);
    formData.append('plantilla_id', plantilla_id);
    formData.append('fecha_visita', fecha_visita);
    if (fecha_retro) formData.append('fecha_retro', fecha_retro);
    formData.append('archivo', file);

    mostrarLoading(true, 'Subiendo y comprimiendo PDF...');
    try {
        await api.evaluaciones.uploadVisita(formData);
        mostrarLoading(false);
        showAlert('Éxito', 'La visita se registró correctamente (CERRADA).', 'success', () => {
            window.app.navigateTo('visitas-dashboard');
        });
    } catch (error) {
        mostrarLoading(false);
        showAlert('Error', error.message, 'error');
    }
}
