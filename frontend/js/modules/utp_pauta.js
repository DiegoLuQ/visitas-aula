
import { api } from '../api.js';
import { mostrarLoading, showAlert } from '../utils.js';
import { state } from '../state.js';

const UTP_PLANTILLA_ID = 3;
let currentUtpPlantillaId = UTP_PLANTILLA_ID; // pauta UTP activa (puede ser una copia con otro id)
let currentStep = 1;
const totalSteps = 6;
let utpViewMode = 'fases'; // 'fases' o 'completa'

// Estado local de la pauta
let utpData = {
    plantilla_id: UTP_PLANTILLA_ID,
    colegio_id: null,
    docente_id: null,
    curso_id: null,
    asignatura_id: null,
    fecha: new Date().toISOString().split('T')[0],
    duracion: '',
    respuestas: {},
    // Nuevos campos Retroalimentación
    observaciones_generales: '',
    fecha_entrevista: new Date().toISOString().split('T')[0],
    hora_entrevista: '',
    logros_principales: '',
    aspectos_mejorar: '',
    sintesis: '',
    acuerdos: '',
    // Plan Estratégico actualizado
    plan_estrategico: [
        { cambio: '', acciones: '', tiempo: '', recursos: '' }
    ],
    dimensiones: [],
    estado: 'BORRADOR'
};

let currentUtpId = null;
// El Plan Estratégico de Cambios solo es editable al crear una pauta nueva.
// En pautas existentes (BORRADOR/LISTO/FIRMADA/CERRADA) queda de solo lectura,
// igual que el resto del formulario (solo la retroalimentación es editable).
let _utpPlanEditable = true;

export async function initUtpPauta(evaluacionId = null, templateId = null) {
    const container = document.getElementById('visitaFormContainer');
    if (!container) return;

    mostrarLoading(true, 'Cargando formulario UTP...');

    try {
        const parsedTemplate = parseInt(templateId);
        currentUtpPlantillaId = !isNaN(parsedTemplate) ? parsedTemplate : UTP_PLANTILLA_ID;

        // Cargar todas las plantillas disponibles para el selector
        const todasPlantillas = await api.plantillas.getAll();
        
        // Filtrar pautas de visita visibles para este usuario (igual que visitas.js)
        let visitaPlantillas = (todasPlantillas || []).filter(p => p.id !== 1); // Excluir liderazgo
        const esAdmin = state.currentUser?.rol_id === 1;
        if (!esAdmin) {
            const misColegios = String(state.currentUser?.colegio_id || '')
                .split(',').map(s => s.trim()).filter(s => /^\d+$/.test(s)).map(Number);
            visitaPlantillas = visitaPlantillas.filter(p => p.colegio_id != null && misColegios.includes(p.colegio_id));
        }

        const plantilla = todasPlantillas.find(p => p.id === currentUtpPlantillaId) || todasPlantillas[0];

        renderUtpWizardUI(container, plantilla, evaluacionId, visitaPlantillas);

        currentUtpId = evaluacionId;
        _utpPlanEditable = !evaluacionId; // editable solo al crear una pauta nueva
        currentStep = 1;
        utpViewMode = 'fases';
        resetUtpData();
        updateWizardUI();
        
        // Cargar Catálogos
        await loadUtpCatalogs();

        // Auto-selección de colegio para no-admins
        const user = state.currentUser;
        if (user && user.colegio_id && user.rol_id !== 1 && !evaluacionId) {
            const selCol = document.getElementById('utpColegio');
            if (selCol) {
                selCol.value = user.colegio_id;
                await loadUtpDocentes(user.colegio_id);
            }
        }
        
        // Cargar Estructura de la Plantilla
        await loadUtpStructure();

        if (evaluacionId) {
            try {
                mostrarLoading(true, 'Cargando datos UTP...');
                const existing = await api.evaluaciones.getById(evaluacionId);
            
            // Población básica
            if (existing.docente) {
                document.getElementById('utpColegio').value = existing.docente.colegio_id;
                await loadUtpDocentes(existing.docente.colegio_id);
                document.getElementById('utpDocente').value = existing.docente_id;
            }
            document.getElementById('utpCurso').value = existing.curso_id;
            document.getElementById('utpAsignatura').value = existing.asignatura_id;
            document.getElementById('utpFecha').value = existing.fecha;
            document.getElementById('utpDuracion').value = existing.duracion || '';

            // Respuestas e indicadores
            utpData.respuestas = existing.respuestas.reduce((acc, r) => {
                acc[r.subdimension_id] = r.valor;
                return acc;
            }, {});

            utpData.evidencias = existing.respuestas.reduce((acc, r) => {
                acc[r.subdimension_id] = r.estrategia || '';
                return acc;
            }, {});

            // Seleccionar los radios correspondientes
            Object.keys(utpData.respuestas).forEach(subId => {
                const val = utpData.respuestas[subId];
                const radio = document.querySelector(`input[name="utpInd${subId}"][value="${val}"]`);
                if (radio) radio.checked = true;
            });

            // Sincronizar el texto guardado de cada evidencia/observación en su textarea
            // (debe mostrarse aunque luego quede deshabilitado por el bloqueo).
            Object.keys(utpData.evidencias).forEach(subId => {
                const ta = document.getElementById(`utpEvidencia${subId}`);
                if (ta) ta.value = utpData.evidencias[subId];
            });

            // Comentarios y Secciones Adicionales
            if (existing.comentarios) {
                try {
                    const com = JSON.parse(existing.comentarios);
                    
                    // Paso 4: Observaciones
                    const obsGen = document.getElementById('utpObservacionesGenerales');
                    if (obsGen) obsGen.value = com.observaciones_generales || '';

                    // Paso 5: Retroalimentación
                    if (com.retroalimentacion) {
                        const r = com.retroalimentacion;
                        if (document.getElementById('utpFechaEntrevista')) document.getElementById('utpFechaEntrevista').value = r.fecha_entrevista || '';
                        if (document.getElementById('utpHoraEntrevista')) document.getElementById('utpHoraEntrevista').value = r.hora_entrevista || '';
                        if (document.getElementById('utpLogros')) document.getElementById('utpLogros').value = r.logros || '';
                        if (document.getElementById('utpMejoras')) document.getElementById('utpMejoras').value = r.mejoras || '';
                        if (document.getElementById('utpSintesisAcuerdos')) document.getElementById('utpSintesisAcuerdos').value = r.sintesis_acuerdos || '';
                    }

                    // Paso 6: Plan Estratégico
                    utpData.plan_estrategico = com.plan_estrategico || [{ cambio: '', acciones: '', tiempo: '', recursos: '' }];
                    if (utpData.plan_estrategico.length === 0) {
                        utpData.plan_estrategico = [{ cambio: '', acciones: '', tiempo: '', recursos: '' }];
                    }
                    
                    renderUtpPlanTable();
                } catch (e) {
                    console.error('Error parseando comentarios UTP:', e);
                }
            }
            
            utpData.estado = existing.estado || 'BORRADOR';
            calculateUtpScores();

            // Reglas de edición (formato visita UTP), solo para pautas ya existentes:
            // - CERRADA / FIRMADA_DOCENTE: TODO de solo lectura.
            // - BORRADOR / LISTO_PARA_FIRMA: SOLO la retroalimentación es editable;
            //   el resto (datos generales, dimensiones/indicadores, evidencias, plan)
            //   queda bloqueado.
            const retroEditable = ['BORRADOR', 'LISTO_PARA_FIRMA'].includes(utpData.estado);
            const retroFields = ['utpFechaEntrevista', 'utpHoraEntrevista', 'utpLogros', 'utpMejoras', 'utpSintesisAcuerdos'];

            const form = document.getElementById('utpForm');
            if (form) {
                form.querySelectorAll('input, select, textarea').forEach(i => {
                    if (i.id && i.id.includes('btn')) return;
                    const isRetro = !!i.id && retroFields.includes(i.id);
                    const disabled = !(isRetro && retroEditable);
                    i.disabled = disabled;
                    if (disabled) {
                        i.classList.add('cursor-not-allowed');
                        i.style.pointerEvents = 'none';
                    } else {
                        i.classList.remove('cursor-not-allowed');
                        i.style.pointerEvents = 'auto';
                    }
                });
            }

            mostrarLoading(false);
        } catch (e) {
            mostrarLoading(false);
            console.error('Error cargando UTP para edición:', e);
        }
    }

    // Eventos de Navegación
    document.getElementById('btnUtpNext').onclick = nextStep;
    document.getElementById('btnUtpPrev').onclick = prevStep;
    document.getElementById('utpForm').onsubmit = handleUtpSubmit;

    // Change listeners para selects
    document.getElementById('utpColegio').onchange = (e) => {
        utpData.colegio_id = e.target.value;
        loadUtpDocentes(e.target.value);
    };

    renderUtpPlanTable();
    mostrarLoading(false);
    } catch (e) {
        mostrarLoading(false);
        console.error('Error inicializando pauta UTP:', e);
        showAlert('Error', `No se pudo cargar la pauta UTP: ${e.message}`, 'error');
    }
}

