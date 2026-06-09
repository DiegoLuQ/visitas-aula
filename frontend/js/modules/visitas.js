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

// ¿La pauta usa el formato Orientación/Convivencia? (incluye fallback al id 2 legacy)
function esFormatoOrientacion(plantilla) {
    if (!plantilla) return false;
    const f = (plantilla.formato || '').toUpperCase();
    if (f) return f === 'ORIENTACION';
    return plantilla.id == 2; // legacy: plantillas sin formato definido
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

    if (filterContainer && !_dashFilterInitialized) {
        filterContainer.style.display = 'block';
        const colegios = await api.colegios.getAll();
        colegioSelect.innerHTML = '<option value="">-- Seleccione un Establecimiento --</option>' +
            colegios.map(c => `<option value="${c.id}">${c.nombre}</option>`).join('');
        colegioSelect.onchange = () => refreshVisitasDashboard();
        _dashFilterInitialized = true;
    }

    if (colegioSelect) {
        if (user?.colegio_id) {
            colegioSelect.value = user.colegio_id;
            colegioSelect.disabled = true;
        } else {
            colegioSelect.disabled = false;
        }
    }

    const targetColegioId = user?.colegio_id || colegioSelect?.value || null;

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
    const targetColegioId = user?.colegio_id || colegioSelect?.value || null;

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
        const promLiderazgoByDocente = {};
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
                if (!promLiderazgoByDocente[v.docente_id]) {
                    promLiderazgoByDocente[v.docente_id] = { sum: 0, count: 0 };
                }
                promLiderazgoByDocente[v.docente_id].sum += v.promedio;
                promLiderazgoByDocente[v.docente_id].count += 1;
            }
        });

        const getLidBadge = (docenteId) => {
            const data = promLiderazgoByDocente[docenteId];
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
        };

        // Una visita es cualquier pauta con formato de visita (UTP / ORIENTACION),
        // sin importar su plantilla_id concreto (pueden ser copias por colegio).
        const VISITA_FORMATOS = ['UTP', 'ORIENTACION'];
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
        const tbodyVis = document.getElementById('visitasRealizadasBody');
        if (tbodyVis) {
            tbodyVis.innerHTML = docentesVisitados.length > 0
                ? docentesVisitados.map(dv => {
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
                : '<tr><td colspan="3" class="text-center" style="color:#94a3b8; padding:20px;">Aún no se han realizado visitas este año</td></tr>';
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

            if (existingData.comentarios) {
                try {
                    const com = JSON.parse(existingData.comentarios);
                    if (document.getElementById('visitaObservaciones')) document.getElementById('visitaObservaciones').value = com.observaciones || '';
                    if (document.getElementById('visitaRetroalimentacion')) document.getElementById('visitaRetroalimentacion').value = com.retroalimentacion || '';
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
    const obsEditable = isCreator && (isNew || (esFormatoOrientacion(plantilla) && ['BORRADOR', 'LISTO_PARA_FIRMA'].includes(estadoVisita)));
    const canSave = retroEditable;
    const disabledAttr = generalEditable ? '' : 'disabled';   // datos generales / rúbrica
    const disabledRetro = retroEditable ? '' : 'disabled';    // solo retroalimentación
    const disabledObs = obsEditable ? '' : 'disabled';        // observaciones
    const currentColegioId = existingData?.colegio_id || existingData?.docente?.colegio_id;

    const html = `
        <div class="visita-form-card animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div class="form-header bg-slate-900 text-white p-5 sm:p-6 rounded-t-3xl">
                <div class="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-4">
                    <div class="min-w-0">
                        <h3 class="text-xl sm:text-2xl font-black">${plantilla.nombre}</h3>
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
                            <h4 class="text-indigo-900 font-black text-xl mb-6 flex items-center gap-3">
                                <span class="bg-indigo-100 text-indigo-600 w-8 h-8 rounded-lg flex items-center justify-center text-sm">${dIdx + 1}</span>
                                ${dim.nombre}
                            </h4>
                            <div class="grid gap-4">
                                ${dim.subdimensiones.map((sub, sIdx) => `
                                    <div class="bg-white border border-slate-100 rounded-3xl p-6 hover:border-indigo-200 transition-all hover:shadow-lg hover:shadow-indigo-500/5">
                                        <div class="flex flex-col lg:flex-row lg:items-center gap-6">
                                            <div class="lg:w-3/5">
                                                <p class="text-slate-700 font-semibold text-base leading-snug">${sub.descripcion}</p>
                                            </div>
                                            <div class="lg:w-2/5 flex p-1 bg-slate-50 rounded-2xl w-full">
                                                <label class="relative flex-1 cursor-pointer">
                                                    <input type="radio" name="ind_${sub.id}" value="1" class="peer sr-only" required ${disabledAttr}>
                                                    <div class="py-3 rounded-xl text-xs font-bold text-slate-400 peer-checked:bg-white peer-checked:text-emerald-600 peer-checked:shadow-sm transition-all flex items-center justify-center">OBSERVADO</div>
                                                </label>
                                                <label class="relative flex-1 cursor-pointer">
                                                    <input type="radio" name="ind_${sub.id}" value="0" class="peer sr-only" ${disabledAttr}>
                                                    <div class="py-3 rounded-xl text-xs font-bold text-slate-400 peer-checked:bg-white peer-checked:text-rose-600 peer-checked:shadow-sm transition-all flex items-center justify-center">NO OBSERVADO</div>
                                                </label>
                                            </div>
                                        </div>
                                        ${esFormatoOrientacion(plantilla) ? `
                                        <div class="mt-4 border-t border-slate-100 pt-4">
                                            <label class="block text-[10px] font-black text-slate-400 uppercase tracking-wider mb-2">Estrategia a mejorar</label>
                                            <textarea name="est_${sub.id}" class="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 text-sm focus:ring-4 focus:ring-indigo-500/10 transition-all outline-none min-h-[60px]" placeholder="Escriba la estrategia acordada para este indicador..." ${disabledAttr}></textarea>
                                        </div>
                                        ` : ''}
                                    </div>
                                `).join('')}
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

                <div class="mt-12 pt-10 border-t border-slate-100">
                    <h4 class="text-xl font-black text-slate-900 mb-6 flex items-center gap-3">
                        <i class="fas fa-comment-alt text-indigo-600"></i>
                        V. Observaciones y Retroalimentación
                    </h4>
                    <div class="grid grid-cols-1 md:grid-cols-2 gap-8">
                        <div class="form-group">
                            <label class="block text-xs font-bold text-slate-500 uppercase mb-3">Observaciones (Opcional)</label>
                            <textarea id="visitaObservaciones" class="w-full bg-slate-50 border-none rounded-3xl p-5 text-sm focus:ring-4 focus:ring-indigo-500/10 transition-all outline-none min-h-[120px]" placeholder="Escriba las observaciones clave..." ${disabledObs}></textarea>
                        </div>
                        <div class="form-group">
                            <label class="block text-xs font-bold text-slate-500 uppercase mb-3">Retroalimentación (Opcional)</label>
                            <textarea id="visitaRetroalimentacion" class="w-full bg-slate-50 border-none rounded-3xl p-5 text-sm focus:ring-4 focus:ring-indigo-500/10 transition-all outline-none min-h-[120px]" placeholder="Sugerencias y acuerdos..." ${disabledRetro}></textarea>
                        </div>
                    </div>
                </div>

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

        const comentarios = JSON.stringify({
            observaciones: document.getElementById('visitaObservaciones')?.value || '',
            retroalimentacion: document.getElementById('visitaRetroalimentacion')?.value || ''
        });

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
            estudiantes_observados
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
            const accion = verAbiertas
                ? `<span class="badge" style="background:#fef3c7; color:#92400e; padding:4px 10px; border-radius:8px; font-size:0.72rem; font-weight:700;">${ESTADO_LABEL[v.estado] || v.estado}</span>`
                : `<button class="btn btn-primary btn-sm" onclick="window.app.closeModal(); window.app.verDetalleVisita(${v.id}, ${v.plantilla_id}, '${pName.replace(/'/g, "\\'")}', '${(v.plantilla_slug || '').replace(/'/g, "\\'")}')" style="padding: 4px 10px; font-size: 0.75rem; border-radius: 6px;">Ver Visita</button>`;
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
