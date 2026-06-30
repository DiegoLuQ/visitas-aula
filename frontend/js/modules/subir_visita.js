import { api } from '../api.js';
import { state } from '../state.js';
import { mostrarLoading, showAlert } from '../utils.js';

// La pauta de Liderazgo (id 1) no es una visita.
const LIDERAZGO_PLANTILLA_ID = 1;
const VISITA_FORMATOS = ['UTP', 'ORIENTACION', 'PIE', 'ESCALA'];

let _initialized = false;

// --- Estado del modo masivo ---
let _bulkInitialized = false;
let _bulkDocentes = [];          // docentes del colegio elegido (para las filas)
let _bulkPlantillas = [];        // pautas de visita visibles
let _bulkFiles = new Map();      // rowId -> File
let _bulkRowCounter = 0;

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
        _bulkPlantillas = plantillas;   // reutilizadas por el modo masivo
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

        // --- Modo masivo: colegio, dropzone y reset ---
        const selMasivaColegio = document.getElementById('subirMasivaColegio');
        if (selMasivaColegio) {
            selMasivaColegio.innerHTML = '<option value="">Seleccione Colegio</option>' +
                colegios.map(c => `<option value="${c.id}">${c.nombre}</option>`).join('');
            if (misColegios.length === 1) {
                selMasivaColegio.value = misColegios[0];
                selMasivaColegio.disabled = true;
                await loadSubirVisitaMasivaColegio(misColegios[0]);
            } else {
                selMasivaColegio.disabled = false;
                _bulkDocentes = [];
            }
        }
        _setupBulkDropzone();
        limpiarSubirMasiva();
        setSubirVisitaModo('individual');

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

/* ============================================================
 * SUBIDA MASIVA: varios PDF, una fila por archivo.
 * Reutiliza el mismo endpoint (/upload-visita) por cada fila.
 * ============================================================ */

const MAX_PDF_BYTES = 25 * 1024 * 1024;

/** Alterna entre los modos "individual" y "masiva". */
export function setSubirVisitaModo(modo) {
    const esMasiva = modo === 'masiva';
    document.getElementById('subirVisitaIndividual')?.classList.toggle('hidden', esMasiva);
    document.getElementById('subirVisitaMasiva')?.classList.toggle('hidden', !esMasiva);

    const tabInd = document.getElementById('tabSubirIndividual');
    const tabMas = document.getElementById('tabSubirMasiva');
    const activa = ['border-indigo-600', 'text-indigo-600'];
    const inactiva = ['border-transparent', 'text-slate-400'];
    if (tabInd && tabMas) {
        tabInd.classList.remove(...activa, ...inactiva);
        tabMas.classList.remove(...activa, ...inactiva);
        tabInd.classList.add(...(esMasiva ? inactiva : activa));
        tabMas.classList.add(...(esMasiva ? activa : inactiva));
    }
}

/** Carga los docentes del colegio elegido y refresca los selects de las filas. */
export async function loadSubirVisitaMasivaColegio(colegioId) {
    if (!colegioId) {
        _bulkDocentes = [];
    } else {
        try {
            _bulkDocentes = await api.docentes.getAll(colegioId);
        } catch (error) {
            console.error('Error cargando docentes (masivo):', error);
            _bulkDocentes = [];
        }
    }
    // Actualizar los selects de docente de las filas que aún no se han subido.
    document.querySelectorAll('select[id^="masivaDocente-"]').forEach(sel => {
        if (sel.disabled) return; // fila ya completada
        const prev = sel.value;
        sel.innerHTML = _docenteOptions();
        sel.value = prev;
    });
}

function _docenteOptions() {
    return '<option value="">Docente</option>' +
        _bulkDocentes.map(d => `<option value="${d.id}">${d.nombre}</option>`).join('');
}

function _plantillaOptions() {
    if (!_bulkPlantillas.length) return '<option value="">Sin pautas</option>';
    return '<option value="">Pauta</option>' +
        _bulkPlantillas.map(p => `<option value="${p.id}">${p.nombre_largo || p.nombre}</option>`).join('');
}

