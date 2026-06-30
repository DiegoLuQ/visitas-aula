import { api } from '../api.js';
import { state, setState } from '../state.js';
import { mostrarLoading, showAlert, formatFecha, getInterpretacion } from '../utils.js';

let _dashFilterInitialized = false;
let _docentesVisitados = [];
let _visitasModalByDocente = {}; // { docenteId: [visitas de todos los años del colegio] }
let _visitaPlantillas = []; // pautas de visita disponibles para el usuario (filtradas por colegio)
let _currentVisitaPlantilla = null; // pauta actualmente cargada en el formulario
let _currentVisitaEstado = null; // estado de la visita en edición (null = nueva)
let _liderazgoEvalsByDocente = {}; // { docenteId: [evaluaciones de liderazgo] }
let _promLiderazgoByDocente = {}; // { docenteId: { sum, count } } para el badge de Liderazgo

// Badge con el promedio de Liderazgo del docente (usado en tablas de Visitas).
function getLidBadge(docenteId) {
    const data = _promLiderazgoByDocente[docenteId];
    if (data && data.count > 0) {
        const avg = (data.sum / data.count).toFixed(2);
        const score = parseFloat(avg);

        let bgColor = '#eff6ff';
        let textColor = '#1e40af';
        let borderColor = '#bfdbfe';

        if (score < 4.0) {
            bgColor = '#fef2f2'; // Rojo (Insuficiente)
            textColor = '#991b1b';
            borderColor = '#fecaca';
        } else if (score < 5.5) {
            bgColor = '#fffbeb'; // Amarillo (Suficiente/Bueno)
            textColor = '#92400e';
            borderColor = '#fde68a';
        } else {
            bgColor = '#f0fdf4'; // Verde (Excelente)
            textColor = '#166534';
            borderColor = '#bbf7d0';
        }

        return `<span class="badge" title="Promedio Plantilla Liderazgo" style="background: ${bgColor}; color: ${textColor}; font-size: 0.7rem; margin-left: 8px; border: 1px solid ${borderColor}; font-weight: 700;">Lid: ${avg}</span>`;
    }
    return '';
}

// Renderiza la tabla "Docentes Visitados" a partir de una lista [{docente, visitas}].
function renderDocentesVisitados(lista) {
    const tbodyVis = document.getElementById('visitasRealizadasBody');
    if (!tbodyVis) return;
    tbodyVis.innerHTML = (lista && lista.length > 0)
        ? lista.map(dv => {
            const cantVisitas = dv.visitas.length;
            const ultimaFecha = dv.visitas[0].fecha;
            return `
            <tr>
                <td data-label="Docente" style="font-weight:600; color: #334155;">
                    ${dv.docente.nombre}
                    ${getLidBadge(dv.docente.id)}
                </td>
                <td data-label="N° Visitas">
                    <div style="display: flex; align-items: center; gap: 8px;">
                        <span class="badge" style="background: #e0f2fe; color: #0284c7; font-size: 0.8rem; padding: 4px 10px; font-weight: 700;">${cantVisitas}</span>
                        <button class="btn btn-outline-secondary" onclick="window.app.showModalDetalleVisitasDocente(${dv.docente.id})" title="Ver detalles de visitas" style="padding: 3px 6px; font-size: 0.75rem; border-radius: 6px; display: inline-flex; align-items: center; justify-content: center; border-color: #cbd5e1; cursor: pointer; background: #f8fafc; color: #475569; border: 1px solid #cbd5e1; height: 26px;">
                            <svg fill="currentColor" viewBox="0 0 20 20" style="width: 14px; height: 14px;"><path d="M10 12a2 2 0 100-4 2 2 0 000 4z"></path><path fill-rule="evenodd" d="M.458 10C1.732 5.943 5.522 3 10 3s8.268 2.943 9.542 7c-1.274 4.057-5.064 7-9.542 7S1.732 14.057.458 10zM14 10a4 4 0 11-8 0 4 4 0 018 0z" clip-rule="evenodd"></path></svg>
                        </button>
                    </div>
                </td>
                <td data-label="Última" style="color:#475569; font-weight: 500;">${formatFecha(ultimaFecha)}</td>
            </tr>
            `;
        }).join('')
        : '<tr><td colspan="3" class="text-center" style="color:#94a3b8; padding:20px;">No se encontraron docentes con ese criterio</td></tr>';
}

// Filtra la tabla de visitados por nombre del docente (input en el encabezado).
export function filtrarDocentesVisitados(termino) {
    const q = (termino || '').toLowerCase().trim();
    const lista = q
        ? _docentesVisitados.filter(dv => (dv.docente.nombre || '').toLowerCase().includes(q))
        : _docentesVisitados;
    renderDocentesVisitados(lista);
}

// ¿La pauta usa el formato Orientación/Convivencia? (incluye fallback al id 2 legacy)
function esFormatoOrientacion(plantilla) {
    if (!plantilla) return false;
    const f = (plantilla.formato || '').toUpperCase();
    if (f) return f === 'ORIENTACION';
    return plantilla.id == 2; // legacy: plantillas sin formato definido
}

// ¿La pauta usa el formato PIE?
function esFormatoPie(plantilla) {
    if (!plantilla) return false;
    const f = (plantilla.formato || '').toUpperCase();
    return f === 'PIE';
}

// ---------------------------------------------------------------------------
// Escala de puntaje guiada por `config_puntuacion` (no por formato).
// Permite crear nuevas pautas con cualquier escala sin tocar este módulo.
// ---------------------------------------------------------------------------

// Colores permitidos → clases Tailwind LITERALES (no construir dinámicamente:
// el purge de Tailwind elimina clases generadas por interpolación).
const ESCALA_COLOR_CLASSES = {
    slate: 'peer-checked:text-slate-900',
    rose: 'peer-checked:text-rose-600',
    amber: 'peer-checked:text-amber-600',
    emerald: 'peer-checked:text-emerald-600',
    indigo: 'peer-checked:text-indigo-600',
};
const ESCALA_BADGE_CLASSES = {
    slate: { bg: 'bg-slate-100', text: 'text-slate-600' },
    rose: { bg: 'bg-rose-50 border border-rose-100', text: 'text-rose-600' },
    amber: { bg: 'bg-amber-50 border border-amber-100', text: 'text-amber-600' },
    emerald: { bg: 'bg-emerald-50 border border-emerald-100', text: 'text-emerald-600' },
    indigo: { bg: 'bg-indigo-50 border border-indigo-100', text: 'text-indigo-700' },
};
// Escala PIE por defecto (fallback para plantillas PIE legacy sin config_puntuacion).
const PIE_NIVELES_DEFAULT = [
    { valor: 0, nombre: 'N/O', color: 'slate' },
    { valor: 1, nombre: 'Deficiente', color: 'rose' },
    { valor: 2, nombre: 'Básico', color: 'amber' },
    { valor: 3, nombre: 'Competente', color: 'emerald' },
    { valor: 4, nombre: 'Excelente', color: 'indigo' },
];

/**
 * Interpreta `config_puntuacion` y devuelve la escala normalizada.
 * - JSON con `niveles[]`  → escala numérica (PIE, Singapur, etc.).
 * - "observado" / vacío   → escala binaria Observado(1)/No observado(0).
 * - formato PIE sin config → fallback a la escala PIE clásica.
 */
function parseEscala(plantilla) {
    const fmt = (plantilla?.formato || '').toUpperCase();
    const raw = plantilla?.config_puntuacion;
    let cfg = null;
    if (raw && typeof raw === 'string' && raw.trim().startsWith('{')) {
        try { cfg = JSON.parse(raw); } catch { cfg = null; }
    }
    if (cfg && Array.isArray(cfg.niveles) && cfg.niveles.length) {
        return {
            tipo: 'escala',
            niveles: cfg.niveles,
            noObservado: cfg.opcion_no_observado || null,
            textoIndicador: cfg.texto_por_indicador || null,
        };
    }
    if (fmt === 'PIE') {
        return {
            tipo: 'escala',
            niveles: PIE_NIVELES_DEFAULT,
            noObservado: { valor: 0, excluir_del_calculo: true },
            textoIndicador: { mostrar: true, etiqueta: 'Comentarios por indicador' },
        };
    }
    return {
        tipo: 'binaria',
        niveles: [
            { valor: 1, nombre: 'OBSERVADO', color: 'emerald' },
            { valor: 0, nombre: 'NO OBSERVADO', color: 'rose' },
        ],
        noObservado: null,
        textoIndicador: null,
    };
}

// ¿La pauta usa una escala numérica (>2 niveles con promedio)? Incluye PIE.
function esEscalaNumerica(plantilla) {
    return parseEscala(plantilla).tipo === 'escala';
}

// ¿Se debe excluir este valor del cálculo de promedio? (p. ej. "No observado").
function esValorExcluido(esc, val) {
    const no = esc.noObservado;
    if (!no) return false;
    const excluir = no.excluir_del_calculo !== false; // por defecto excluye
    return excluir && val === (no.valor ?? 0);
}

/**
 * Configuración del textarea por indicador (Evidencia / Estrategia / Comentarios).
 * Preserva el comportamiento de ORIENTACION y PIE; lo demás se guía por config.
 */
function getTextoPorIndicador(plantilla) {
    if (esFormatoOrientacion(plantilla)) {
        return { mostrar: true, etiqueta: 'Estrategia a mejorar', placeholder: 'Escriba la estrategia acordada para este indicador...' };
    }
    if (esFormatoPie(plantilla)) {
        return { mostrar: true, etiqueta: 'Comentarios por indicador', placeholder: 'Escriba observaciones o comentarios para este indicador...' };
    }
    const ti = parseEscala(plantilla).textoIndicador;
    if (ti && ti.mostrar) {
        return { mostrar: true, etiqueta: ti.etiqueta || 'Comentarios', placeholder: ti.placeholder || 'Escriba el detalle para este indicador...' };
    }
    return { mostrar: false };
}