function resetUtpData() {
    utpData = {
        plantilla_id: currentUtpPlantillaId,
        colegio_id: null,
        docente_id: null,
        curso_id: null,
        asignatura_id: null,
        fecha: new Date().toISOString().split('T')[0],
        duracion: '',
        respuestas: {},
        evidencias: {},
        observaciones_generales: '',
        fecha_entrevista: new Date().toISOString().split('T')[0],
        hora_entrevista: '',
        logros_principales: '',
        aspectos_mejorar: '',
        sintesis: '',
        acuerdos: '',
        plan_estrategico: [{ cambio: '', acciones: '', tiempo: '', recursos: '' }],
        dimensiones: utpData.dimensiones,
        estado: 'BORRADOR'
    };
    if (document.getElementById('utpForm')) document.getElementById('utpForm').reset();
    if (document.getElementById('utpFecha')) document.getElementById('utpFecha').value = utpData.fecha;
}

async function loadUtpCatalogs() {
    try {
        const [colegios, cursos, asignaturas] = await Promise.all([
            api.colegios.getAll(),
            api.cursos.getAll(),
            api.asignaturas.getAll()
        ]);

        const selCol = document.getElementById('utpColegio');
        const selCur = document.getElementById('utpCurso');
        const selAsig = document.getElementById('utpAsignatura');

        selCol.innerHTML = '<option value="">Seleccione Colegio</option>' + 
            colegios.map(c => `<option value="${c.id}">${c.nombre}</option>`).join('');
        
        selCur.innerHTML = '<option value="">Seleccione Curso</option>' + 
            cursos.map(c => `<option value="${c.id}">${c.nivel?.nombre || 'N/A'} ${c.letra}</option>`).join('');
        selAsig.innerHTML = '<option value="">Seleccione Asignatura</option>' + 
            asignaturas.map(a => `<option value="${a.id}">${a.nombre}</option>`).join('');

        // Evento para cargar docentes
        selCol.addEventListener('change', (e) => loadUtpDocentes(e.target.value));

    } catch (error) {
        console.error('Error cargando catálogos UTP:', error);
    }
}