/** Configura el arrastrar-y-soltar de la zona masiva (una sola vez). */
function _setupBulkDropzone() {
    const dz = document.getElementById('subirMasivaDropzone');
    if (!dz || _bulkInitialized) return;

    ['dragenter', 'dragover'].forEach(ev => dz.addEventListener(ev, (e) => {
        e.preventDefault();
        dz.classList.add('border-indigo-400', 'bg-indigo-50');
    }));
    ['dragleave', 'drop'].forEach(ev => dz.addEventListener(ev, (e) => {
        e.preventDefault();
        dz.classList.remove('border-indigo-400', 'bg-indigo-50');
    }));
    dz.addEventListener('drop', (e) => {
        const files = Array.from(e.dataTransfer?.files || []);
        _agregarFilasMasiva(files);
    });

    _bulkInitialized = true;
}

/** Handler del <input type=file multiple>. */
export function onSubirVisitaMasivaArchivos(input) {
    _agregarFilasMasiva(Array.from(input.files || []));
    input.value = ''; // permitir volver a elegir los mismos archivos
}

function _agregarFilasMasiva(files) {
    const pdfs = files.filter(f => f.type === 'application/pdf' || (f.name || '').toLowerCase().endsWith('.pdf'));
    const noPdf = files.length - pdfs.length;
    let tooBig = 0;

    pdfs.forEach(file => {
        if (file.size > MAX_PDF_BYTES) { tooBig++; return; }
        _appendFilaMasiva(file);
    });

    if (noPdf || tooBig) {
        const partes = [];
        if (noPdf) partes.push(`${noPdf} no son PDF`);
        if (tooBig) partes.push(`${tooBig} superan 25 MB`);
        showAlert('Algunos archivos se omitieron', partes.join(' y ') + '.', 'warning');
    }
}

function _appendFilaMasiva(file) {
    const body = document.getElementById('subirMasivaBody');
    if (!body) return;
    document.getElementById('subirMasivaEmpty')?.remove();

    const rowId = ++_bulkRowCounter;
    _bulkFiles.set(rowId, file);

    const hoy = new Date().toISOString().split('T')[0];
    const inputCls = 'w-full bg-slate-50 border-none rounded-xl p-2 text-xs outline-none focus:ring-2 focus:ring-indigo-500/20';

    const tr = document.createElement('tr');
    tr.id = `masivaRow-${rowId}`;
    tr.className = 'border-t border-slate-100 align-top';
    tr.innerHTML = `
        <td class="p-3 max-w-[180px]"><span class="text-xs font-semibold text-slate-600 break-all" title="${file.name}">${file.name}</span></td>
        <td class="p-3"><select id="masivaDocente-${rowId}" class="${inputCls}">${_docenteOptions()}</select></td>
        <td class="p-3"><select id="masivaPlantilla-${rowId}" class="${inputCls}">${_plantillaOptions()}</select></td>
        <td class="p-3"><input type="date" id="masivaFecha-${rowId}" value="${hoy}" class="${inputCls}"></td>
        <td class="p-3"><input type="date" id="masivaRetro-${rowId}" class="${inputCls}"></td>
        <td class="p-3"><span id="masivaEstado-${rowId}" class="text-[11px] font-bold text-slate-400">Pendiente</span></td>
        <td class="p-3 text-right whitespace-nowrap">
            <button type="button" id="masivaBtn-${rowId}" onclick="window.app.subirFilaMasiva(${rowId})" class="bg-indigo-600 text-white px-3 py-2 rounded-xl text-xs font-black hover:bg-indigo-700 transition-all" title="Subir esta visita">
                <i class="fas fa-upload"></i>
            </button>
            <button type="button" id="masivaDel-${rowId}" onclick="window.app.eliminarFilaMasiva(${rowId})" class="text-slate-300 hover:text-red-500 px-2 py-2 transition-all" title="Quitar de la lista">
                <i class="fas fa-times"></i>
            </button>
        </td>`;
    body.appendChild(tr);
}

function _setEstadoFila(rowId, texto, tipo) {
    const el = document.getElementById(`masivaEstado-${rowId}`);
    if (!el) return;
    const colores = { ok: 'text-emerald-600', error: 'text-red-500', pending: 'text-indigo-500', idle: 'text-slate-400' };
    el.className = `text-[11px] font-bold ${colores[tipo] || colores.idle}`;
    el.textContent = texto;
}