// La pauta de Liderazgo (id 1) pertenece al módulo de Liderazgo, no a Visitas.
const LIDERAZGO_PLANTILLA_ID = 1;
// La pauta UTP usa su propio módulo (utp_pauta.js), fijado a este id.
const UTP_PLANTILLA_ID = 3;

/**
 * Devuelve las pautas de visita visibles para el usuario actual.
 * - Admin (rol_id 1): todas las pautas de visita.
 * - Resto: SOLO las pautas asignadas a su(s) colegio(s) (estricto por colegio).
 */
function filtrarPlantillasVisita(plantillas) {
    let lista = (plantillas || []).filter(p => p.id !== LIDERAZGO_PLANTILLA_ID);
    const esAdmin = state.currentUser?.rol_id === 1;
    if (!esAdmin) {
        const misColegios = String(state.currentUser?.colegio_id || '')
            .split(',').map(s => s.trim()).filter(s => /^\d+$/.test(s)).map(Number);
        lista = lista.filter(p => p.colegio_id != null && misColegios.includes(p.colegio_id));
    }
    return lista;
}

/**
 * Carga el Dashboard de Visitas
 */
export async function loadVisitasDashboard() {
    const user = state.currentUser;
    const currentYear = new Date().getFullYear();
    const filterContainer = document.getElementById('visitasDashboardFilter');
    const colegioSelect = document.getElementById('visitaDashColegio');

    // Colegios asignados al usuario (puede ser uno: "1" o varios: "1,2"). Vacío = admin/acceso total.
    const misColegios = String(user?.colegio_id || '')
        .split(',').map(s => s.trim()).filter(s => /^\d+$/.test(s));

    if (filterContainer && !_dashFilterInitialized) {
        filterContainer.style.display = 'block';
        let colegios = await api.colegios.getAll();
        // Roles con colegio(s) asignados solo pueden elegir entre los suyos.
        if (misColegios.length) {
            colegios = colegios.filter(c => misColegios.includes(String(c.id)));
        }
        colegioSelect.innerHTML = '<option value="">-- Seleccione un Establecimiento --</option>' +
            colegios.map(c => `<option value="${c.id}">${c.nombre}</option>`).join('');
        colegioSelect.onchange = () => refreshVisitasDashboard();
        _dashFilterInitialized = true;
    }

    if (colegioSelect) {
        if (misColegios.length === 1) {
            // Un solo colegio: se fija y se bloquea el selector.
            colegioSelect.value = misColegios[0];
            colegioSelect.disabled = true;
        } else {
            // Admin o director multi-colegio: puede elegir el establecimiento.
            colegioSelect.disabled = false;
        }
    }

    const targetColegioId = (misColegios.length === 1)
        ? misColegios[0]
        : (colegioSelect?.value || null);

    if (!targetColegioId) {
        resetDashboardUI('Seleccione un establecimiento para ver los datos');
        return;
    }

    await refreshVisitasDashboardData(targetColegioId, currentYear);
}

async function refreshVisitasDashboard() {
    const user = state.currentUser;
    const currentYear = new Date().getFullYear();
    const colegioSelect = document.getElementById('visitaDashColegio');
    const misColegios = String(user?.colegio_id || '')
        .split(',').map(s => s.trim()).filter(s => /^\d+$/.test(s));
    const targetColegioId = (misColegios.length === 1)
        ? misColegios[0]
        : (colegioSelect?.value || null);

    if (!targetColegioId) {
        resetDashboardUI('Seleccione un establecimiento para ver los datos');
        return;
    }

    await refreshVisitasDashboardData(targetColegioId, currentYear);
}

async function refreshVisitasDashboardData(colegioId, year) {
    try {
        mostrarLoading(true, 'Cargando dashboard...');

        const allDocentes = await api.docentes.getAll();
        const docentes = allDocentes.filter(d => d.colegio_id == parseInt(colegioId));

        const allVisitas = await api.evaluaciones.getAll();
        
        // Calcular promedios de liderazgo del año actual para cada docente
        _promLiderazgoByDocente = {};
        _liderazgoEvalsByDocente = {};
        const liderazgoEvals = allVisitas.filter(v => {
            const matchPlantilla = (v.plantilla_id == 1);
            const matchYear = v.fecha ? new Date(v.fecha).getFullYear() == year : false;
            return matchPlantilla && matchYear;
        });
        liderazgoEvals.forEach(v => {
            if (!_liderazgoEvalsByDocente[v.docente_id]) {
                _liderazgoEvalsByDocente[v.docente_id] = [];
            }
            _liderazgoEvalsByDocente[v.docente_id].push(v);
            if (typeof v.promedio === 'number') {
                if (!_promLiderazgoByDocente[v.docente_id]) {
                    _promLiderazgoByDocente[v.docente_id] = { sum: 0, count: 0 };
                }
                _promLiderazgoByDocente[v.docente_id].sum += v.promedio;
                _promLiderazgoByDocente[v.docente_id].count += 1;
            }
        });

        // Una visita es cualquier pauta con formato de visita (UTP / ORIENTACION / PIE / ESCALA),
        // sin importar su plantilla_id concreto (pueden ser copias por colegio).
        const VISITA_FORMATOS = ['UTP', 'ORIENTACION', 'PIE', 'ESCALA'];
        const esVisita = (v) => {
            const fmt = (v.plantilla_formato || '').toUpperCase();
            if (fmt) return VISITA_FORMATOS.includes(fmt);
            return v.plantilla_id == 2 || v.plantilla_id == 3; // respaldo legacy
        };
        const visitas = allVisitas.filter(v => {
            const matchYear = v.fecha ? new Date(v.fecha).getFullYear() == year : false;
            const matchColegio = v.colegio_id == parseInt(colegioId);
            return esVisita(v) && matchYear && matchColegio;
        });

        // Para el modal de detalle: TODAS las visitas del colegio (todos los años),
        // agrupadas por docente, para poder filtrar por año dentro del modal.
        _visitasModalByDocente = {};
        allVisitas
            .filter(v => esVisita(v) && v.colegio_id == parseInt(colegioId))
            .forEach(v => {
                (_visitasModalByDocente[v.docente_id] = _visitasModalByDocente[v.docente_id] || []).push(v);
            });

        const docentesVisitados = [];
        const docentesPendientes = [];

        docentes.forEach(d => {
            const docenteVisitas = visitas.filter(v => v.docente_id == d.id);
            if (docenteVisitas.length > 0) {
                docenteVisitas.sort((a, b) => new Date(b.fecha) - new Date(a.fecha));
                docentesVisitados.push({ docente: d, visitas: docenteVisitas });
            } else {
                docentesPendientes.push(d);
            }
        });
        _docentesVisitados = docentesVisitados;

        const elRealizadas = document.getElementById('visitasRealizadas');
        const elPendientes = document.getElementById('visitasPendientes');
        const elPromedio = document.getElementById('visitasPromedio');
        const elCobertura = document.getElementById('visitasCobertura');

        if (elRealizadas) elRealizadas.textContent = visitas.length;
        if (elPendientes) elPendientes.textContent = docentesPendientes.length;

        const validPromedios = visitas.filter(v => typeof v.promedio === 'number');
        const promedioGlobal = validPromedios.length > 0
            ? (validPromedios.reduce((sum, v) => sum + v.promedio, 0) / validPromedios.length).toFixed(2)
            : '0.00';
        if (elPromedio) elPromedio.textContent = promedioGlobal;

        const cobertura = docentes.length > 0
            ? Math.round((docentesVisitados.length / docentes.length) * 100)
            : 0;
        if (elCobertura) elCobertura.textContent = `${cobertura}%`;

        // Tabla PENDIENTES
        const tbodyPend = document.getElementById('visitasPendientesBody');
        if (tbodyPend) {
            tbodyPend.innerHTML = docentesPendientes.length > 0
                ? docentesPendientes.map(d => {
                    const hasLid = !!_liderazgoEvalsByDocente[d.id];
                    return `
                    <tr>
                        <td data-label="Docente" style="font-weight:600;">
                            ${d.nombre}
                            ${getLidBadge(d.id)}
                        </td>
                        <td class="actions-cell" style="display:flex; gap:6px;">${hasLid ? `<button class="btn btn-sm" onclick="window.app.verLiderazgoDocente(${d.id})" title="Ver evaluación de Liderazgo" style="padding: 4px 10px; font-size: 0.75rem; border-radius: 8px; background: #eff6ff; color: #1e40af; border: 1px solid #bfdbfe; font-weight: 600; cursor:pointer;"><i class="fas fa-eye" style="margin-right:4px;"></i>Liderazgo</button>` : ''}</td>
                    </tr>
                `}).join('')
                : '<tr><td colspan="2" class="text-center" style="color:#94a3b8; padding:20px;">🎉 Todos los docentes han sido visitados</td></tr>';
        }

        // Tabla VISITADOS
        const inputBuscar = document.getElementById('buscarDocenteVisitado');
        if (inputBuscar) inputBuscar.value = '';
        if (docentesVisitados.length > 0) {
            renderDocentesVisitados(docentesVisitados);
        } else {
            const tbodyVis = document.getElementById('visitasRealizadasBody');
            if (tbodyVis) tbodyVis.innerHTML = '<tr><td colspan="3" class="text-center" style="color:#94a3b8; padding:20px;">Aún no se han realizado visitas este año</td></tr>';
        }

        mostrarLoading(false);
    } catch (error) {
        mostrarLoading(false);
        console.error('Error refreshVisitasDashboardData:', error);
    }
}

function resetDashboardUI(message) {
    ['visitasRealizadas', 'visitasPendientes'].forEach(id => { 
        const el = document.getElementById(id); if (el) el.textContent = '0'; 
    });
    if (document.getElementById('visitasPromedio')) document.getElementById('visitasPromedio').textContent = '0.0';
    if (document.getElementById('visitasCobertura')) document.getElementById('visitasCobertura').textContent = '0%';

    const tbodyPend = document.getElementById('visitasPendientesBody');
    if (tbodyPend) tbodyPend.innerHTML = `<tr><td colspan="2" class="text-center" style="color:#94a3b8; padding:20px;">${message}</td></tr>`;
    const tbodyVis = document.getElementById('visitasRealizadasBody');
    if (tbodyVis) tbodyVis.innerHTML = `<tr><td colspan="3" class="text-center" style="color:#94a3b8; padding:20px;">${message}</td></tr>`;
}