async function loadUtpDocentes(colegioId) {
    const selDoc = document.getElementById('utpDocente');
    if (!colegioId) {
        selDoc.innerHTML = '<option value="">Seleccione Docente</option>';
        selDoc.disabled = true;
        return;
    }

    try {
        const docentes = await api.docentes.getAll(colegioId);
        selDoc.innerHTML = '<option value="">Seleccione Docente</option>' +
            docentes.map(d => `<option value="${d.id}">${d.nombre}</option>`).join('');

        // Datos generales (incluido el docente) son editables en cualquier estado.
        selDoc.disabled = false;
        selDoc.classList.remove('cursor-not-allowed');
    } catch (error) {
        console.error('Error cargando docentes UTP:', error);
    }
}

async function loadUtpStructure() {
    try {
        const [plantilla, dimensiones] = await Promise.all([
            api.plantillas.get(currentUtpPlantillaId),
            api.plantillas.getDimensiones(currentUtpPlantillaId)
        ]);
        utpData.dimensiones = dimensiones;
        renderUtpSteps();
        applyEvidenceStates();
    } catch (error) {
        console.error('DEBUG - loadUtpStructure Error:', error);
        showAlert('Error', `No se pudo cargar la estructura UTP: ${error.message}`, 'error');
    }
}

function renderUtpSteps() {
    // Inyectar indicadores en los pasos 2, 3 y 4
    utpData.dimensiones.forEach((dim, idx) => {
        const container = document.getElementById(`utpDim${idx + 1}Container`);
        if (!container) return;

        let html = `
            <div class="bg-indigo-50/50 rounded-2xl p-6 mb-6 flex items-center justify-between border border-indigo-100">
                <div>
                    <h3 class="text-indigo-900 font-heading font-black text-xl">${dim.nombre}</h3>
                    <p class="text-indigo-600/70 text-sm font-medium">Dimensión ${idx + 1}</p>
                </div>
                <div class="bg-white px-4 py-2 rounded-xl shadow-sm border border-indigo-100">
                    <span class="text-xs font-bold text-slate-400 uppercase mr-2">Puntaje:</span>
                    <span id="scoreDim${dim.id}" class="text-lg font-black text-indigo-600">0.0</span>
                </div>
            </div>
        `;

        dim.subdimensiones.forEach((sub, sIdx) => {
            html += `
                <div class="group bg-white border border-slate-200 rounded-3xl p-6 transition-all hover:border-indigo-300 hover:shadow-xl hover:shadow-indigo-500/5">
                    <div class="flex flex-col lg:flex-row lg:items-start gap-8">
                        <div class="lg:w-2/5">
                            <div class="flex items-start gap-3">
                                <span class="flex items-center justify-center min-w-[28px] h-7 rounded-xl bg-slate-100 text-slate-500 text-[11px] font-black mt-1 group-hover:bg-indigo-600 group-hover:text-white transition-all">
                                    ${idx + 1}.${sIdx + 1}
                                </span>
                                <p class="text-slate-700 font-semibold text-base leading-snug">${sub.descripcion}</p>
                            </div>
                        </div>
                        <div class="lg:w-3/5 space-y-4">
                            <div class="flex p-1 bg-slate-100/80 rounded-2xl w-full shadow-inner">
                                ${[
                                    {v: 0, n: 'N/A', c: 'peer-checked:text-slate-900'},
                                    {v: 1, n: 'Inicial', c: 'peer-checked:text-rose-600'},
                                    {v: 2, n: 'En Desarrollo', c: 'peer-checked:text-amber-600'},
                                    {v: 3, n: 'Adecuado', c: 'peer-checked:text-emerald-600'},
                                    {v: 4, n: 'Destacado', c: 'peer-checked:text-indigo-600'}
                                ].map(opt => `
                                    <label class="relative flex-1 min-w-0 cursor-pointer">
                                        <input type="radio" name="utpInd${sub.id}" value="${opt.v}" class="peer sr-only" onchange="app.updateUtpScore(${sub.id}, ${dim.id}, ${opt.v})" required>
                                        <div class="px-1 py-2.5 rounded-xl text-[10px] sm:text-[11px] font-black text-slate-400 uppercase tracking-tighter leading-tight text-center transition-all peer-checked:bg-white ${opt.c} peer-checked:shadow-md hover:text-indigo-600 flex items-center justify-center">
                                            ${opt.n}
                                        </div>
                                    </label>
                                `).join('')}
                            </div>
                            <textarea id="utpEvidencia${sub.id}" rows="3" disabled
                                placeholder="Seleccione un nivel para habilitar las evidencias u observaciones específicas..."
                                onchange="app.updateUtpEvidence(${sub.id}, this.value)"
                                class="w-full bg-slate-50 border border-slate-200 rounded-2xl p-4 text-sm text-slate-600 placeholder:text-slate-300 focus:ring-4 focus:ring-indigo-500/10 focus:bg-white transition-all outline-none min-h-[90px] resize-y disabled:opacity-50 disabled:cursor-not-allowed disabled:bg-slate-100">${utpData.evidencias && utpData.evidencias[sub.id] !== undefined ? utpData.evidencias[sub.id] : ''}</textarea>
                        </div>
                    </div>
                </div>
            `;
        });

        container.innerHTML = html;
    });
}

export function updateUtpScore(subId, dimId, valor) {
    if (!isUtpRubricaEditable()) return; // rúbrica bloqueada una vez creada la pauta
    utpData.respuestas[subId] = parseInt(valor);
    // Habilitar el campo de evidencias al elegir un nivel
    const ta = document.getElementById(`utpEvidencia${subId}`);
    if (ta) ta.disabled = false;
    calculateUtpScores();
}