/** Sube una sola fila. Devuelve true si quedó registrada. */
export async function subirFilaMasiva(rowId) {
    const file = _bulkFiles.get(rowId);
    if (!file) return false;

    const docente_id = document.getElementById(`masivaDocente-${rowId}`)?.value;
    const plantilla_id = document.getElementById(`masivaPlantilla-${rowId}`)?.value;
    const fecha_visita = document.getElementById(`masivaFecha-${rowId}`)?.value;
    const fecha_retro = document.getElementById(`masivaRetro-${rowId}`)?.value;
    const btn = document.getElementById(`masivaBtn-${rowId}`);

    if (!docente_id || !plantilla_id || !fecha_visita) {
        _setEstadoFila(rowId, 'Faltan datos', 'error');
        return false;
    }

    const formData = new FormData();
    formData.append('docente_id', docente_id);
    formData.append('plantilla_id', plantilla_id);
    formData.append('fecha_visita', fecha_visita);
    if (fecha_retro) formData.append('fecha_retro', fecha_retro);
    formData.append('archivo', file);

    if (btn) btn.disabled = true;
    _setEstadoFila(rowId, 'Subiendo…', 'pending');
    try {
        await api.evaluaciones.uploadVisita(formData);
        _setEstadoFila(rowId, '✓ Subida', 'ok');
        _marcarFilaCompletada(rowId);
        return true;
    } catch (error) {
        _setEstadoFila(rowId, error.message || 'Error', 'error');
        if (btn) btn.disabled = false;
        return false;
    }
}

/** Bloquea los controles de una fila ya subida (no se reintenta en "Subir todas"). */
function _marcarFilaCompletada(rowId) {
    _bulkFiles.delete(rowId);
    const row = document.getElementById(`masivaRow-${rowId}`);
    if (!row) return;
    row.classList.add('bg-emerald-50/40');
    row.querySelectorAll('select, input').forEach(el => { el.disabled = true; });
    const btn = document.getElementById(`masivaBtn-${rowId}`);
    if (btn) {
        btn.disabled = true;
        btn.classList.remove('bg-indigo-600', 'hover:bg-indigo-700');
        btn.classList.add('bg-emerald-500');
        btn.innerHTML = '<i class="fas fa-check"></i>';
    }
}

/** Sube secuencialmente todas las filas pendientes. */
export async function subirTodasMasiva() {
    const pendientes = Array.from(_bulkFiles.keys());
    if (!pendientes.length) {
        showAlert('Atención', 'No hay filas pendientes por subir.', 'warning');
        return;
    }

    const btnTodas = document.getElementById('btnSubirTodasMasiva');
    if (btnTodas) btnTodas.disabled = true;

    let ok = 0, fail = 0;
    for (const rowId of pendientes) {
        const exito = await subirFilaMasiva(rowId);
        exito ? ok++ : fail++;
    }

    if (btnTodas) btnTodas.disabled = false;

    const tipo = fail ? 'warning' : 'success';
    showAlert('Subida masiva finalizada', `${ok} visita(s) registrada(s).` + (fail ? ` ${fail} con error (revisa las filas marcadas).` : ''), tipo);
}

/** Quita una fila de la lista. */
export function eliminarFilaMasiva(rowId) {
    _bulkFiles.delete(rowId);
    document.getElementById(`masivaRow-${rowId}`)?.remove();
    const body = document.getElementById('subirMasivaBody');
    if (body && !body.querySelector('tr')) {
        body.innerHTML = '<tr id="subirMasivaEmpty"><td colspan="7" class="text-center text-slate-400 py-8 text-sm">No has agregado archivos todavía.</td></tr>';
    }
}

/** Vacía la lista masiva por completo. */
export function limpiarSubirMasiva() {
    _bulkFiles.clear();
    const body = document.getElementById('subirMasivaBody');
    if (body) {
        body.innerHTML = '<tr id="subirMasivaEmpty"><td colspan="7" class="text-center text-slate-400 py-8 text-sm">No has agregado archivos todavía.</td></tr>';
    }
}