/**
 * Inicializa el Formulario de Visita (Aula/Estándar)
 */
export async function initVisitaForm(docenteId = null, templateId = 2, evaluacionId = null) {
    const container = document.getElementById('visitaFormContainer');
    if (!container) return;

    mostrarLoading(true, 'Cargando formulario...');

    try {
        const [colegios, cursos, asignaturas, todasPlantillas] = await Promise.all([
            api.colegios.getAll(),
            api.cursos.getAll(),
            api.asignaturas.getAll(),
            api.plantillas.getAll()
        ]);

        // Pautas de visita visibles para este usuario (estricto por colegio; admin ve todas)
        _visitaPlantillas = filtrarPlantillasVisita(todasPlantillas);

        if (!_visitaPlantillas.length) {
            mostrarLoading(false);
            container.innerHTML = `<div class="empty-state" style="text-align:center; padding:50px; background:#fff; border-radius:24px; box-shadow:0 4px 15px rgba(0,0,0,0.05);">
                <h3 style="color:#1e293b; margin-bottom:8px;">Sin pautas asignadas</h3>
                <p style="color:#64748b;">No hay pautas de visita asignadas a tu colegio. Solicita al administrador que asigne o copie una pauta para tu establecimiento.</p>
            </div>`;
            return;
        }

        // Resolver la pauta a mostrar: la solicitada si está disponible; si no, la primera de la lista
        let parsedTemplateId = parseInt(templateId);
        if (isNaN(parsedTemplateId) || !_visitaPlantillas.some(p => p.id === parsedTemplateId)) {
            parsedTemplateId = _visitaPlantillas[0].id;
        }

        // Si la pauta usa el formato UTP, delegar a su asistente por pasos
        const metaSel = _visitaPlantillas.find(p => p.id === parsedTemplateId);
        if ((metaSel?.formato || '').toUpperCase() === 'UTP') {
            mostrarLoading(false);
            return window.app.initUtpPauta(evaluacionId, parsedTemplateId);
        }

        const [plantilla, dimensiones] = await Promise.all([
            api.plantillas.get(parsedTemplateId),
            api.plantillas.getDimensiones(parsedTemplateId)
        ]);

        // Combinar para mantener compatibilidad con el resto del código
        plantilla.dimensiones = dimensiones;
        
        let existingData = null;
        if (evaluacionId) {
            existingData = await api.evaluaciones.getById(evaluacionId);
            if (existingData && existingData.estado === 'CERRADA') {
                showAlert('Visita Cerrada', 'Esta visita ya se encuentra CERRADA y no se puede modificar.', 'info');
            }
        }

        // Recordar la pauta actual (para lógica dependiente del formato al guardar)
        _currentVisitaPlantilla = plantilla;
        _currentVisitaEstado = existingData?.estado || null;

        renderVisitaForm(container, colegios, cursos, asignaturas, plantilla, docenteId, existingData);

        if (esFormatoOrientacion(plantilla)) {
            const tbody = document.getElementById('tbodyEstudiantesObservados');
            if (tbody) {
                tbody.innerHTML = '';
                const estList = existingData?.estudiantes_observados || [];
                const count = Math.max(3, estList.length);
                for (let i = 0; i < count; i++) {
                    const est = estList[i];
                    agregarFilaEstudiante(est?.nombre_estudiante || '', est?.conducta_observada || '');
                }
            }
        }
        
        if (existingData) {
            const currentColegioId = existingData.colegio_id || existingData.docente?.colegio_id;
            await loadVisitaDocentes(currentColegioId);
            const docSel = document.getElementById('visitaDocente');
            if (docSel) docSel.value = existingData.docente_id;
            
            existingData.respuestas.forEach(r => {
                const radio = document.querySelector(`input[name="ind_${r.subdimension_id}"][value="${r.valor}"]`);
                if (radio) radio.checked = true;
                const estInput = document.querySelector(`[name="est_${r.subdimension_id}"]`);
                if (estInput) estInput.value = r.estrategia || '';
            });

            // Recalcular badges de puntaje por indicador y promedios (global y por
            // dimensión) tras cargar las respuestas guardadas: marcar los radios por
            // JS no dispara 'change', así que hay que invocarlo explícitamente.
            if (esEscalaNumerica(plantilla)) actualizarPromediosPie();

            if (existingData.comentarios) {
                try {
                    const com = JSON.parse(existingData.comentarios);
                    if (esFormatoPie(plantilla)) {
                        if (document.getElementById('pieObsCoordinadora')) document.getElementById('pieObsCoordinadora').value = com.obs_coordinadora || '';
                        if (document.getElementById('pieObsEspecialista')) document.getElementById('pieObsEspecialista').value = com.obs_especialista || '';
                        if (document.getElementById('pieDestacaCoordinadora')) document.getElementById('pieDestacaCoordinadora').value = com.destaca_coordinadora || '';
                        if (document.getElementById('pieDestacaEspecialista')) document.getElementById('pieDestacaEspecialista').value = com.destaca_especialista || '';
                        if (document.getElementById('pieMejorarCoordinadora')) document.getElementById('pieMejorarCoordinadora').value = com.mejorar_coordinadora || '';
                        if (document.getElementById('pieMejorarEspecialista')) document.getElementById('pieMejorarEspecialista').value = com.mejorar_especialista || '';
                    } else {
                        if (document.getElementById('visitaObservaciones')) document.getElementById('visitaObservaciones').value = com.observaciones || '';
                        if (document.getElementById('visitaRetroalimentacion')) document.getElementById('visitaRetroalimentacion').value = com.retroalimentacion || '';
                    }
                } catch(e) {
                    if (document.getElementById('visitaObservaciones')) document.getElementById('visitaObservaciones').value = existingData.comentarios;
                }
            }
        } else if (docenteId) {
            const docente = await api.docentes.getById(docenteId);
            if (docente) {
                document.getElementById('visitaColegio').value = docente.colegio_id;
                await loadVisitaDocentes(docente.colegio_id);
                document.getElementById('visitaDocente').value = docenteId;
            }
        }

        mostrarLoading(false);
    } catch (error) {
        mostrarLoading(false);
        console.error('DEBUG - initVisitaForm Error:', {
            message: error.message,
            stack: error.stack,
            templateId
        });
        showAlert('Error', `No se pudo cargar el formulario: ${error.message}`, 'error');
    }
}

/**
 * Carga docentes filtrados por colegio para el formulario
 */
export async function loadVisitaDocentes(colegioId) {
    const selDoc = document.getElementById('visitaDocente');
    if (!selDoc) return;
    
    if (!colegioId) {
        selDoc.innerHTML = '<option value="">Seleccione Docente</option>';
        selDoc.disabled = true;
        return;
    }
    
    try {
        const docentes = await api.docentes.getAll(colegioId);
        selDoc.innerHTML = '<option value="">Seleccione Docente</option>' + 
            docentes.map(d => `<option value="${d.id}">${d.nombre}</option>`).join('');
        selDoc.disabled = false;
    } catch (error) {
        console.error('Error cargando docentes:', error);
    }
}

/**
 * Renderiza el HTML del formulario de visita
 */