// La rúbrica (dimensiones + indicadores / puntajes) solo se rellena al CREAR la pauta.
// Una vez que existe queda de solo lectura en cualquier estado. El bloqueo en modo
// edición lo aplica el recorrido de inputs en initUtpPauta; esta guarda evita además
// que un radio dispare cambios si quedara habilitado por algún motivo.
function isUtpRubricaEditable() {
    return !currentUtpId;
}

// Habilita cada textarea de evidencia según si su indicador tiene nivel elegido.
// (En modo edición, initUtpPauta deshabilita las evidencias salvo en pauta nueva.)
function applyEvidenceStates() {
    (utpData.dimensiones || []).forEach(dim => {
        (dim.subdimensiones || []).forEach(sub => {
            const ta = document.getElementById(`utpEvidencia${sub.id}`);
            if (!ta) return;
            // Sincronizar el contenido guardado (modo edición)
            if (utpData.evidencias && utpData.evidencias[sub.id] !== undefined) {
                ta.value = utpData.evidencias[sub.id];
            }
            const hasRating = utpData.respuestas[sub.id] !== undefined;
            ta.disabled = !hasRating;
        });
    });
}

export function updateUtpEvidence(subId, text) {
    // La evidencia/observación es editable en cualquier estado (no es parte de la rúbrica).
    if (!utpData.evidencias) utpData.evidencias = {};
    utpData.evidencias[subId] = text;
}

function calculateUtpScores() {
    let globalSum = 0;
    let globalCount = 0;

    utpData.dimensiones.forEach(dim => {
        let dimSum = 0;
        let dimCount = 0;
        
        dim.subdimensiones.forEach(sub => {
            const val = utpData.respuestas[sub.id];
            if (val !== undefined && val > 0) {
                dimSum += val;
                dimCount++;
            }
        });

        const dimAvg = dimCount > 0 ? (dimSum / dimCount).toFixed(2) : "0.00";
        const scoreEl = document.getElementById(`scoreDim${dim.id}`);
        if (scoreEl) scoreEl.textContent = dimAvg;

        if (dimCount > 0) {
            globalSum += parseFloat(dimAvg);
            globalCount++;
        }
    });

    const globalAvg = globalCount > 0 ? (globalSum / globalCount).toFixed(2) : "0.00";
    
    // Actualizar Dashboard de Resultados (el que sale al final)
    const resDim1 = document.getElementById('resDim1');
    const resDim2 = document.getElementById('resDim2');
    const resDim3 = document.getElementById('resDim3');
    
    if (utpData.dimensiones[0]) resDim1.textContent = document.getElementById(`scoreDim${utpData.dimensiones[0].id}`).textContent;
    if (utpData.dimensiones[1]) resDim2.textContent = document.getElementById(`scoreDim${utpData.dimensiones[1].id}`).textContent;
    if (utpData.dimensiones[2]) resDim3.textContent = document.getElementById(`scoreDim${utpData.dimensiones[2].id}`).textContent;
    
    document.getElementById('resGlobal').textContent = globalAvg;
    document.getElementById('resInterpretacion').textContent = getUtpLabel(globalAvg);
}

// Calcula el promedio de cada dimensión (mapeado a promedio_dim1..5)
function computeUtpDimAverages() {
    const result = {
        promedio_dim1: 0, promedio_dim2: 0, promedio_dim3: 0,
        promedio_dim4: 0, promedio_dim5: 0
    };
    (utpData.dimensiones || []).forEach((dim, idx) => {
        if (idx > 4) return;
        let sum = 0, count = 0;
        (dim.subdimensiones || []).forEach(sub => {
            const val = utpData.respuestas[sub.id];
            if (val !== undefined && val > 0) { sum += val; count++; }
        });
        result[`promedio_dim${idx + 1}`] = count > 0 ? parseFloat((sum / count).toFixed(2)) : 0;
    });
    return result;
}

function getUtpLabel(avg) {
    const val = parseFloat(avg);
    if (val === 0) return 'Esperando evaluación...';
    if (val >= 3.5) return 'Nivel Destacado 🌟';
    if (val >= 3.0) return 'Nivel Adecuado ✅';
    if (val >= 2.0) return 'En Desarrollo 📈';
    return 'Nivel Inicial ⚠️';
}

// --- Wizard Navigation ---
export function setUtpViewMode(mode) {
    utpViewMode = mode;
    
    const btnFases = document.getElementById('btnUtpModeFases');
    const btnCompleta = document.getElementById('btnUtpModeCompleta');
    
    if (btnFases && btnCompleta) {
        if (mode === 'fases') {
            btnFases.className = 'px-4 py-2 text-xs font-bold rounded-xl transition-all bg-indigo-600 text-white shadow-md border border-indigo-500';
            btnCompleta.className = 'px-4 py-2 text-xs font-bold rounded-xl transition-all text-slate-400 hover:text-white border border-transparent';
        } else {
            btnFases.className = 'px-4 py-2 text-xs font-bold rounded-xl transition-all text-slate-400 hover:text-white border border-transparent';
            btnCompleta.className = 'px-4 py-2 text-xs font-bold rounded-xl transition-all bg-indigo-600 text-white shadow-md border border-indigo-500';
        }
    }
    
    for (let i = 1; i <= totalSteps; i++) {
        const stepEl = document.getElementById(`utpStep${i}`);
        if (stepEl) {
            if (mode === 'completa') {
                stepEl.classList.remove('hidden');
            } else {
                stepEl.classList.toggle('hidden', i !== currentStep);
            }
        }
    }
    
    updateWizardUI();
}

export function nextStep(finishEarly = false) {
    if (!validateCurrentStep()) return;
    
    if (finishEarly === true) {
        handleUtpSubmit();
        return;
    }

    if (utpViewMode === 'completa') {
        handleUtpSubmit();
        return;
    }

    if (currentStep < totalSteps) {
        document.getElementById(`utpStep${currentStep}`).classList.add('hidden');
        currentStep++;
        document.getElementById(`utpStep${currentStep}`).classList.remove('hidden');
        updateWizardUI();
        window.scrollTo(0, 0);
    } else {
        handleUtpSubmit();
    }
}

export function prevStep() {
    if (utpViewMode === 'completa') return;
    if (currentStep > 1) {
        document.getElementById(`utpStep${currentStep}`).classList.add('hidden');
        currentStep--;
        document.getElementById(`utpStep${currentStep}`).classList.remove('hidden');
        updateWizardUI();
        window.scrollTo(0, 0);
    }
}

function validateCurrentStep() {
    if (utpViewMode === 'completa' || currentStep === 1) {
        const col = document.getElementById('utpColegio').value;
        const doc = document.getElementById('utpDocente').value;
        if (!col || !doc) {
            showAlert('Atención', 'Por favor seleccione Colegio y Docente', 'warning');
            return false;
        }
    }
    return true;
}

function updateWizardUI() {
    const progress = (currentStep / totalSteps) * 100;
    const bar = document.getElementById('utpProgressBar');
    const indicator = document.getElementById('utpStepIndicator');
    
    if (bar) {
        bar.style.width = utpViewMode === 'completa' ? '100%' : `${progress}%`;
    }
    if (indicator) {
        indicator.textContent = utpViewMode === 'completa' ? 'Pauta Completa' : `Paso ${currentStep} de ${totalSteps}`;
    }

    const btnNext = document.getElementById('btnUtpNext');
    const btnPrev = document.getElementById('btnUtpPrev');
    const btnFinish = document.getElementById('btnUtpFinishEarly');

    if (utpViewMode === 'completa') {
        if (btnPrev) btnPrev.classList.add('hidden');
        if (btnFinish) btnFinish.classList.add('hidden');
        if (btnNext) {
            btnNext.classList.remove('hidden');
            const span = btnNext.querySelector('span');
            const icon = btnNext.querySelector('i');
            if (span) span.textContent = 'GUARDAR EVALUACIÓN';
            if (icon) icon.className = 'fas fa-save text-xs opacity-50';
            btnNext.classList.replace('bg-indigo-600', 'bg-emerald-600');
        }
        renderUtpPlanTable();
    } else {
        if (btnPrev) btnPrev.classList.toggle('hidden', currentStep === 1);
        
        if (btnFinish) {
            btnFinish.classList.toggle('hidden', ![4, 5].includes(currentStep));
            btnFinish.textContent = currentUtpId ? 'ACTUALIZAR Y FINALIZAR' : 'FINALIZAR AHORA';
        }

        if (btnNext) {
            const span = btnNext.querySelector('span');
            const icon = btnNext.querySelector('i');
            
            if (currentStep === totalSteps) {
                span.textContent = 'GUARDAR EVALUACIÓN';
                if (icon) icon.className = 'fas fa-save text-xs opacity-50';
                btnNext.classList.replace('bg-indigo-600', 'bg-emerald-600');
            } else {
                span.textContent = 'SIGUIENTE';
                if (icon) icon.className = 'fas fa-arrow-right text-xs opacity-50';
                btnNext.classList.replace('bg-emerald-600', 'bg-indigo-600');
            }
        }

        if (currentStep === 6) {
            renderUtpPlanTable();
        }
    }
}

// --- Plan Estratégico ---
export function addUtpPlanRow() {
    if (!_utpPlanEditable) return; // pauta existente/cerrada: solo lectura
    utpData.plan_estrategico.push({ cambio: '', acciones: '', tiempo: '', recursos: '' });
    renderUtpPlanTable();
}

export function removeUtpPlanRow(index) {
    if (!_utpPlanEditable) return; // pauta existente/cerrada: solo lectura
    if (utpData.plan_estrategico.length > 1) {
        utpData.plan_estrategico.splice(index, 1);
        renderUtpPlanTable();
    }
}

function renderUtpPlanTable() {
    const container = document.getElementById('utpPlanTableBody');
    if (!container) return;

    const ro = !_utpPlanEditable;                 // modo solo lectura
    const dis = ro ? 'disabled' : '';
    const roClass = ro ? ' opacity-70 cursor-not-allowed' : '';
    const taClass = "w-full bg-white/5 border border-white/10 rounded-2xl p-4 text-sm text-white placeholder:text-white/20 focus:bg-white/10 focus:ring-4 focus:ring-indigo-500/20 outline-none transition-all resize-y";
    const labelClass = "block text-[10px] font-black text-indigo-300/70 uppercase tracking-widest mb-2";

    // Mostrar/ocultar el botón "+ Agregar Cambio" según el modo
    const addBtn = document.getElementById('btnUtpAddPlan');
    if (addBtn) addBtn.style.display = ro ? 'none' : '';

    container.innerHTML = utpData.plan_estrategico.map((row, idx) => `
        <div class="bg-white/5 rounded-3xl p-6 border border-white/10 hover:border-white/20 transition-colors">
            <div class="flex items-center justify-between mb-5">
                <span class="inline-flex items-center gap-2 text-indigo-300 font-black text-xs uppercase tracking-widest">
                    <span class="bg-indigo-500/20 w-7 h-7 rounded-xl flex items-center justify-center">${idx + 1}</span>
                    Cambio
                </span>
                ${ro ? '' : `<button type="button" onclick="app.removeUtpPlanRow(${idx})" class="text-white/30 hover:text-rose-400 transition-colors p-2" title="Eliminar cambio">
                    <i class="fas fa-trash-alt"></i>
                </button>`}
            </div>
            <div class="grid grid-cols-1 md:grid-cols-2 gap-5">
                <div class="md:col-span-2">
                    <label class="${labelClass}">Cambio acordado</label>
                    <textarea rows="2" ${dis} onchange="app.updateUtpPlanField(${idx}, 'cambio', this.value)"
                        placeholder="Describe el cambio acordado..."
                        class="${taClass} min-h-[60px]${roClass}">${row.cambio || ''}</textarea>
                </div>
                <div class="md:col-span-2">
                    <label class="${labelClass}">Acciones</label>
                    <textarea rows="3" ${dis} onchange="app.updateUtpPlanField(${idx}, 'acciones', this.value)"
                        placeholder="Acciones concretas a realizar..."
                        class="${taClass} min-h-[80px]${roClass}">${row.acciones || ''}</textarea>
                </div>
                <div>
                    <label class="${labelClass}">Tiempo</label>
                    <textarea rows="2" ${dis} onchange="app.updateUtpPlanField(${idx}, 'tiempo', this.value)"
                        placeholder="Plazo estimado..."
                        class="${taClass} min-h-[60px]${roClass}">${row.tiempo || ''}</textarea>
                </div>
                <div>
                    <label class="${labelClass}">Recursos</label>
                    <textarea rows="2" ${dis} onchange="app.updateUtpPlanField(${idx}, 'recursos', this.value)"
                        placeholder="Recursos necesarios..."
                        class="${taClass} min-h-[60px]${roClass}">${row.recursos || ''}</textarea>
                </div>
            </div>
        </div>
    `).join('');
}