function renderVisitaForm(container, colegios, cursos, asignaturas, plantilla, docenteId, existingData = null) {
    // Reglas de edición (formato visita):
    // - Datos generales, rúbrica, estrategias, observaciones y estudiantes: solo
    //   editables al CREAR la pauta.
    // - Retroalimentación: editable al crear o en BORRADOR / LISTO_PARA_FIRMA.
    // - CERRADA / FIRMADA_DOCENTE: todo de solo lectura.
    const isCreator = !existingData || existingData.usuario_id === state.currentUser?.id;
    const isNew = !existingData;
    const estadoVisita = existingData?.estado || 'BORRADOR';
    const generalEditable = isCreator && isNew;
    const retroEditable = isCreator && (isNew || ['BORRADOR', 'LISTO_PARA_FIRMA'].includes(estadoVisita));
    const obsEditable = isCreator && (isNew || ((esFormatoOrientacion(plantilla) || esFormatoPie(plantilla)) && ['BORRADOR', 'LISTO_PARA_FIRMA'].includes(estadoVisita)));
    const canSave = retroEditable;
    const disabledAttr = generalEditable ? '' : 'disabled';   // datos generales / rúbrica
    const disabledRetro = retroEditable ? '' : 'disabled';    // solo retroalimentación
    const disabledObs = obsEditable ? '' : 'disabled';        // observaciones
    const readonlyAttr = generalEditable ? '' : 'readonly';
    const readonlyRetro = retroEditable ? '' : 'readonly';
    const readonlyObs = obsEditable ? '' : 'readonly';
    const currentColegioId = existingData?.colegio_id || existingData?.docente?.colegio_id;

    const html = `
        <div class="visita-form-card animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div class="form-header bg-slate-900 text-white p-5 sm:p-6 rounded-t-3xl">
                <div class="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-4">
                    <div class="min-w-0">
                        <div class="flex items-center gap-3 flex-wrap">
                            <h3 class="text-xl sm:text-2xl font-black">${plantilla.nombre}</h3>
                            ${esEscalaNumerica(plantilla) ? `
                                <span id="pie_global_avg_badge" class="bg-indigo-700/50 text-white px-3 py-1 rounded-xl text-xs font-black border border-white/10" style="display: none;">
                                    Promedio Global: -
                                </span>
                            ` : ''}
                        </div>
                        <p class="text-slate-400 text-sm font-medium">${existingData ? `Modificando registro #${existingData.id}` : 'Nueva observación de aula'}</p>
                    </div>
                    <div class="flex items-center gap-4">
                        ${!existingData ? `
                            <div class="flex items-center bg-white/10 rounded-2xl px-4 py-2 gap-3 border border-white/10">
                                <span class="text-[10px] font-black uppercase text-slate-400">Cambiar Pauta:</span>
                                <select onchange="window.app.cambiarTipoPauta(this.value)" class="bg-transparent text-white text-xs font-bold border-none outline-none cursor-pointer">
                                    ${_visitaPlantillas.map(p => `<option value="${p.id}" ${plantilla.id == p.id ? 'selected' : ''} style="color:black">${p.nombre_largo || p.nombre}</option>`).join('')}
                                </select>
                            </div>
                        ` : ''}
                        ${existingData ? '<span class="bg-indigo-600 px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider">Modo Edición</span>' : ''}
                    </div>
                </div>
            </div>

            <form id="visitaMainForm" class="p-5 sm:p-8 bg-white rounded-b-3xl shadow-xl">
                <div class="grid grid-cols-1 md:grid-cols-3 gap-6 mb-10">
                    <div class="form-group">
                        <label class="block text-xs font-bold text-slate-500 uppercase mb-2">Colegio</label>
                        <select id="visitaColegio" class="w-full bg-slate-50 border-none rounded-2xl p-4 text-sm focus:ring-4 focus:ring-indigo-500/10 transition-all outline-none" required onchange="window.app.loadVisitaDocentes(this.value)" ${disabledAttr}>
                            <option value="">Seleccione Colegio</option>
                            ${colegios.map(c => `<option value="${c.id}" ${currentColegioId == c.id ? 'selected' : ''}>${c.nombre}</option>`).join('')}
                        </select>
                    </div>
                    <div class="form-group">
                        <label class="block text-xs font-bold text-slate-500 uppercase mb-2">Docente</label>
                        <select id="visitaDocente" class="w-full bg-slate-50 border-none rounded-2xl p-4 text-sm focus:ring-4 focus:ring-indigo-500/10 transition-all outline-none" required disabled ${disabledAttr}>
                            <option value="">Seleccione Docente</option>
                        </select>
                    </div>
                    <div class="form-group">
                        <label class="block text-xs font-bold text-slate-500 uppercase mb-2">Fecha</label>
                        <input type="date" id="visitaFecha" class="w-full bg-slate-50 border-none rounded-2xl p-4 text-sm focus:ring-4 focus:ring-indigo-500/10 transition-all outline-none" required value="${existingData?.fecha || new Date().toISOString().split('T')[0]}" ${disabledAttr}>
                    </div>
                    <div class="form-group">
                        <label class="block text-xs font-bold text-slate-500 uppercase mb-2">Curso</label>
                        <select id="visitaCurso" class="w-full bg-slate-50 border-none rounded-2xl p-4 text-sm focus:ring-4 focus:ring-indigo-500/10 transition-all outline-none" required ${disabledAttr}>
                            <option value="">Seleccione Curso</option>
                            ${cursos.map(c => `<option value="${c.id}" ${existingData?.curso_id == c.id ? 'selected' : ''}>${c.nivel?.nombre || 'N/A'} ${c.letra}</option>`).join('')}
                        </select>
                    </div>
                    <div class="form-group">
                        <label class="block text-xs font-bold text-slate-500 uppercase mb-2">Asignatura</label>
                        <select id="visitaAsignatura" class="w-full bg-slate-50 border-none rounded-2xl p-4 text-sm focus:ring-4 focus:ring-indigo-500/10 transition-all outline-none" required ${disabledAttr}>
                            <option value="">Seleccione Asignatura</option>
                            ${asignaturas.map(a => `<option value="${a.id}" ${existingData?.asignatura_id == a.id ? 'selected' : ''}>${a.nombre}</option>`).join('')}
                        </select>
                    </div>
                </div>

                <div class="dimensiones-container space-y-10">
                    ${plantilla.dimensiones.map((dim, dIdx) => `
                        <div class="dimension-section">
                            <h4 class="text-indigo-900 font-black text-xl mb-6 flex flex-wrap items-center justify-between gap-3">
                                <span class="flex items-center gap-3">
                                    <span class="bg-indigo-100 text-indigo-600 w-8 h-8 rounded-lg flex items-center justify-center text-sm">${dIdx + 1}</span>
                                    ${dim.nombre}
                                </span>
                                ${esEscalaNumerica(plantilla) ? `
                                    <span id="dim_avg_badge_${dim.id}" class="bg-indigo-50 text-indigo-700 px-3 py-1 rounded-xl text-xs font-black border border-indigo-100" style="display: none;">
                                        Promedio Dimensión: -
                                    </span>
                                ` : ''}
                            </h4>
                            <div class="grid gap-4">
                                ${dim.subdimensiones.map((sub, sIdx) => {
                                    const esc = parseEscala(plantilla);
                                    const isEscala = esc.tipo === 'escala';
                                    const textoInd = getTextoPorIndicador(plantilla);
                                    const leftWidthClass = isEscala ? 'lg:w-2/5' : 'lg:w-3/5';
                                    const rightWidthClass = isEscala ? 'lg:w-3/5' : 'lg:w-2/5';

                                    // Botones de la escala, generados desde config_puntuacion.niveles.
                                    const botonesEscala = isEscala
                                        ? esc.niveles.map(n => `
                                            <label class="relative flex-1 min-w-0 cursor-pointer">
                                                <input type="radio" name="ind_${sub.id}" value="${n.valor}" class="peer sr-only" required ${disabledAttr}>
                                                <div class="px-1 py-2 rounded-xl text-[9px] sm:text-[10px] font-black text-slate-400 uppercase tracking-tighter leading-tight text-center transition-all peer-checked:bg-white ${ESCALA_COLOR_CLASSES[n.color] || 'peer-checked:text-indigo-600'} peer-checked:shadow-md hover:text-indigo-600 flex items-center justify-center">
                                                    ${n.nombre}
                                                </div>
                                            </label>
                                        `).join('')
                                        : esc.niveles.map((n, idx) => `
                                            <label class="relative flex-1 cursor-pointer">
                                                <input type="radio" name="ind_${sub.id}" value="${n.valor}" class="peer sr-only" ${idx === 0 ? 'required' : ''} ${disabledAttr}>
                                                <div class="py-3 rounded-xl text-xs font-bold text-slate-400 peer-checked:bg-white ${ESCALA_COLOR_CLASSES[n.color] || 'peer-checked:text-emerald-600'} peer-checked:shadow-sm transition-all flex items-center justify-center">${n.nombre}</div>
                                            </label>
                                        `).join('');

                                    return `
                                    <div class="bg-white border border-slate-100 rounded-3xl p-6 hover:border-indigo-200 transition-all hover:shadow-lg hover:shadow-indigo-500/5">
                                        <div class="flex flex-col lg:flex-row lg:items-center gap-6">
                                            <div class="${leftWidthClass}">
                                                <p class="text-slate-700 font-semibold text-base leading-snug">${sub.descripcion}</p>
                                                ${isEscala ? `
                                                    <div class="mt-2">
                                                        <span id="badge_score_${sub.id}" class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold bg-slate-100 text-slate-400" style="display: none;">
                                                            Sin evaluar
                                                        </span>
                                                    </div>
                                                ` : ''}
                                            </div>
                                            <div class="${rightWidthClass} flex p-1 bg-slate-50 rounded-2xl w-full">
                                                ${botonesEscala}
                                            </div>
                                        </div>
                                        ${textoInd.mostrar ? `
                                        <div class="mt-4 border-t border-slate-100 pt-4">
                                            <label class="block text-[10px] font-black text-slate-400 uppercase tracking-wider mb-2">${textoInd.etiqueta}</label>
                                            <textarea name="est_${sub.id}" class="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 text-sm focus:ring-4 focus:ring-indigo-500/10 transition-all outline-none min-h-[60px]" placeholder="${textoInd.placeholder}" ${readonlyAttr}></textarea>
                                        </div>
                                        ` : ''}
                                    </div>
                                    `;
                                }).join('')}
                            </div>
                        </div>
                    `).join('')}
                </div>

                ${esFormatoOrientacion(plantilla) ? `
                <div class="mt-12 pt-10 border-t border-slate-100">
                    <h4 class="text-xl font-black text-slate-900 mb-6 flex items-center gap-3">
                        <i class="fas fa-users-slash text-indigo-600"></i>
                        Seguimiento y observaciones de estudiantes disruptivos o que alteren el clima de convivencia en el aula
                    </h4>
                    <div class="bg-white border border-slate-100 rounded-3xl p-6 shadow-sm overflow-x-auto">
                        <table class="w-full text-sm text-left border-collapse" id="tblEstudiantesObservados">
                            <thead>
                                <tr class="bg-slate-100 border-b border-slate-200">
                                    <th class="p-3 text-[10px] font-black uppercase text-slate-500 w-12 text-center">#</th>
                                    <th class="p-3 text-[10px] font-black uppercase text-slate-500 w-1/3">Nombre del estudiante</th>
                                    <th class="p-3 text-[10px] font-black uppercase text-slate-500 w-7/12">Conducta y detalles observados</th>
                                    ${generalEditable ? `<th class="p-3 text-[10px] font-black uppercase text-slate-500 w-16 text-center">Acción</th>` : ''}
                                </tr>
                            </thead>
                            <tbody id="tbodyEstudiantesObservados">
                                <!-- Filas dinámicas -->
                            </tbody>
                        </table>
                        ${generalEditable ? `
                            <div class="mt-4 flex justify-start">
                                <button type="button" onclick="window.app.agregarFilaEstudiante()" class="bg-slate-100 hover:bg-slate-200 text-slate-700 px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2">
                                    <i class="fas fa-plus"></i> Agregar otra fila
                                </button>
                            </div>
                        ` : ''}
                    </div>
                </div>
                ` : ''}

                ${esFormatoPie(plantilla) ? `
                <div class="mt-12 pt-10 border-t border-slate-100">
                    <h4 class="text-2xl font-black text-indigo-900 mb-8 flex items-center gap-3">
                        <span class="bg-indigo-100 text-indigo-600 w-10 h-10 rounded-xl flex items-center justify-center text-lg"><i class="fas fa-comment-dots"></i></span>
                        Retroalimentación
                    </h4>
                    <div class="space-y-8 bg-slate-50 p-6 rounded-3xl border border-slate-100">
                        <div>
                            <h4 class="text-xl font-black text-slate-900 mb-6 flex items-center gap-3">
                                <i class="fas fa-search text-indigo-600"></i>
                                IV. Observaciones
                            </h4>
                            <div class="grid grid-cols-1 md:grid-cols-2 gap-8">
                                <div class="form-group">
                                    <label class="block text-xs font-bold text-slate-500 uppercase mb-3">Comentarios de Coordinadora PIE</label>
                                    <textarea id="pieObsCoordinadora" class="w-full bg-white border border-slate-200 rounded-3xl p-5 text-sm focus:ring-4 focus:ring-indigo-500/10 transition-all outline-none min-h-[120px]" placeholder="Escriba comentarios..." ${readonlyObs}></textarea>
                                </div>
                                <div class="form-group">
                                    <label class="block text-xs font-bold text-slate-500 uppercase mb-3">Comentarios de Especialista PIE</label>
                                    <textarea id="pieObsEspecialista" class="w-full bg-white border border-slate-200 rounded-3xl p-5 text-sm focus:ring-4 focus:ring-indigo-500/10 transition-all outline-none min-h-[120px]" placeholder="Escriba comentarios..." ${readonlyObs}></textarea>
                                </div>
                            </div>
                        </div>
                        <div>
                            <h4 class="text-xl font-black text-slate-900 mb-6 flex items-center gap-3">
                                <i class="fas fa-star text-indigo-600"></i>
                                V. ¿Qué se destaca de la experiencia observada?
                            </h4>
                            <div class="grid grid-cols-1 md:grid-cols-2 gap-8">
                                <div class="form-group">
                                    <label class="block text-xs font-bold text-slate-500 uppercase mb-3">Comentarios de Coordinadora PIE</label>
                                    <textarea id="pieDestacaCoordinadora" class="w-full bg-white border border-slate-200 rounded-3xl p-5 text-sm focus:ring-4 focus:ring-indigo-500/10 transition-all outline-none min-h-[120px]" placeholder="Escriba comentarios..." ${readonlyRetro}></textarea>
                                </div>
                                <div class="form-group">
                                    <label class="block text-xs font-bold text-slate-500 uppercase mb-3">Comentarios de Especialista PIE</label>
                                    <textarea id="pieDestacaEspecialista" class="w-full bg-white border border-slate-200 rounded-3xl p-5 text-sm focus:ring-4 focus:ring-indigo-500/10 transition-all outline-none min-h-[120px]" placeholder="Escriba comentarios..." ${readonlyRetro}></textarea>
                                </div>
                            </div>
                        </div>
                        <div>
                            <h4 class="text-xl font-black text-slate-900 mb-6 flex items-center gap-3">
                                <i class="fas fa-arrow-trend-up text-indigo-600"></i>
                                VI. ¿Qué se podría mejorar de lo observado?
                            </h4>
                            <div class="grid grid-cols-1 md:grid-cols-2 gap-8">
                                <div class="form-group">
                                    <label class="block text-xs font-bold text-slate-500 uppercase mb-3">Comentarios de Coordinadora PIE</label>
                                    <textarea id="pieMejorarCoordinadora" class="w-full bg-white border border-slate-200 rounded-3xl p-5 text-sm focus:ring-4 focus:ring-indigo-500/10 transition-all outline-none min-h-[120px]" placeholder="Escriba comentarios..." ${readonlyRetro}></textarea>
                                </div>
                                <div class="form-group">
                                    <label class="block text-xs font-bold text-slate-500 uppercase mb-3">Comentarios de Especialista PIE</label>
                                    <textarea id="pieMejorarEspecialista" class="w-full bg-white border border-slate-200 rounded-3xl p-5 text-sm focus:ring-4 focus:ring-indigo-500/10 transition-all outline-none min-h-[120px]" placeholder="Escriba comentarios..." ${readonlyRetro}></textarea>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
                ` : `
                <div class="mt-12 pt-10 border-t border-slate-100">
                    <h4 class="text-xl font-black text-slate-900 mb-6 flex items-center gap-3">
                        <i class="fas fa-comment-alt text-indigo-600"></i>
                        V. Observaciones y Retroalimentación
                    </h4>
                    <div class="grid grid-cols-1 md:grid-cols-2 gap-8">
                        <div class="form-group">
                            <label class="block text-xs font-bold text-slate-500 uppercase mb-3">Observaciones (Opcional)</label>
                            <textarea id="visitaObservaciones" class="w-full bg-slate-50 border-none rounded-3xl p-5 text-sm focus:ring-4 focus:ring-indigo-500/10 transition-all outline-none min-h-[120px]" placeholder="Escriba las observaciones clave..." ${readonlyObs}></textarea>
                        </div>
                        <div class="form-group">
                            <label class="block text-xs font-bold text-slate-500 uppercase mb-3">Retroalimentación (Opcional)</label>
                            <textarea id="visitaRetroalimentacion" class="w-full bg-slate-50 border-none rounded-3xl p-5 text-sm focus:ring-4 focus:ring-indigo-500/10 transition-all outline-none min-h-[120px]" placeholder="Sugerencias y acuerdos..." ${readonlyRetro}></textarea>
                        </div>
                    </div>
                </div>
                `}

                <div class="mt-10 sm:mt-12 flex flex-wrap justify-between items-center gap-4 bg-slate-50 p-4 sm:p-6 rounded-3xl">
                    <button type="button" class="text-slate-400 font-bold hover:text-slate-600 transition-colors" onclick="app.navigateTo('visitas-dashboard')">DESCARTAR</button>
                    ${canSave ? `
                        <button type="submit" class="bg-indigo-600 text-white px-10 py-4 rounded-2xl font-black shadow-xl shadow-indigo-600/20 hover:bg-indigo-700 transition-all transform hover:-translate-y-1">
                            ${existingData ? 'ACTUALIZAR REGISTRO' : 'GUARDAR VISITA'}
                        </button>
                    ` : `
                        <span class="text-rose-500 font-black text-xs uppercase tracking-wider bg-rose-50 px-4 py-2 rounded-xl border border-rose-100">
                            ${!isCreator ? 'Solo Lectura (No eres el creador)' : 'Visita Cerrada (No se puede modificar)'}
                        </span>
                    `}
                </div>

                <!-- Ir al Historial de Visitas a Aula -->
                <div class="mt-6 flex justify-center">
                    <button type="button" onclick="app.navigateTo('visitas-historial')" class="inline-flex items-center gap-2 text-indigo-600 font-bold text-sm px-6 py-3 rounded-2xl border border-indigo-200 hover:bg-indigo-50 transition-all">
                        <i class="fas fa-clock-rotate-left"></i>
                        Historial de Visitas a Aula
                    </button>
                </div>
            </form>
        </div>
    `;

    container.innerHTML = html;
    document.getElementById('visitaMainForm').onsubmit = (e) => {
        e.preventDefault();
        window.app.guardarVisita(plantilla.id, existingData?.id);
    };

    if (esEscalaNumerica(plantilla)) {
        setTimeout(() => {
            window.app.actualizarPromediosPie();
            const formEl = document.getElementById('visitaMainForm');
            if (formEl) {
                formEl.addEventListener('change', (e) => {
                    if (e.target.type === 'radio' && e.target.name.startsWith('ind_')) {
                        window.app.actualizarPromediosPie();
                    }
                });
            }
        }, 50);
    }
}

/**
 * Calcula y muestra los promedios e interpretaciones de las pautas con escala
 * numérica (PIE y cualquier pauta cuya `config_puntuacion` defina niveles) en
 * tiempo real. Los niveles marcados como "No observado" se excluyen del promedio.
 */
export function actualizarPromediosPie() {
    if (!_currentVisitaPlantilla || !esEscalaNumerica(_currentVisitaPlantilla)) return;

    const esc = parseEscala(_currentVisitaPlantilla);
    // Mapa valor → etiqueta/colores del badge, derivado de la escala configurada.
    const NIVELES = {};
    esc.niveles.forEach(n => {
        const c = ESCALA_BADGE_CLASSES[n.color] || { bg: 'bg-slate-100', text: 'text-slate-800' };
        NIVELES[n.valor] = { texto: n.nombre, bg: c.bg, text: c.text };
    });

    let globalSum = 0;
    let globalCount = 0;

    _currentVisitaPlantilla.dimensiones.forEach((dim) => {
        let dimSum = 0;
        let dimCount = 0;

        dim.subdimensiones.forEach(sub => {
            const radio = document.querySelector(`input[name="ind_${sub.id}"]:checked`);
            const val = radio ? parseInt(radio.value) : null;
            const badge = document.getElementById(`badge_score_${sub.id}`);
            
            if (badge) {
                badge.style.display = 'inline-flex';
                if (val !== null) {
                    const info = NIVELES[val] || { texto: `Puntaje: ${val}`, bg: 'bg-slate-100', text: 'text-slate-800' };
                    badge.textContent = `${info.texto} (${val})`;
                    badge.className = `inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold ${info.bg} ${info.text}`;
                } else {
                    badge.textContent = 'Sin evaluar';
                    badge.className = 'inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold bg-slate-100 text-slate-400';
                }
            }

            if (val !== null && !esValorExcluido(esc, val)) {
                dimSum += val;
                dimCount++;
            }
        });

        const dimBadge = document.getElementById(`dim_avg_badge_${dim.id}`);
        if (dimBadge) {
            dimBadge.style.display = 'inline-block';
            if (dimCount > 0) {
                const dimAvg = dimSum / dimCount;
                dimBadge.textContent = `Promedio Dimensión: ${dimAvg.toFixed(2)}`;
                dimBadge.className = 'bg-indigo-50 text-indigo-700 px-3 py-1 rounded-xl text-xs font-black border border-indigo-100';
                globalSum += dimAvg;
                globalCount++;
            } else {
                dimBadge.textContent = 'Promedio Dimensión: N/A';
                dimBadge.className = 'bg-slate-50 text-slate-400 px-3 py-1 rounded-xl text-xs font-black border border-slate-200';
            }
        }
    });

    const globalBadge = document.getElementById('pie_global_avg_badge');
    if (globalBadge) {
        if (globalCount > 0) {
            const globalAvg = globalSum / globalCount;
            globalBadge.style.display = 'inline-block';
            globalBadge.textContent = `Promedio Global: ${globalAvg.toFixed(2)}`;
        } else {
            globalBadge.style.display = 'none';
        }
    }
}

/**
 * Guarda o Actualiza una Visita de Aula
 */
export async function guardarVisita(plantillaId, evaluacionId = null) {
    try {
        // Una visita ya firmada/cerrada es de solo lectura total: no se re-guarda.
        if (evaluacionId && ['FIRMADA_DOCENTE', 'CERRADA'].includes(_currentVisitaEstado)) {
            showAlert('Visita cerrada', 'Esta visita ya fue cerrada y no puede modificarse.', 'info');
            return;
        }

        const docente_id = parseInt(document.getElementById('visitaDocente').value);
        const colegio_id = parseInt(document.getElementById('visitaColegio').value);
        const curso_id = parseInt(document.getElementById('visitaCurso').value);
        const asignatura_id = parseInt(document.getElementById('visitaAsignatura').value);
        const fecha = document.getElementById('visitaFecha').value;

        if (isNaN(docente_id) || isNaN(colegio_id) || isNaN(curso_id) || isNaN(asignatura_id) || !fecha) {
            showAlert('Atención', 'Todos los campos de encabezado son obligatorios', 'warning');
            return;
        }

        const respuestasMap = {};
        document.querySelectorAll('input[type="radio"]:checked').forEach(r => {
            const subId = r.name.replace('ind_', '');
            respuestasMap[subId] = parseInt(r.value);
        });

        const respuestas = Object.entries(respuestasMap).map(([id, val]) => {
            const estInput = document.querySelector(`[name="est_${id}"]`);
            return {
                subdimension_id: parseInt(id),
                valor: val,
                estrategia: estInput ? estInput.value : null
            };
        });

        let comentarios;
        let extraPayload = {};

        // Promedios para cualquier pauta con escala numérica (PIE, Singapur, etc.),
        // excluyendo los niveles marcados como "No observado" en config_puntuacion.
        if (esEscalaNumerica(_currentVisitaPlantilla)) {
            const esc = parseEscala(_currentVisitaPlantilla);
            let globalSum = 0;
            let globalCount = 0;
            const dimAverages = {};

            _currentVisitaPlantilla.dimensiones.forEach((dim, idx) => {
                let dimSum = 0;
                let dimCount = 0;
                dim.subdimensiones.forEach(sub => {
                    const val = respuestasMap[sub.id];
                    if (val !== undefined && !esValorExcluido(esc, val)) {
                        dimSum += val;
                        dimCount++;
                    }
                });
                const avg = dimCount > 0 ? parseFloat((dimSum / dimCount).toFixed(2)) : 0;
                dimAverages[`promedio_dim${idx + 1}`] = avg;
                if (dimCount > 0) {
                    globalSum += avg;
                    globalCount++;
                }
            });

            const globalAvg = globalCount > 0 ? parseFloat((globalSum / globalCount).toFixed(2)) : 0;
            extraPayload = {
                ...dimAverages,
                promedio: globalAvg
            };
        }

        if (esFormatoPie(_currentVisitaPlantilla)) {
            comentarios = JSON.stringify({
                obs_coordinadora: document.getElementById('pieObsCoordinadora')?.value || '',
                obs_especialista: document.getElementById('pieObsEspecialista')?.value || '',
                destaca_coordinadora: document.getElementById('pieDestacaCoordinadora')?.value || '',
                destaca_especialista: document.getElementById('pieDestacaEspecialista')?.value || '',
                mejorar_coordinadora: document.getElementById('pieMejorarCoordinadora')?.value || '',
                mejorar_especialista: document.getElementById('pieMejorarEspecialista')?.value || ''
            });
        } else {
            comentarios = JSON.stringify({
                observaciones: document.getElementById('visitaObservaciones')?.value || '',
                retroalimentacion: document.getElementById('visitaRetroalimentacion')?.value || ''
            });
        }

        // Estudiantes observados (solo en pautas con formato Orientación/Convivencia)
        const estudiantes_observados = [];
        if (esFormatoOrientacion(_currentVisitaPlantilla)) {
            const rows = document.querySelectorAll('#tbodyEstudiantesObservados tr.row-estudiante');
            rows.forEach(row => {
                const nameInput = row.querySelector('.est-nombre');
                const condInput = row.querySelector('.est-conducta');
                const name = nameInput ? nameInput.value.trim() : '';
                const cond = condInput ? condInput.value.trim() : '';
                if (name || cond) {
                    estudiantes_observados.push({
                        nombre_estudiante: name,
                        conducta_observada: cond
                    });
                }
            });
        }

        const payload = {
            plantilla_id: plantillaId,
            docente_id,
            colegio_id,
            curso_id,
            asignatura_id,
            fecha,
            respuestas,
            comentarios,
            // En creación nace en BORRADOR. Al actualizar se PRESERVA el estado actual
            // (editar la retroalimentación no debe revertir LISTO_PARA_FIRMA a BORRADOR).
            // El cambio a CERRADA ocurre solo al firmar con token (Finalizar con Firma).
            estado: evaluacionId ? (_currentVisitaEstado || 'BORRADOR') : 'BORRADOR',
            estudiantes_observados,
            ...extraPayload
        };

        mostrarLoading(true, evaluacionId ? 'Actualizando visita...' : 'Guardando visita...');
        
        if (evaluacionId) {
            await api.evaluaciones.update(evaluacionId, payload);
        } else {
            await api.evaluaciones.create(payload);
        }
        
        mostrarLoading(false);
        showAlert('Éxito', 'La visita ha sido registrada correctamente', 'success', () => {
            window.app.navigateTo('visitas-dashboard');
        });
    } catch (error) {
        mostrarLoading(false);
        showAlert('Error', error.message, 'error');
    }
}

export async function cambiarTipoPauta(tipoId) {
    const id = parseInt(tipoId);
    if (!_visitaPlantillas || _visitaPlantillas.length === 0) {
        try {
            const todasPlantillas = await api.plantillas.getAll();
            _visitaPlantillas = filtrarPlantillasVisita(todasPlantillas);
        } catch (e) {
            console.error('Error fetching plantillas in cambiarTipoPauta:', e);
        }
    }
    const p = _visitaPlantillas.find(x => x.id === id);
    const formato = (p?.formato || '').toUpperCase();
    // El formato UTP usa su propio módulo (estructura por pasos)
    if (formato === 'UTP' || (!formato && id === UTP_PLANTILLA_ID)) {
        window.app.initUtpPauta(null, id);
    } else {
        window.app.initVisitaForm(null, id);
    }
}

/**
 * Redirige a crear una nueva visita para un docente específico
 */
export function nuevaVisitaDocente(docenteId) {
    window.app.navigateTo('visitas-nueva');
    setTimeout(() => initVisitaForm(docenteId), 100);
}

/**
 * Muestra el modal con los detalles de visitas realizadas a un docente.
 * Incluye un switch para alternar entre visitas CERRADAS y ABIERTAS
 * (BORRADOR / LISTO_PARA_FIRMA).
 */
const ESTADOS_ABIERTOS = ['BORRADOR', 'LISTO_PARA_FIRMA'];
const ANIO_MIN = 2026;
const ANIO_MAX = 2035;
let _detalleState = { docenteId: null, filtro: 'cerradas', anio: new Date().getFullYear() };

const ESTADO_LABEL = { BORRADOR: 'Borrador', LISTO_PARA_FIRMA: 'Listo para firma', FIRMADA_DOCENTE: 'Firmada', CERRADA: 'Cerrada' };

function _nombreDocente(docenteId) {
    const entry = _docentesVisitados.find(dv => dv.docente.id === docenteId);
    if (entry) return entry.docente.nombre;
    const v = (_visitasModalByDocente[docenteId] || [])[0];
    return v?.docente_nombre || 'Docente';
}

export function showModalDetalleVisitasDocente(docenteId) {
    const anioActual = new Date().getFullYear();
    _detalleState = {
        docenteId,
        filtro: 'cerradas',
        // Año actual si está dentro del rango del select; si no, el más cercano.
        anio: Math.min(Math.max(anioActual, ANIO_MIN), ANIO_MAX),
    };

    const titleEl = document.getElementById('modalTitle');
    if (titleEl) titleEl.textContent = `Visitas - ${_nombreDocente(docenteId)}`;
    renderDetalleVisitas();
    const overlay = document.getElementById('modalOverlay');
    overlay.querySelector('.modal')?.classList.add('modal-wide'); // más ancho en desktop
    overlay.classList.add('active');
}

export function setVisitaDetalleFiltro(filtro) {
    _detalleState.filtro = filtro;
    renderDetalleVisitas();
}

export function setVisitaDetalleAnio(anio) {
    _detalleState.anio = parseInt(anio);
    renderDetalleVisitas();
}

function renderDetalleVisitas() {
    const bodyEl = document.getElementById('modalBody');
    if (!bodyEl) return;

    const todas = _visitasModalByDocente[_detalleState.docenteId] || [];
    const delAnio = todas.filter(v => v.fecha && new Date(v.fecha).getFullYear() === _detalleState.anio);
    const cerradas = delAnio.filter(v => v.estado === 'CERRADA');
    const abiertas = delAnio.filter(v => ESTADOS_ABIERTOS.includes(v.estado));
    const verAbiertas = _detalleState.filtro === 'abiertas';
    const lista = verAbiertas ? abiertas : cerradas;

    let yearOptions = '';
    for (let y = ANIO_MIN; y <= ANIO_MAX; y++) {
        yearOptions += `<option value="${y}" ${y === _detalleState.anio ? 'selected' : ''}>${y}</option>`;
    }

    const pill = (activo) => activo
        ? 'background:#0284c7; color:#fff; border:1px solid #0284c7;'
        : 'background:#fff; color:#475569; border:1px solid #cbd5e1;';

    let rows = '';
    if (lista.length === 0) {
        rows = `<tr><td colspan="4" class="text-center" style="color:#94a3b8; padding:20px;">
            No hay visitas ${verAbiertas ? 'abiertas (borrador / listo para firma)' : 'cerradas'} en ${_detalleState.anio}
        </td></tr>`;
    } else {
        lista.forEach(v => {
            const pName = v.plantilla_nombre || ((v.plantilla_formato || '').toUpperCase() === 'UTP' ? 'Acompañamiento UTP' : 'Acompañamiento Directivo');
            const obsName = v.observador_nombre || 'N/A';
            let accion;
            if (verAbiertas) {
                accion = `<span class="badge" style="background:#fef3c7; color:#92400e; padding:4px 10px; border-radius:8px; font-size:0.72rem; font-weight:700;">${ESTADO_LABEL[v.estado] || v.estado}</span>`;
            } else if (v.tiene_pdf) {
                // Visita histórica subida como PDF: visor + descarga.
                const tituloPdf = `Visita ${_nombreDocente(_detalleState.docenteId)} · ${formatFecha(v.fecha)}`.replace(/'/g, "\\'");
                accion = `
                    <button class="btn btn-primary btn-sm" onclick="window.app.openPdfViewer(${v.id}, '${tituloPdf}')" style="padding: 4px 10px; font-size: 0.75rem; border-radius: 6px;"><i class="fas fa-file-pdf"></i> Ver PDF</button>
                    <button class="btn btn-sm" onclick="window.app.descargarPdfVisita(${v.id}, 'visita_${v.id}.pdf')" title="Descargar PDF" style="padding: 4px 8px; font-size: 0.75rem; border-radius: 6px; background:#0ea5e9; color:#fff; margin-left:4px;"><i class="fas fa-download"></i></button>`;
            } else {
                accion = `<button class="btn btn-primary btn-sm" onclick="window.app.closeModal(); window.app.verDetalleVisita(${v.id}, ${v.plantilla_id}, '${pName.replace(/'/g, "\\'")}', '${(v.plantilla_slug || '').replace(/'/g, "\\'")}')" style="padding: 4px 10px; font-size: 0.75rem; border-radius: 6px;">Ver Visita</button>`;
            }
            rows += `
                <tr style="border-bottom: 1px solid #f1f5f9;">
                    <td style="padding: 10px; color: #334155; font-weight: 500; white-space: nowrap;">${formatFecha(v.fecha)}</td>
                    <td style="padding: 10px; color: #475569;">${obsName}</td>
                    <td style="padding: 10px; color: #64748b; font-size: 0.85rem;">${pName}</td>
                    <td style="padding: 10px; text-align: center;">${accion}</td>
                </tr>`;
        });
    }

    // Altura fija al 60% del viewport, con scroll vertical interno y responsive.
    bodyEl.innerHTML = `
        <div style="display:flex; flex-direction:column; height:60vh; max-height:60vh;">
            <div style="flex:0 0 auto; display:flex; flex-wrap:wrap; gap:12px; align-items:center; justify-content:space-between; margin-bottom:14px;">
                <div style="display:flex; align-items:center; gap:8px;">
                    <label style="font-size:0.8rem; font-weight:700; color:#475569; text-transform:uppercase; letter-spacing:0.03em;">Año</label>
                    <select onchange="window.app.setVisitaDetalleAnio(this.value)" class="form-control" style="width:auto; padding:6px 12px; font-size:0.85rem; font-weight:600;">${yearOptions}</select>
                </div>
                <div style="display:flex; gap:8px;">
                    <button onclick="window.app.setVisitaDetalleFiltro('cerradas')" style="${pill(!verAbiertas)} padding:6px 14px; border-radius:999px; font-size:0.8rem; font-weight:700; cursor:pointer;">
                        Cerradas (${cerradas.length})
                    </button>
                    <button onclick="window.app.setVisitaDetalleFiltro('abiertas')" style="${pill(verAbiertas)} padding:6px 14px; border-radius:999px; font-size:0.8rem; font-weight:700; cursor:pointer;">
                        Abiertas (${abiertas.length})
                    </button>
                </div>
            </div>

            <div style="flex:1 1 auto; min-height:0; overflow-y:auto; overflow-x:auto; border:1px solid #f1f5f9; border-radius:10px;">
                <table style="width:100%; min-width:520px; border-collapse:collapse; font-size:0.9rem; text-align:left;">
                    <thead style="position:sticky; top:0; z-index:1; background:#fff;">
                        <tr style="border-bottom: 2px solid #e2e8f0;">
                            <th style="padding: 10px; font-weight: 700; color: #475569; background:#fff;">Fecha</th>
                            <th style="padding: 10px; font-weight: 700; color: #475569; background:#fff;">Quién la realizó</th>
                            <th style="padding: 10px; font-weight: 700; color: #475569; background:#fff;">Tipo</th>
                            <th style="padding: 10px; font-weight: 700; color: #475569; text-align: center; background:#fff;">${verAbiertas ? 'Estado' : 'Acción'}</th>
                        </tr>
                    </thead>
                    <tbody>${rows}</tbody>
                </table>
            </div>

            <div style="flex:0 0 auto; margin-top: 16px; display: flex; justify-content: flex-end;">
                <button class="btn btn-secondary" onclick="window.app.closeModal()">Cerrar</button>
            </div>
        </div>`;
}