export function updateUtpPlanField(index, field, value) {
    utpData.plan_estrategico[index][field] = value;
}

// --- Finalización ---
export async function confirmUtpSave() {
    document.getElementById('utpResultsDashboard').classList.add('hidden');
    await handleUtpSubmit();
}

async function handleUtpSubmit(e) {
    if (e) e.preventDefault();

    // Una pauta ya firmada/cerrada es de solo lectura total: no se re-guarda.
    if (currentUtpId && ['FIRMADA_DOCENTE', 'CERRADA'].includes(utpData.estado)) {
        showAlert('Pauta cerrada', 'Esta pauta ya fue cerrada y no puede modificarse.', 'info');
        return;
    }

    // En el formato UTP todos los indicadores son obligatorios: se persiste TODA
    // la pauta. El indicador que no se evaluó se guarda como N/A (valor 0), no se omite.
    const respuestasList = [];
    (utpData.dimensiones || []).forEach(dim => {
        (dim.subdimensiones || []).forEach(sub => {
            const val = utpData.respuestas[sub.id];
            respuestasList.push({
                subdimension_id: sub.id,
                valor: (val !== undefined && val !== null) ? val : 0, // 0 = N/A
                estrategia: (utpData.evidencias && utpData.evidencias[sub.id]) || ''
            });
        });
    });

    // Helper para leer select incluso si está disabled
    const getSelectVal = (id) => {
        const el = document.getElementById(id);
        return el ? parseInt(el.value) || null : null;
    };

    // Puntajes por dimensión (promedio_dim1..5)
    const dimAverages = computeUtpDimAverages();

    // Consolidar Data
    const payload = {
        plantilla_id: currentUtpPlantillaId,
        docente_id: getSelectVal('utpDocente'),
        curso_id: getSelectVal('utpCurso'),
        asignatura_id: getSelectVal('utpAsignatura'),
        fecha: document.getElementById('utpFecha')?.value || null,
        duracion: document.getElementById('utpDuracion')?.value || '',
        respuestas: respuestasList,
        ...dimAverages,
        apoyos: [],
        fortalezas_aspectos: [],
        comentarios: JSON.stringify({
            observaciones_generales: document.getElementById('utpObservacionesGenerales')?.value || '',
            retroalimentacion: {
                fecha_entrevista: document.getElementById('utpFechaEntrevista')?.value || '',
                hora_entrevista: document.getElementById('utpHoraEntrevista')?.value || '',
                logros: document.getElementById('utpLogros')?.value || '',
                mejoras: document.getElementById('utpMejoras')?.value || '',
                sintesis_acuerdos: document.getElementById('utpSintesisAcuerdos')?.value || ''
            },
            plan_estrategico: utpData.plan_estrategico.filter(r => (r.acciones || '').trim() !== '' || (r.cambio || '').trim() !== ''),
            sintesis: document.getElementById('utpSintesisAcuerdos')?.value || '',
            acuerdos: ''
        }),
        promedio: parseFloat(document.getElementById('resGlobal').textContent) || 0,
        // En creación nace en BORRADOR. Al actualizar se PRESERVA el estado actual
        // (editar datos generales/retro/plan/evidencias no debe revertir el cierre):
        // el cambio a CERRADA ocurre solo al firmar con token (Finalizar con Firma).
        estado: currentUtpId ? (utpData.estado || 'BORRADOR') : 'BORRADOR'
    };

    // Para updates, incluir colegio_id solo en create (backend lo ignora en update)
    if (!currentUtpId) {
        payload.colegio_id = getSelectVal('utpColegio');
    }

    try {
        mostrarLoading(true, currentUtpId ? 'Actualizando evaluación UTP...' : 'Guardando evaluación UTP...');
        if (currentUtpId) {
            await api.evaluaciones.update(currentUtpId, payload);
        } else {
            await api.evaluaciones.create(payload);
        }
        mostrarLoading(false);
        showAlert('Éxito', 'Pauta de Acompañamiento UTP procesada correctamente', 'success', () => {
            resetUtpData();
            app.navigateTo('visitas-dashboard');
        });
    } catch (error) {
        mostrarLoading(false);
        showAlert('Error', error.message, 'error');
    }
}