/**
 * Muestra un modal de solo lectura con la(s) evaluación(es) de Liderazgo de un docente
 */
export async function verLiderazgoDocente(docenteId) {
    const evals = _liderazgoEvalsByDocente[docenteId];
    if (!evals || evals.length === 0) {
        showAlert('Sin datos', 'No se encontraron evaluaciones de Liderazgo para este docente en el año actual.', 'info');
        return;
    }

    // Ordenar por fecha descendente y tomar la más reciente
    const sorted = [...evals].sort((a, b) => new Date(b.fecha) - new Date(a.fecha));
    const latest = sorted[0];

    mostrarLoading(true, 'Cargando evaluación de Liderazgo...');

    try {
        // Obtener detalles completos de la evaluación (con respuestas)
        const evalData = await api.evaluaciones.getById(latest.id);
        // Obtener dimensiones de la plantilla de Liderazgo
        const dimensiones = await api.plantillas.getDimensiones(1);

        mostrarLoading(false);

        const docenteNombre = evalData.docente?.nombre || 'Docente';
        const colegioNombre = evalData.docente?.colegio?.nombre || 'N/A';

        // Mapear respuestas por subdimension_id
        const respMap = {};
        (evalData.respuestas || []).forEach(r => {
            respMap[r.subdimension_id] = r.valor;
        });

        // Construir HTML de dimensiones e indicadores
        let dimensionesHtml = '';
        dimensiones.forEach(dim => {
            const subs = dim.subdimensiones || [];
            const vals = subs.map(s => respMap[s.id]).filter(v => typeof v === 'number');
            const dimAvg = vals.length > 0 ? (vals.reduce((a, b) => a + b, 0) / vals.length).toFixed(2) : 'N/A';
            
            let subsHtml = subs.map(sub => {
                const val = respMap[sub.id];
                const valText = val != null ? val : '—';
                let valColor = '#64748b';
                if (val != null) {
                    if (val >= 6) valColor = '#16a34a';
                    else if (val >= 4) valColor = '#d97706';
                    else valColor = '#dc2626';
                }
                return `
                    <div style="display: flex; justify-content: space-between; align-items: center; padding: 8px 12px; border-bottom: 1px solid #f1f5f9;">
                        <span style="color: #475569; font-size: 0.85rem; flex:1;">${sub.nombre}</span>
                        <span style="font-weight: 700; font-size: 0.95rem; color: ${valColor}; min-width: 40px; text-align: center;">${valText}</span>
                    </div>
                `;
            }).join('');

            let dimAvgColor = '#64748b';
            if (dimAvg !== 'N/A') {
                const n = parseFloat(dimAvg);
                if (n >= 5.5) dimAvgColor = '#16a34a';
                else if (n >= 4) dimAvgColor = '#d97706';
                else dimAvgColor = '#dc2626';
            }

            dimensionesHtml += `
                <div style="margin-bottom: 16px; background: #f8fafc; border-radius: 16px; border: 1px solid #e2e8f0; overflow: hidden;">
                    <div style="display: flex; justify-content: space-between; align-items: center; padding: 12px 16px; background: #f1f5f9; border-bottom: 1px solid #e2e8f0;">
                        <span style="font-weight: 700; color: #1e293b; font-size: 0.9rem;">${dim.nombre}</span>
                        <span style="font-weight: 800; color: ${dimAvgColor}; font-size: 1rem;">${dimAvg}</span>
                    </div>
                    ${subsHtml}
                </div>
            `;
        });

        // Info de la evaluación
        const promedioGlobal = evalData.promedio != null ? evalData.promedio.toFixed(2) : 'N/A';
        let globalColor = '#64748b';
        if (evalData.promedio != null) {
            if (evalData.promedio >= 5.5) globalColor = '#16a34a';
            else if (evalData.promedio >= 4) globalColor = '#d97706';
            else globalColor = '#dc2626';
        }

        // Historial badge si hay más de 1 eval
        const historialBadge = sorted.length > 1
            ? `<span style="background: #eff6ff; color: #1e40af; font-size: 0.7rem; padding: 3px 8px; border-radius: 8px; font-weight: 700; border: 1px solid #bfdbfe;">${sorted.length} evaluaciones este año</span>`
            : '';

        const tipoLiderazgo = getInterpretacion(evalData.promedio);
        const tipoApoyoText = (evalData.apoyos && evalData.apoyos.length > 0) 
            ? evalData.apoyos.map(a => a.apoyo).join(', ') 
            : 'No registrado';

        const content = `
            <div style="max-height: 70vh; overflow-y: auto; padding: 4px; font-family: inherit;">
                <!-- Encabezado del docente -->
                <div style="display: flex; align-items: center; gap: 16px; margin-bottom: 20px; padding: 16px; background: linear-gradient(135deg, #1e293b, #334155); border-radius: 16px; color: white;">
                    <div style="width: 50px; height: 50px; background: rgba(255,255,255,0.15); border-radius: 14px; display: flex; align-items: center; justify-content: center; font-size: 1.3rem;">
                        <i class="fas fa-user-tie"></i>
                    </div>
                    <div style="flex:1;">
                        <div style="font-weight: 800; font-size: 1.1rem;">${docenteNombre}</div>
                        <div style="font-size: 0.8rem; opacity: 0.7;">${colegioNombre} · ${formatFecha(evalData.fecha)}</div>
                    </div>
                    <div style="text-align: center;">
                        <div style="font-size: 0.6rem; font-weight: 700; text-transform: uppercase; letter-spacing: 1px; opacity: 0.6; margin-bottom: 2px;">Promedio</div>
                        <div style="font-size: 1.6rem; font-weight: 900; color: ${globalColor};">${promedioGlobal}</div>
                    </div>
                </div>

                ${historialBadge ? `<div style="margin-bottom: 12px;">${historialBadge}</div>` : ''}

                <!-- Dimensiones -->
                <div style="margin-bottom: 20px;">
                    <h4 style="font-weight: 800; font-size: 0.95rem; color: #1e293b; margin-bottom: 10px; border-bottom: 2px solid #e2e8f0; padding-bottom: 6px; text-transform: uppercase; letter-spacing: 0.5px;">Dimensiones Evaluadas</h4>
                    ${dimensionesHtml}
                </div>

                <!-- Detalles de Liderazgo -->
                <div style="margin-bottom: 20px; background: #f8fafc; border-radius: 16px; border: 1px solid #e2e8f0; padding: 16px;">
                    <h4 style="font-weight: 800; font-size: 0.95rem; color: #1e293b; margin-top: 0; margin-bottom: 12px; border-bottom: 1px solid #e2e8f0; padding-bottom: 6px; text-transform: uppercase; letter-spacing: 0.5px;">Detalles de Liderazgo</h4>
                    
                    <div style="display: grid; grid-template-columns: 1fr; gap: 12px;">
                        <div>
                            <span style="font-weight: 700; font-size: 0.8rem; text-transform: uppercase; color: #64748b; display: block; margin-bottom: 2px;">Tipo de Liderazgo</span>
                            <span style="font-weight: 600; font-size: 0.9rem; color: #0f172a; background: #e0f2fe; color: #0369a1; padding: 4px 8px; border-radius: 6px; display: inline-block;">${tipoLiderazgo}</span>
                        </div>
                        <div>
                            <span style="font-weight: 700; font-size: 0.8rem; text-transform: uppercase; color: #64748b; display: block; margin-bottom: 2px;">Funcionamiento del Grupo</span>
                            <span style="font-size: 0.9rem; color: #334155;">${evalData.func_grupo || 'No registrado'}</span>
                        </div>
                        <div>
                            <span style="font-weight: 700; font-size: 0.8rem; text-transform: uppercase; color: #64748b; display: block; margin-bottom: 2px;">Orientación para el Desarrollo</span>
                            <span style="font-size: 0.9rem; color: #334155;">${evalData.orientacion || 'No registrado'}</span>
                        </div>
                        <div>
                            <span style="font-weight: 700; font-size: 0.8rem; text-transform: uppercase; color: #64748b; display: block; margin-bottom: 2px;">Orientación de Desarrollo Docente</span>
                            <span style="font-size: 0.9rem; color: #334155;">${evalData.nivel_apoyo || 'No registrado'}</span>
                        </div>
                        <div>
                            <span style="font-weight: 700; font-size: 0.8rem; text-transform: uppercase; color: #64748b; display: block; margin-bottom: 2px;">Tipo de Apoyo Sugerido</span>
                            <span style="font-size: 0.9rem; color: #334155;">${tipoApoyoText}</span>
                        </div>
                    </div>
                </div>

                <!-- Retroalimentación de Psicología Organizacional -->
                <div style="margin-bottom: 20px; background: #f0fdf4; border-radius: 16px; border: 1px solid #bbf7d0; padding: 16px;">
                    <h4 style="font-weight: 800; font-size: 0.95rem; color: #166534; margin-top: 0; margin-bottom: 12px; border-bottom: 1px solid #bbf7d0; padding-bottom: 6px; text-transform: uppercase; letter-spacing: 0.5px;">Retroalimentación</h4>
                    
                    <div style="display: grid; grid-template-columns: 1fr; gap: 12px;">
                        <div style="display: flex; gap: 16px;">
                            <div style="flex: 1;">
                                <span style="font-weight: 700; font-size: 0.8rem; text-transform: uppercase; color: #166534; opacity: 0.8; display: block; margin-bottom: 2px;">Fecha de Retroalimentación</span>
                                <span style="font-size: 0.9rem; color: #14532d; font-weight: 500;">${evalData.fecha_retro ? formatFecha(evalData.fecha_retro) : 'No registrada'}</span>
                            </div>
                            <div style="flex: 1;">
                                <span style="font-weight: 700; font-size: 0.8rem; text-transform: uppercase; color: #166534; opacity: 0.8; display: block; margin-bottom: 2px;">Modalidad</span>
                                <span style="font-size: 0.9rem; color: #14532d; font-weight: 500;">${evalData.modalidad_retro || 'No registrada'}</span>
                            </div>
                        </div>
                        <div>
                            <span style="font-weight: 700; font-size: 0.8rem; text-transform: uppercase; color: #166534; opacity: 0.8; display: block; margin-bottom: 2px;">Síntesis de la Retroalimentación</span>
                            <div style="font-size: 0.9rem; color: #14532d; line-height: 1.5; white-space: pre-line; background: rgba(255,255,255,0.5); padding: 10px; border-radius: 8px;">${evalData.sintesis_retro || 'No registrada'}</div>
                        </div>
                        <div>
                            <span style="font-weight: 700; font-size: 0.8rem; text-transform: uppercase; color: #166534; opacity: 0.8; display: block; margin-bottom: 2px;">Acuerdos de Mejora</span>
                            <div style="font-size: 0.9rem; color: #14532d; line-height: 1.5; white-space: pre-line; background: rgba(255,255,255,0.5); padding: 10px; border-radius: 8px;">${evalData.acuerdos_mejora || 'No registrado'}</div>
                        </div>
                    </div>
                </div>

                <!-- Comentarios Generales -->
                ${evalData.comentarios ? `
                <div style="margin-top: 16px; padding: 14px 16px; background: #fffbeb; border-radius: 12px; border: 1px solid #fde68a;">
                    <div style="font-weight: 700; font-size: 0.75rem; text-transform: uppercase; letter-spacing: 0.5px; color: #92400e; margin-bottom: 6px;">Comentarios Adicionales</div>
                    <div style="color: #78350f; font-size: 0.85rem; line-height: 1.5; white-space: pre-line;">${evalData.comentarios}</div>
                </div>` : ''}
            </div>
            <div class="modal-actions" style="margin-top: 20px; display: flex; justify-content: flex-end;">
                <button class="btn btn-secondary" onclick="window.app.closeModal()">Cerrar</button>
            </div>
        `;

        const titleEl = document.getElementById('modalTitle');
        const bodyEl = document.getElementById('modalBody');
        if (titleEl) titleEl.textContent = `Evaluación de Liderazgo - ${docenteNombre}`;
        if (bodyEl) bodyEl.innerHTML = content;
        document.getElementById('modalOverlay').classList.add('active');

    } catch (error) {
        mostrarLoading(false);
        console.error('Error en verLiderazgoDocente:', error);
        showAlert('Error', `No se pudo cargar la evaluación: ${error.message}`, 'error');
    }
}