function renderUtpWizardUI(container, plantilla, evaluacionId, visitaPlantillas) {
    container.innerHTML = `
        <div class="utp-wizard-card animate-in fade-in slide-in-from-bottom-4 duration-500">
            <!-- Header -->
            <div class="bg-slate-900 text-white p-5 sm:p-8 rounded-t-[40px]">
                <div class="flex flex-col md:flex-row justify-between items-center gap-6">
                    <div>
                        <h3 class="text-3xl font-black tracking-tight">${plantilla.nombre}</h3>
                        <div class="flex items-center gap-3 mt-2">
                            <div class="h-2 w-32 bg-slate-800 rounded-full overflow-hidden">
                                <div id="utpProgressBar" class="h-full bg-indigo-500 transition-all duration-500" style="width: 16%;"></div>
                            </div>
                            <span id="utpStepIndicator" class="text-[10px] font-black uppercase tracking-widest text-slate-500">Paso 1 de ${totalSteps}</span>
                        </div>
                    </div>
                    <div class="flex items-center gap-3 flex-wrap md:flex-nowrap shrink-0">
                        <!-- Selector de Modo de Vista -->
                        <div class="flex bg-white/5 backdrop-blur-md rounded-2xl p-1 border border-white/10 shrink-0">
                            <button type="button" id="btnUtpModeFases" onclick="window.app.setUtpViewMode('fases')" class="px-3 py-1.5 text-[11px] font-black rounded-xl transition-all bg-indigo-600 text-white shadow-md border border-indigo-500">
                                Por fases
                            </button>
                            <button type="button" id="btnUtpModeCompleta" onclick="window.app.setUtpViewMode('completa')" class="px-3 py-1.5 text-[11px] font-black rounded-xl transition-all text-slate-400 hover:text-white border border-transparent">
                                Ver completa
                            </button>
                        </div>

                        ${!evaluacionId ? `
                            <div class="flex items-center bg-white/10 rounded-2xl px-4 py-2.5 gap-2 border border-white/10 shrink-0">
                                <span class="text-[9px] font-black uppercase text-slate-400">Cambiar Pauta:</span>
                                <select onchange="window.app.cambiarTipoPauta(this.value)" class="bg-transparent text-white text-xs font-bold border-none outline-none cursor-pointer max-w-[180px] truncate">
                                    ${visitaPlantillas.map(p => `<option value="${p.id}" ${plantilla.id == p.id ? 'selected' : ''} style="color:black">${p.nombre_largo || p.nombre}</option>`).join('')}
                                </select>
                            </div>
                        ` : ''}
                        ${evaluacionId ? '<span class="bg-indigo-600 px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider shrink-0">Modo Edición</span>' : ''}
                        <div class="bg-white/5 backdrop-blur-xl border border-white/10 px-4 py-2 rounded-2xl text-center shrink-0 min-w-[100px]">
                            <span class="block text-[9px] font-black text-slate-500 uppercase mb-0.5">Puntaje Global</span>
                            <span id="resGlobal" class="text-xl font-black text-indigo-400">0.0</span>
                        </div>
                    </div>
                </div>
            </div>

            <!-- Form Body -->
            <form id="utpForm" class="bg-white p-5 sm:p-8 rounded-b-[40px] shadow-2xl border border-slate-100">
                <!-- Paso 1: Datos Generales -->
                <div id="utpStep1" class="utp-step space-y-8">
                    <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div class="form-group">
                            <label class="block text-xs font-black text-slate-400 uppercase mb-2">Colegio</label>
                            <select id="utpColegio" class="w-full bg-slate-50 border-none rounded-2xl p-4 text-sm font-bold focus:ring-4 focus:ring-indigo-500/10 outline-none transition-all" required></select>
                        </div>
                        <div class="form-group">
                            <label class="block text-xs font-black text-slate-400 uppercase mb-2">Docente</label>
                            <select id="utpDocente" class="w-full bg-slate-50 border-none rounded-2xl p-4 text-sm font-bold focus:ring-4 focus:ring-indigo-500/10 outline-none transition-all" required disabled></select>
                        </div>
                        <div class="form-group">
                            <label class="block text-xs font-black text-slate-400 uppercase mb-2">Curso</label>
                            <select id="utpCurso" class="w-full bg-slate-50 border-none rounded-2xl p-4 text-sm font-bold focus:ring-4 focus:ring-indigo-500/10 outline-none transition-all" required></select>
                        </div>
                        <div class="form-group">
                            <label class="block text-xs font-black text-slate-400 uppercase mb-2">Asignatura</label>
                            <select id="utpAsignatura" class="w-full bg-slate-50 border-none rounded-2xl p-4 text-sm font-bold focus:ring-4 focus:ring-indigo-500/10 outline-none transition-all" required></select>
                        </div>
                        <div class="form-group">
                            <label class="block text-xs font-black text-slate-400 uppercase mb-2">Fecha</label>
                            <input type="date" id="utpFecha" class="w-full bg-slate-50 border-none rounded-2xl p-4 text-sm font-bold focus:ring-4 focus:ring-indigo-500/10 outline-none transition-all" required>
                        </div>
                        <div class="form-group">
                            <label class="block text-xs font-black text-slate-400 uppercase mb-2">Duración (min)</label>
                            <input type="number" id="utpDuracion" placeholder="Ej: 45" class="w-full bg-slate-50 border-none rounded-2xl p-4 text-sm font-bold focus:ring-4 focus:ring-indigo-500/10 outline-none transition-all">
                        </div>
                    </div>
                </div>

                <!-- Pasos 2, 3, 4: Dimensiones -->
                <div id="utpStep2" class="utp-step hidden"><div id="utpDim1Container"></div></div>
                <div id="utpStep3" class="utp-step hidden"><div id="utpDim2Container"></div></div>
                <div id="utpStep4" class="utp-step hidden">
                    <div id="utpDim3Container"></div>
                    <div class="mt-8 p-6 bg-slate-50 rounded-3xl border border-slate-100">
                        <label class="block text-xs font-black text-slate-400 uppercase mb-3 ml-2">Observaciones generales no descritas</label>
                        <textarea id="utpObservacionesGenerales" class="w-full bg-white border-none rounded-2xl p-4 text-sm font-medium focus:ring-4 focus:ring-indigo-500/10 outline-none transition-all min-h-[100px]" placeholder="Escriba observaciones adicionales aquí..."></textarea>
                    </div>
                </div>

                <!-- Paso 5: Retroalimentación Descriptiva -->
                <div id="utpStep5" class="utp-step hidden space-y-8">
                    <div class="bg-indigo-50/30 p-5 sm:p-8 rounded-[28px] sm:rounded-[40px] border border-indigo-100">
                        <h4 class="text-2xl font-black text-indigo-900 mb-6">Retroalimentación Descriptiva</h4>
                        
                        <div class="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
                            <div class="form-group">
                                <label class="block text-xs font-black text-slate-400 uppercase mb-2 ml-2">Fecha Entrevista</label>
                                <input type="date" id="utpFechaEntrevista" class="w-full bg-white border-none rounded-2xl p-4 text-sm font-bold shadow-sm focus:ring-4 focus:ring-indigo-500/10 outline-none transition-all">
                            </div>
                            <div class="form-group">
                                <label class="block text-xs font-black text-slate-400 uppercase mb-2 ml-2">Hora Entrevista</label>
                                <input type="time" id="utpHoraEntrevista" class="w-full bg-white border-none rounded-2xl p-4 text-sm font-bold shadow-sm focus:ring-4 focus:ring-indigo-500/10 outline-none transition-all">
                            </div>
                        </div>

                        <div class="space-y-6">
                            <div class="form-group">
                                <label class="block text-xs font-black text-slate-400 uppercase mb-2 ml-2">Logros principales del docente según criterios</label>
                                <textarea id="utpLogros" class="w-full bg-white border-none rounded-2xl p-4 text-sm font-medium shadow-sm focus:ring-4 focus:ring-indigo-500/10 outline-none transition-all min-h-[100px]" placeholder="Describa los logros observados..."></textarea>
                            </div>
                            <div class="form-group">
                                <label class="block text-xs font-black text-slate-400 uppercase mb-2 ml-2">Aspectos principales a mejorar según criterios</label>
                                <textarea id="utpMejoras" class="w-full bg-white border-none rounded-2xl p-4 text-sm font-medium shadow-sm focus:ring-4 focus:ring-indigo-500/10 outline-none transition-all min-h-[100px]" placeholder="Describa aspectos a fortalecer..."></textarea>
                            </div>
                            <div class="form-group">
                                <label class="block text-xs font-black text-slate-400 uppercase mb-2 ml-2">Síntesis y Acuerdos con docente / Seguimiento próxima visita</label>
                                <textarea id="utpSintesisAcuerdos" class="w-full bg-white border-none rounded-2xl p-4 text-sm font-medium shadow-sm focus:ring-4 focus:ring-indigo-500/10 outline-none transition-all min-h-[120px]" placeholder="Resumen final y compromisos..."></textarea>
                            </div>
                        </div>
                    </div>
                </div>

                <!-- Paso 6: Plan Estratégico de Cambios -->
                <div id="utpStep6" class="utp-step hidden space-y-8">
                    <div class="bg-indigo-900 p-5 sm:p-8 rounded-[28px] sm:rounded-[40px] shadow-2xl shadow-indigo-900/20">
                        <div class="flex items-center justify-between mb-8">
                            <h4 class="text-2xl font-black text-white flex items-center gap-3">
                                <span class="bg-white/20 p-2 rounded-xl"><i class="fas fa-rocket"></i></span>
                                Plan Estratégico de Cambios
                            </h4>
                            <button type="button" id="btnUtpAddPlan" onclick="app.addUtpPlanRow()" class="bg-indigo-500 text-white px-6 py-3 rounded-2xl text-xs font-black uppercase tracking-widest shadow-lg hover:bg-indigo-400 hover:scale-105 active:scale-95 transition-all">
                                + Agregar Cambio
                            </button>
                        </div>
                        
                        <div id="utpPlanTableBody" class="space-y-5"></div>
                    </div>
                </div>

                <!-- Footer de Navegación -->
                <div class="mt-10 sm:mt-12 flex flex-wrap justify-between items-center gap-3 bg-slate-50 p-4 sm:p-6 rounded-[28px] sm:rounded-[32px]">
                    <button type="button" id="btnUtpPrev" onclick="app.prevStep()" class="hidden text-slate-400 font-black text-sm px-6 py-2 hover:text-slate-600 transition-colors uppercase tracking-widest text-center">
                        ← Anterior
                    </button>
                    <div class="flex-1 flex justify-center">
                        <button type="button" id="btnUtpFinishEarly" onclick="app.nextStep(true)" class="hidden text-amber-600 font-black text-[10px] px-6 py-2 hover:bg-amber-50 rounded-xl transition-all uppercase tracking-widest border border-amber-200">
                             Finalizar ahora
                        </button>
                    </div>
                    <button type="button" id="btnUtpNext" onclick="app.nextStep()" class="bg-indigo-600 text-white px-8 py-4 rounded-2xl font-black shadow-xl shadow-indigo-600/20 hover:bg-indigo-700 transition-all flex items-center gap-3">
                        <span id="btnUtpNextText">SIGUIENTE</span>
                        <i id="btnUtpNextIcon" class="fas fa-arrow-right text-xs opacity-50"></i>
                    </button>
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
}