/**
 * Agrega una fila de estudiante observada al formulario dinámico
 */
export function agregarFilaEstudiante(nombre = '', conducta = '') {
    const tbody = document.getElementById('tbodyEstudiantesObservados');
    if (!tbody) return;
    const rowCount = tbody.children.length;
    const num = rowCount + 1;
    
    // El estado de solo-lectura del formulario lo refleja un campo que depende
    // directamente de isCreator (no de visitaDocente, que nace deshabilitado
    // hasta elegir colegio y daría un falso positivo en pautas en blanco).
    const disabledAttr = document.getElementById('visitaObservaciones')?.disabled ? 'disabled' : '';
    const isEditable = !disabledAttr;

    const tr = document.createElement('tr');
    tr.className = 'border-b border-slate-100 row-estudiante';
    tr.innerHTML = `
        <td class="p-3 font-bold text-slate-400 text-center row-num">${num}</td>
        <td class="p-2">
            <input type="text" class="w-full bg-slate-50 border border-slate-200 rounded-xl p-2 text-xs focus:ring-2 focus:ring-indigo-500/20 outline-none est-nombre" placeholder="Nombre del estudiante..." value="${nombre}" ${disabledAttr}>
        </td>
        <td class="p-2">
            <input type="text" class="w-full bg-slate-50 border border-slate-200 rounded-xl p-2 text-xs focus:ring-2 focus:ring-indigo-500/20 outline-none est-conducta" placeholder="Conducta y detalles observados..." value="${conducta}" ${disabledAttr}>
        </td>
        ${isEditable ? `
            <td class="p-2 text-center">
                <button type="button" onclick="this.closest('tr').remove(); window.app.reordenarNumeracionEstudiantes();" class="text-rose-500 hover:text-rose-700 p-2 rounded-xl transition-all">
                    <i class="fas fa-trash-alt"></i>
                </button>
            </td>
        ` : ''}
    `;
    tbody.appendChild(tr);
}

/**
 * Reordena la numeración de los estudiantes
 */
export function reordenarNumeracionEstudiantes() {
    const tbody = document.getElementById('tbodyEstudiantesObservados');
    if (!tbody) return;
    Array.from(tbody.children).forEach((tr, idx) => {
        const numEl = tr.querySelector('.row-num');
        if (numEl) numEl.textContent = idx + 1;
    });
}
