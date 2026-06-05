import { api } from '../api.js';
import { state, setState } from '../state.js';
import { mostrarLoading, showAlert, getInterpretacion, formatFecha, getBadgeClass } from '../utils.js';

// Cache for all evaluaciones to avoid re-fetching on filter change
let _allEvaluaciones = null;
let _sortConfig = { column: 'fecha', direction: 'desc' };

const LIDERAZGO_PLANTILLA_ID = 1;

export async function loadEvaluaciones(forceReload = false) {
    const tbody = document.getElementById('evaluacionesBody');
    if (!tbody) return;

    try {
        if (forceReload) _allEvaluaciones = null;
        
        if (!_allEvaluaciones) {
            const todas = await api.evaluaciones.getAll();
            // Solo acompañamientos del módulo Liderazgo (plantilla de liderazgo).
            // Las visitas (otras plantillas) usan formularios distintos y no van en esta tabla.
            // Los registros antiguos sin plantilla_id se consideran de Liderazgo.
            _allEvaluaciones = todas.filter(e => (e.plantilla_id ?? LIDERAZGO_PLANTILLA_ID) === LIDERAZGO_PLANTILLA_ID);
            // Load colegios filter the first time
            await loadColegiosForEvalFilter();
        }
        renderEvaluaciones(_allEvaluaciones);
    } catch (error) {
        tbody.innerHTML = `<tr><td colspan="8" class="text-center text-danger">Error: ${error.message}</td></tr>`;
    }
}

export function sortData(column) {
    if (_sortConfig.column === column) {
        _sortConfig.direction = _sortConfig.direction === 'asc' ? 'desc' : 'asc';
    } else {
        _sortConfig.column = column;
        _sortConfig.direction = 'asc';
    }
    
    if (_allEvaluaciones) {
        renderEvaluaciones(_allEvaluaciones);
    }
}

export async function loadColegiosForEvalFilter() {
    const select = document.getElementById('filterColegioEval');
    if (!select || select.options.length > 1) return; // Already loaded
    try {
        const colegios = await api.colegios.getAll();
        colegios.forEach(c => {
            const opt = document.createElement('option');
            opt.value = c.id;
            opt.textContent = c.nombre;
            select.appendChild(opt);
        });
    } catch (e) { console.error('Error cargando colegios para filtro:', e); }
}

function renderEvaluaciones(data) {
    const tbody = document.getElementById('evaluacionesBody');
    if (!tbody) return;

    // Apply filters
    const filterColegioEl = document.getElementById('filterColegioEval');
    const filterDocenteEl = document.getElementById('filterDocenteEval');
    const filterDesdeEl   = document.getElementById('filterFechaDesdeEval');
    const filterHastaEl   = document.getElementById('filterFechaHastaEval');

    const filterColegio  = filterColegioEl?.value || '';
    const filterDocente  = (filterDocenteEl?.value || '').toLowerCase();
    const filterDesde    = filterDesdeEl?.value || '';
    const filterHasta    = filterHastaEl?.value || '';

    let filtered = [...data];
    
    // Sorting
    filtered.sort((a, b) => {
        let valA = a[_sortConfig.column];
        let valB = b[_sortConfig.column];
        
        // Handle nulls
        if (valA === null || valA === undefined) valA = '';
        if (valB === null || valB === undefined) valB = '';
        
        if (typeof valA === 'string') valA = valA.toLowerCase();
        if (typeof valB === 'string') valB = valB.toLowerCase();
        
        if (valA < valB) return _sortConfig.direction === 'asc' ? -1 : 1;
        if (valA > valB) return _sortConfig.direction === 'asc' ? 1 : -1;
        return 0;
    });

    if (filterColegio)  filtered = filtered.filter(e => String(e.colegio_id) === filterColegio);
    if (filterDocente)  filtered = filtered.filter(e => (e.docente_nombre || '').toLowerCase().includes(filterDocente));
    if (filterDesde)    filtered = filtered.filter(e => e.fecha >= filterDesde);
    if (filterHasta)    filtered = filtered.filter(e => e.fecha <= filterHasta);

    if (filtered.length === 0) {
        tbody.innerHTML = '<tr><td colspan="8" class="text-center">No se encontraron acompañamientos</td></tr>';
        return;
    }

    tbody.innerHTML = filtered.map(e => `
        <tr>
            <td style="font-weight: 700; color: var(--primary);">#${e.id}</td>
            <td>${formatFecha(e.fecha)}</td>
            <td>
                <div style="font-weight: 600;">${e.docente_nombre || '-'}</div>
            </td>
            <td>${e.colegio_nombre || '-'}</td>
            <td class="text-center">
                <span class="avg-badge ${getBadgeClass(e.promedio)}">${e.promedio ? Number(e.promedio).toFixed(2) : '-.--'}</span>
            </td>
            <td class="text-center">
                <span class="nivel-badge ${getBadgeClass(e.promedio)}">${getInterpretacion(e.promedio)}</span>
            </td>
            <td class="text-center">${getStatusBadge(e.estado)}</td>
            <td class="text-right">
                <div class="actions" style="display: flex; gap: 5px; justify-content: flex-end;">
                    <button class="btn btn-sm" onclick="window.app.verDetalle(${e.id})" title="Ver Resumen" 
                            style="background: #0ea5e9; color: white; width: 32px; height: 32px; padding: 0;">
                        <i class="fas fa-eye"></i>
                    </button>
                    <button class="btn btn-sm" onclick="window.app.verFormularioSoloLectura(${e.id})" title="Ver Formulario Original" 
                            style="background: #475569; color: white; width: 32px; height: 32px; padding: 0;">
                        <i class="fas fa-file-contract"></i>
                    </button>
                    ${parseInt(localStorage.getItem('userRole')) === 1 ? `
                        <button class="btn btn-sm" onclick="window.app.deleteEvaluacion(${e.id})" title="Eliminar" 
                                style="background: #ef4444; color: white; width: 32px; height: 32px; padding: 0;">
                            <i class="fas fa-trash-alt"></i>
                        </button>
                    ` : ''}
                    ${e.estado === 'CERRADA' && parseInt(localStorage.getItem('userRole')) !== 1 ? `
                        <span title="Pauta protegida (firmada)" style="opacity: 0.3; padding: 5px; color: var(--primary);"><i class="fas fa-lock"></i></span>
                    ` : ''}
                </div>
            </td>
        </tr>
    `).join('');
}

function getStatusBadge(estado) {
    const st = String(estado || 'BORRADOR').toUpperCase();
    let label = st;
    let className = 'badge-status-borrador';

    switch (st) {
        case 'BORRADOR': 
            label = 'Borrador'; 
            className = 'badge-status-borrador'; 
            break;
        case 'LISTO_PARA_FIRMA': 
            label = 'Para Firma'; 
            className = 'badge-status-listo'; 
            break;
        case 'FIRMADA_DOCENTE': 
            label = 'Firmada'; 
            className = 'badge-status-firmada'; 
            break;
        case 'CERRADA': 
            label = 'Cerrada'; 
            className = 'badge-status-cerrada'; 
            break;
    }

    return `<span class="badge ${className}">${label}</span>`;
}

export function limpiarFiltrosEval() {
    const ids = ['filterColegioEval','filterDocenteEval','filterFechaDesdeEval','filterFechaHastaEval'];
    ids.forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
    if (_allEvaluaciones) renderEvaluaciones(_allEvaluaciones);
}

export async function verFormularioSoloLectura(id) {
    try {
        mostrarLoading(true, 'Cargando formulario...');
        
        // Navegar a la página de formulario para asegurar una sección aparte
        if (window.app && window.app.navigateTo) {
            window.app.navigateTo('nueva-evaluacion');
        }

        await initEvaluacionForm(); // Resetear y cargar bases
        
        const evaluacion = await api.evaluaciones.getById(id);
        setState('currentEvalId', id); // Store current ID in state
        const e = evaluacion;

        // Llenar campos básicos (Diferente ID en HTML)
        const fechaEl = document.getElementById('fechaObservacion');
        if (fechaEl) fechaEl.value = e.fecha || '';
        
        const duracionEl = document.getElementById('duracion');
        if (duracionEl) duracionEl.value = e.duracion || '';

        const comentariosEl = document.getElementById('comentarios');
        if (comentariosEl) comentariosEl.value = e.comentarios || '';

        // Llenar selects (con await para asegurar carga de datos dependientes antes de asignar valor)
        const colegioSelect = document.getElementById('colegioSelect');
        const colId = e.docente?.colegio_id;
        if (colegioSelect && colId) {
            colegioSelect.value = colId;
            await loadDocentesByColegio(colId);
            const docenteSelect = document.getElementById('docenteSelect');
            if (docenteSelect && e.docente_id) docenteSelect.value = e.docente_id;
        }

        const nivelSelect = document.getElementById('nivelSelect');
        const nivId = e.curso?.nivel_id;
        if (nivelSelect && nivId) {
            nivelSelect.value = nivId;
            await loadCursosByNivel(nivId);
            const cursoSelect = document.getElementById('cursoSelect');
            if (cursoSelect && e.curso_id) cursoSelect.value = e.curso_id;
        }
        
        const asignaturaSelect = document.getElementById('asignaturaSelect');
        if (asignaturaSelect && e.asignatura_id) asignaturaSelect.value = e.asignatura_id;

        // Llenar Rúbrica
        if (e.respuestas) {
            e.respuestas.forEach(resp => {
                const radio = document.querySelector(`input[name="ind${resp.subdimension_id}"][value="${resp.valor}"]`);
                if (radio) radio.checked = true;
            });
            calcularPromedios();
        }

        // Llenar Radios Dinámicos
        if (e.func_grupo) {
            const radioFunc = document.querySelector(`input[name="funcGrupo"][value="${e.func_grupo}"]`);
            if (radioFunc) radioFunc.checked = true;
        }
        if (e.orientacion) {
            const radioOri = document.querySelector(`input[name="orientacion"][value="${e.orientacion}"]`);
            if (radioOri) radioOri.checked = true;
        }
        if (e.nivel_apoyo) {
            const radioApo = document.querySelector(`input[name="nivelApoyo"][value="${e.nivel_apoyo}"]`);
            if (radioApo) radioApo.checked = true;
        }

        // Llenar Checkboxes de Apoyo
        if (e.apoyos) {
            e.apoyos.forEach(ap => {
                const cb = document.querySelector(`.tipoApoyo[value="${ap.apoyo}"]`);
                if (cb) cb.checked = true;
            });
        }

        // Fortalezas y Aspectos
        if (e.fortalezas_aspectos) {
            const fort = e.fortalezas_aspectos.find(fa => fa.tipo === 'fortaleza');
            if (fort) document.getElementById('fortalezas').value = fort.contenido;
            
            const asp = e.fortalezas_aspectos.find(fa => fa.tipo === 'aspecto');
            if (asp) document.getElementById('aspectos').value = asp.contenido;
        }

        // SECCIÓN X: Psicología Organizacional
        const fechaRetroEl = document.getElementById('fechaRetroalimentacion');
        if (fechaRetroEl) fechaRetroEl.value = e.fecha_retro || '';

        if (e.modalidad_retro) {
            const mods = e.modalidad_retro.split(', ');
            mods.forEach(m => {
                const cb = document.querySelector(`input[name="modalidadRetro"][value="${m.trim()}"]`);
                if (cb) cb.checked = true;
            });
        }

        const sintesisRetroEl = document.getElementById('sintesisRetro');
        if (sintesisRetroEl) sintesisRetroEl.value = e.sintesis_retro || '';

        const acuerdosMejoraEl = document.getElementById('acuerdosMejora');
        if (acuerdosMejoraEl) acuerdosMejoraEl.value = e.acuerdos_mejora || '';

        // Deshabilitar campos (Excepto si es BORRADOR para campos específicos)
        const esBorrador = e.estado === 'BORRADOR';
        
        document.querySelectorAll('#evaluacionForm input, #evaluacionForm select, #evaluacionForm textarea').forEach(el => {
            // Campos permitidos en borrador
            const idPermitido = ['sintesisRetro', 'acuerdosMejora', 'comentarios', 'fortalezas', 'aspectos', 'fechaRetroalimentacion'].includes(el.id);
            const namePermitido = el.name === 'modalidadRetro';
            
            if (esBorrador && (idPermitido || namePermitido)) {
                el.disabled = false;
            } else {
                el.disabled = true;
            }
        });

        // Mostrar/Ocultar indicadores de campos editables en borrador
        document.querySelectorAll('.editable-marker').forEach(marker => {
            marker.style.display = esBorrador ? 'inline' : 'none';
        });

        // UI Adjustments
        const badge = document.getElementById('badgeEstado');
        if (badge) {
            badge.innerText = e.estado || 'BORRADOR';
            badge.style.display = 'inline-block';
            badge.style.background = esBorrador ? '#ffc107' : '#28a745';
            badge.style.color = esBorrador ? '#000' : '#fff';
        }

        const btnGuardar = document.getElementById('btnGuardarEvaluacion');
        if (btnGuardar) btnGuardar.style.display = 'none';
        // Configurar botones de acción para BORRADOR
        const btnGuardarBorrador = document.querySelector('#pageNuevaEvaluacion #btnGuardarBorrador');
        const btnFirmarBorrador = document.querySelector('#pageNuevaEvaluacion #btnFirmarBorrador');
        const btnAsignarFirma = document.querySelector('#pageNuevaEvaluacion #btnAsignarFirma');

        const esListoFirma = e.estado === 'LISTO_PARA_FIRMA';
        
        if (esBorrador || esListoFirma) {
            if (btnGuardarBorrador) {
                btnGuardarBorrador.style.display = esBorrador ? 'inline-block' : 'none';
                btnGuardarBorrador.dataset.evalId = evaluacion.id;
            }

            // Lógica de botones de firma
            // Siempre mostrar botón de Firma por Correo si está en Borrador o Listo para Firma
            const btnRemoteSignForm = document.querySelector('#pageNuevaEvaluacion #btnRemoteSignForm');
            if (btnRemoteSignForm) {
                btnRemoteSignForm.style.display = 'inline-block';
            }

            if (evaluacion.docente && evaluacion.docente.has_totp) {
                if (btnFirmarBorrador) {
                    btnFirmarBorrador.style.display = 'inline-block';
                    btnFirmarBorrador.dataset.evalId = evaluacion.id;
                    btnFirmarBorrador.innerHTML = '<span class="icon">✍️</span> Firma docente';
                }
                if (btnAsignarFirma) btnAsignarFirma.style.display = 'none';
            } else {
                if (btnFirmarBorrador) btnFirmarBorrador.style.display = 'none';
                if (btnAsignarFirma) {
                    btnAsignarFirma.style.display = 'inline-block';
                    btnAsignarFirma.dataset.docenteId = evaluacion.docente ? evaluacion.docente.id : '';
                }
            }
        } else {
            if (btnGuardarBorrador) btnGuardarBorrador.style.display = 'none';
            if (btnFirmarBorrador) btnFirmarBorrador.style.display = 'none';
            if (btnAsignarFirma) btnAsignarFirma.style.display = 'none';
            const btnRemoteSignForm = document.querySelector('#pageNuevaEvaluacion #btnRemoteSignForm');
            if (btnRemoteSignForm) btnRemoteSignForm.style.display = 'none';
        }

        // Habilitar campos editables si es BORRADOR
        
        const btnPdf = document.getElementById('btnDescargarFormulario');
        if (btnPdf) btnPdf.style.display = 'block';

        const btnSend = document.getElementById('btnEnviarCorreoDetalle');
        if (btnSend) btnSend.style.display = (e.estado === 'CERRADA') ? 'block' : 'none';

        document.querySelector('#tituloFormulario').textContent = `Detalle de Acompañamiento #${id} (Solo Lectura)`;
        
        // Mostrar aviso de firma si está CERRADA
        const signatureInfo = document.getElementById('signatureInfoForm');
        if (signatureInfo) {
            if (e.estado === 'CERRADA') {
                signatureInfo.innerHTML = `
                    <div style="background: #e7f3ff; color: #004085; padding: 12px 20px; border-radius: 8px; border: 1px solid #b8daff; margin-bottom: 20px; font-weight: 600; display: flex; flex-direction: column; gap: 5px;">
                        <div style="display: flex; align-items: center; gap: 10px;">
                            <span style="font-size: 1.2rem;">🛡️</span> Firmada digitalmente vía Google Authenticator
                        </div>
                        <div style="font-size: 0.85rem; padding-left: 32px; opacity: 0.9;">
                            <span>Este documento ya se encuentra firmado reglamentariamente.</span>
                        </div>
                    </div>
                `;
                signatureInfo.style.display = 'block';
            } else {
                signatureInfo.style.display = 'none';
            }
        }
        
        mostrarLoading(false);
        window.app.navigateTo('nueva-evaluacion', true);

    } catch (error) {
        mostrarLoading(false);
        showAlert('Error', `No se pudo cargar el formulario: ${error.message}`, 'error');
    }
}

export async function initEvaluacionForm() {
    try {
        mostrarLoading(true, 'Iniciando formulario de acompañamiento...');
        
        // Reset del estado del formulario (por si viene de solo lectura)
        const form = document.getElementById('evaluacionForm');
        if (form) {
            form.reset();
            const elements = form.querySelectorAll('input, select, textarea');
            elements.forEach(el => el.disabled = false);
            const markers = document.querySelectorAll('.editable-marker');
            markers.forEach(m => m.style.display = 'none');
        }
        const btnGuardar = document.getElementById('btnGuardarEvaluacion');
        if (btnGuardar) btnGuardar.style.display = 'inline-block';
        
        // Ocultar botones avanzados
        const buttonsToHide = [
            'btnImprimirFormulario',
            'btnDescargarFormulario',
            'btnGuardarBorrador',
            'btnFirmarBorrador',
            'btnAsignarFirma',
            'btnRemoteSignForm',
            'btnEnviarCorreoDetalle',
            'badgeEstado',
            'signatureInfoForm'
        ];
        
        buttonsToHide.forEach(id => {
            const btn = document.getElementById(id);
            if (btn) btn.style.display = 'none';
        });

        const titleH1 = document.getElementById('tituloFormulario');
        if (titleH1) titleH1.textContent = 'Nuevo Acompañamiento';

        // Cargar datos para selects
        const [colegios, niveles, cursos, asignaturas] = await Promise.all([
            api.colegios.getAll(),
            api.niveles.getAll(),
            api.cursos.getAll(),
            api.asignaturas.getAll()
        ]);

        setState('colegios', colegios);
        setState('niveles', niveles);
        setState('cursos', cursos);
        setState('asignaturas', asignaturas);

        // Solo poblar si no es rol usuario
        populateSelect('colegioSelect', colegios, 'Seleccione Colegio...');
        populateSelect('nivelSelect', niveles, 'Seleccione Nivel...');
        populateSelect('asignaturaSelect', asignaturas, 'Seleccione Asignatura...');
        
        // Auto-asignar observador desde el usuario logueado
        const obsDisplay = document.getElementById('observadorDisplay');
        const obsSelect = document.getElementById('observadorSelect');
        if (state.currentUser) {
            if (obsDisplay) obsDisplay.value = `${state.currentUser.username} (${state.currentUser.id})`;
            if (obsSelect) obsSelect.value = state.currentUser.id;
        }

        // Habilitar selects que no dependen de otros
        document.getElementById('nivelSelect').disabled = false;
        document.getElementById('asignaturaSelect').disabled = false;

        // Eventos de filtrado en el form
        document.getElementById('colegioSelect').onchange = (e) => loadDocentesByColegio(e.target.value);
        document.getElementById('nivelSelect').onchange = (e) => loadCursosByNivel(e.target.value);

        await loadDimensionesRubric();
        mostrarLoading(false);
    } catch (error) {
        mostrarLoading(false);
        showAlert('Error', 'No se pudo cargar el formulario: ' + error.message, 'error');
    }
}

function populateSelect(id, items, placeholder) {
    const select = document.getElementById(id);
    if (!select) return;
    select.innerHTML = `<option value="">${placeholder}</option>`;
    items.forEach(item => {
        const opt = document.createElement('option');
        opt.value = item.id;
        opt.textContent = item.nombre || (item.nivel?.nombre + ' ' + item.letra);
        select.appendChild(opt);
    });
}

async function loadDocentesByColegio(colegioId) {
    const select = document.getElementById('docenteSelect');
    if (!select) return;
    if (!colegioId) {
        select.innerHTML = '<option value="">Primero seleccione un colegio</option>';
        select.disabled = true;
        return;
    }

    try {
        select.disabled = false;
        select.innerHTML = '<option value="">Cargando docentes...</option>';
        const docentes = await api.docentes.getAll(colegioId);
        select.innerHTML = '<option value="">Seleccione Docente...</option>';
        const filtrados = docentes.filter(d => d.colegio_id === parseInt(colegioId));
        filtrados.forEach(d => {
            const opt = document.createElement('option');
            opt.value = d.id;
            opt.textContent = `${d.nombre} (${d.rut})`;
            select.appendChild(opt);
        });
    } catch (error) {
        console.error('Error cargando docentes:', error);
    }
}

async function loadCursosByNivel(nivelId) {
    const select = document.getElementById('cursoSelect');
    if (!select) return;
    if (!nivelId) {
        select.innerHTML = '<option value="">Primero seleccione un nivel</option>';
        select.disabled = true;
        return;
    }

    try {
        select.disabled = false;
        select.innerHTML = '<option value="">Cargando cursos...</option>';
        const cursos = await api.cursos.getAll();
        select.innerHTML = '<option value="">Seleccione Curso...</option>';
        const filtrados = cursos.filter(c => c.nivel_id === parseInt(nivelId));
        filtrados.forEach(c => {
            const opt = document.createElement('option');
            opt.value = c.id;
            opt.textContent = `${c.nivel.nombre} ${c.letra}`;
            select.appendChild(opt);
        });
    } catch (error) {
        console.error('Error cargando cursos:', error);
    }
}

export async function loadDimensionesRubric() {
    const container = document.getElementById('rubricContainer');
    if (!container) return;
    container.innerHTML = '<div class="text-center p-4"><div class="spinner"></div><p>Cargando rúbrica...</p></div>';

    try {
        const dims = await api.plantillas.getDimensiones(LIDERAZGO_PLANTILLA_ID);
        setState('dimensiones', dims);
        
        let html = '';
        let totalIndicadores = 0;

        dims.forEach((dim, dimIndex) => {
            const dimNum = dimIndex + 1;
            html += `
                <div class="dimension-card">
                    <div class="dimension-header">
                        <h3>DIMENSIÓN ${dimNum}: ${dim.nombre}</h3>
                        <div class="dim-score-pill">Promedio: <span id="promedioDim${dimNum}">0.00</span></div>
                    </div>
                    <div class="dimension-body">
            `;

            dim.subdimensiones.forEach((sub, subIndex) => {
                totalIndicadores++;
                html += `
                    <div class="indicador-row">
                        <div class="indicador-info">
                            <h4>${totalIndicadores}. ${sub.nombre}</h4>
                            <p>${sub.descripcion || ''}</p>
                        </div>
                        <div class="score-selection-panel">
                            <div class="score-options">
                                <label class="score-opt">
                                    <input type="radio" name="ind${sub.id}" value="0" required>
                                    <div class="score-circle na">N/A</div>
                                </label>
                                ${[1, 2, 3, 4, 5].map(v => `
                                    <label class="score-opt">
                                        <input type="radio" name="ind${sub.id}" value="${v}" required>
                                        <div class="score-circle">${v}</div>
                                    </label>
                                `).join('')}
                            </div>
                            <div class="score-hint" id="hint-ind${sub.id}">Seleccione puntaje o N/A</div>
                        </div>
                    </div>
                `;
            });

            html += `
                    </div>
                </div>
            `;
        });

        container.innerHTML = `<div class="rubric-container">${html}</div>`;

        container.querySelectorAll('input[type="radio"]').forEach(radio => {
            radio.addEventListener('change', (e) => {
                const val = e.target.value;
                const name = e.target.name;
                const hintEl = document.getElementById(`hint-${name}`);
                if (hintEl) {
                    const texts = {
                        '0': 'N/A - No Aplica',
                        '1': '1 - Bajo',
                        '2': '2 - En Desarrollo',
                        '3': '3 - Adecuado',
                        '4': '4 - Alto',
                        '5': '5 - Muy Alto'
                    };
                    hintEl.textContent = texts[val] || '';
                    hintEl.classList.add('active');
                }
                calcularPromedios();
            });
        });
    } catch (error) {
        console.error('Error cargando rúbrica:', error);
        container.innerHTML = `<div class="alert alert-danger">Error: ${error.message}</div>`;
    }
}

export function calcularPromedios() {
    const { dimensiones } = state;
    const resultados = {};
    let totalSuma = 0;
    let totalCount = 0;

    dimensiones.forEach((dim, dimIndex) => {
        const dimNum = dimIndex + 1;
        let dimSuma = 0;
        let dimCount = 0;

        dim.subdimensiones.forEach(sub => {
            const selected = document.querySelector(`input[name="ind${sub.id}"]:checked`);
            if (selected) {
                const val = parseInt(selected.value);
                if (val > 0) {
                    dimSuma += val;
                    dimCount++;
                    totalSuma += val;
                    totalCount++;
                }
            }
        });

        const dimPromedio = dimCount > 0 ? (dimSuma / dimCount) : null;
        resultados[`promedio_dim${dimNum}`] = dimPromedio;
        
        const promedioEl = document.getElementById(`promedioDim${dimNum}`);
        if (promedioEl) {
            promedioEl.textContent = dimPromedio !== null ? dimPromedio.toFixed(2) : 'N/A';
            // Aplicar clase de semáforo a la píldora
            const pill = promedioEl.closest('.dim-score-pill');
            if (pill) {
                pill.className = 'dim-score-pill ' + getBadgeClass(dimPromedio);
            }
        }
    });

    const promedioTotal = totalCount > 0 ? (totalSuma / totalCount) : null;
    const display = document.getElementById('promedioDisplay');
    if (display) display.textContent = promedioTotal !== null ? promedioTotal.toFixed(2) : 'N/A';

    const interpretacionEl = document.getElementById('interpretacionText');
    if (interpretacionEl) {
        if (promedioTotal !== null) {
            const intText = getInterpretacion(promedioTotal);
            interpretacionEl.textContent = intText;
            interpretacionEl.style.fontWeight = 'bold';
            
            // AUTOMATIZACIÓN: Seleccionar Orientación para el Desarrollo
            if (promedioTotal >= 4.0) {
                const radio = document.querySelector('input[name="orientacion"][value="Docente referente"]');
                if (radio) radio.checked = true;
                const radioApoyo = document.querySelector('input[name="nivelApoyo"][value="No requiere"]');
                if (radioApoyo) radioApoyo.checked = true;
            } else if (promedioTotal >= 3.0) {
                const radio = document.querySelector('input[name="orientacion"][value="Buen desempeño"]');
                if (radio) radio.checked = true;
                const radioApoyo = document.querySelector('input[name="nivelApoyo"][value="Requiere acompañamiento"]');
                if (radioApoyo) radioApoyo.checked = true;
            } else if (promedioTotal >= 2.0) {
                const radio = document.querySelector('input[name="orientacion"][value="En desarrollo"]');
                if (radio) radio.checked = true;
                const radioApoyo = document.querySelector('input[name="nivelApoyo"][value="Requiere acompañamiento"]');
                if (radioApoyo) radioApoyo.checked = true;
            } else {
                const radio = document.querySelector('input[name="orientacion"][value="Requiere acompañamiento"]');
                if (radio) radio.checked = true;
                const radioApoyo = document.querySelector('input[name="nivelApoyo"][value="Prioritario"]');
                if (radioApoyo) radioApoyo.checked = true;
            }
        } else {
            interpretacionEl.textContent = 'Complete todos los indicadores';
            interpretacionEl.style.fontWeight = 'normal';
        }
    }

    return { promedioTotal, resultados, totalCount };
}

export async function guardarCambiosBorrador(evalIdArg) {
    try {
        const evalId = evalIdArg || document.getElementById('btnGuardarBorrador')?.dataset?.evalId;
        if (!evalId) {
            showAlert('Error', 'No se encontró el ID de la evaluación para guardar.', 'error');
            return;
        }

        mostrarLoading(true, 'Guardando cambios del borrador...');

        const findVisibleVal = (id1, id2) => {
            const el1 = document.getElementById(id1);
            if (el1 && el1.offsetParent !== null) return el1.value;
            const el2 = document.getElementById(id2);
            if (el2 && el2.offsetParent !== null) return el2.value;
            return null;
        };

        const updateData = {};
        
        const sVal = findVisibleVal('sintesisRetroBorrador', 'sintesisRetro');
        if (sVal !== null) updateData.sintesis_retro = sVal;

        const aVal = findVisibleVal('acuerdosMejoraBorrador', 'acuerdosMejora');
        if (aVal !== null) updateData.acuerdos_mejora = aVal;

        const cVal = findVisibleVal('comentariosBorrador', 'comentarios');
        if (cVal !== null) updateData.comentarios = cVal;

        // Captura directa de Fecha de Retroalimentación (Cualquiera que tenga valor)
        const fechaVal = document.getElementById('fechaRetroBorrador')?.value || document.getElementById('fechaRetroalimentacion')?.value;
        if (fechaVal) {
            updateData.fecha_retro = fechaVal;
        }

        // Captura de Modalidad
        const modBorrador = document.getElementById('modalidadRetroBorrador')?.value;
        if (modBorrador) {
            updateData.modalidad_retro = modBorrador;
        } else {
            const checks = document.querySelectorAll('input[name="modalidadRetro"]:checked');
            if (checks.length > 0) {
                updateData.modalidad_retro = Array.from(checks).map(cb => cb.value).join(', ');
            }
        }

        console.log('DEBUG: Preparando guardado de borrador...', updateData);

        const fEl = document.getElementById('fortalezasBorrador') || document.getElementById('fortalezas');
        const aEl = document.getElementById('aspectosBorrador') || document.getElementById('aspectos');
        
        // Para fortalezas/aspectos, verificamos visibilidad del primero encontrado
        const visibleF = (fEl && fEl.offsetParent !== null) ? fEl : null;
        const visibleA = (aEl && aEl.offsetParent !== null) ? aEl : null;

        if (visibleF || visibleA) {
            updateData.fortalezas_aspectos = [];
            if (visibleF) updateData.fortalezas_aspectos.push({ tipo: 'fortaleza', contenido: visibleF.value.trim() });
            if (visibleA) updateData.fortalezas_aspectos.push({ tipo: 'aspecto', contenido: visibleA.value.trim() });
        }

        console.log('SISTEMA V3.4 - Datos:', updateData);
        
        const preview = `¿Guardar cambios? (V3.4)\n\n` + 
                       `- Síntesis: ${(updateData.sintesis_retro || '').substring(0, 30)}...\n` +
                       `- Comentarios: ${(updateData.comentarios || '').substring(0, 30)}...\n` +
                       `- Fortalezas: ${updateData.fortalezas_aspectos ? updateData.fortalezas_aspectos.length : 0} items`;
        
        if (!confirm(preview)) {
            mostrarLoading(false);
            return;
        }

        const evaluacion = await api.evaluaciones.update(evalId, updateData);
        mostrarLoading(false);
        
        showAlert('Éxito (V3.4)', 'El borrador ha sido actualizado correctamente.', 'success');
        setTimeout(() => location.reload(), 1500);

    } catch (error) {
        console.error('Error:', error);
        mostrarLoading(false);
        showAlert('Error', 'No se pudieron guardar los cambios: ' + error.message, 'error');
    }
}


export async function guardarEvaluacion(event) {
    if (event) event.preventDefault();
    const { promedioTotal, resultados, totalCount } = calcularPromedios();

    if (totalCount === 0) {
        showAlert('Error', 'Debe responder al menos un indicador', 'warning');
        return;
    }

    const respuestas = [];
    document.querySelectorAll('#rubricContainer input[type="radio"]:checked').forEach(r => {
        respuestas.push({
            subdimension_id: parseInt(r.name.replace('ind', '')),
            valor: parseInt(r.value)
        });
    });

    const obsId = parseInt(document.getElementById('observadorSelect').value);
    if (isNaN(obsId)) {
        showAlert('Error', 'El campo Observador es obligatorio y debe tener un valor válido.', 'warning');
        return;
    }

    const data = {
        plantilla_id: LIDERAZGO_PLANTILLA_ID,
        docente_id: parseInt(document.getElementById('docenteSelect').value),
        curso_id: parseInt(document.getElementById('cursoSelect').value),
        asignatura_id: parseInt(document.getElementById('asignaturaSelect').value),
        observador_id: obsId,
        fecha: document.getElementById('fechaObservacion').value,
        duracion: document.getElementById('duracion').value,
        func_grupo: document.querySelector('input[name="funcGrupo"]:checked')?.value || '',
        promedio: promedioTotal,
        promedio_dim1: resultados.promedio_dim1,
        promedio_dim2: resultados.promedio_dim2,
        promedio_dim3: resultados.promedio_dim3,
        promedio_dim4: resultados.promedio_dim4,
        promedio_dim5: resultados.promedio_dim5,
        orientacion: document.querySelector('input[name="orientacion"]:checked')?.value || '',
        nivel_apoyo: document.querySelector('input[name="nivelApoyo"]:checked')?.value || '',
        comentarios: document.getElementById('comentarios').value,
        // Sección X: Psicología Organizacional
        fecha_retro: document.getElementById('fechaRetroalimentacion')?.value || null,
        modalidad_retro: Array.from(document.querySelectorAll('input[name="modalidadRetro"]:checked')).map(cb => cb.value).join(', '),
        sintesis_retro: document.getElementById('sintesisRetro')?.value || '',
        acuerdos_mejora: document.getElementById('acuerdosMejora')?.value || '',
        respuestas,
        apoyos: Array.from(document.querySelectorAll('.tipoApoyo:checked')).map(cb => ({ apoyo: cb.value })),
        fortalezas_aspectos: [
            ...(document.getElementById('fortalezas').value.trim() ? [{ tipo: 'fortaleza', contenido: document.getElementById('fortalezas').value.trim() }] : []),
            ...(document.getElementById('aspectos').value.trim() ? [{ tipo: 'aspecto', contenido: document.getElementById('aspectos').value.trim() }] : [])
        ]
    };

    try {
        mostrarLoading(true, 'Guardando acompañamiento...');
        const evaluacion = await api.evaluaciones.create(data);
        _allEvaluaciones = null; // Limpiar caché
        mostrarLoading(false);
        
        // Mostrar modal de éxito personalizado
        import('./ui.js').then(ui => {
            const body = `
                <div class="text-center" style="padding: 20px;">
                    <div style="font-size: 3.5rem; margin-bottom: 20px;">✅</div>
                    <h3 style="color: #004080; margin-bottom: 10px; font-weight: 700;">¡Guardado Exitosamente!</h3>
                    <p style="color: #64748b; margin-bottom: 25px; font-size: 1.1rem;">El acompañamiento ha sido registrado correctamente en el sistema.</p>
                    
                    <div style="display: flex; flex-direction: column; gap: 12px; max-width: 300px; margin: 0 auto;">
                        <button class="btn btn-primary" onclick="window.app.closeModal(); window.app.navigateTo('evaluaciones');" 
                                style="background: #004080; padding: 12px; font-weight: 600; border-radius: 8px;">
                            📁 Ir a Mis Acompañamientos
                        </button>
                        <button class="btn btn-secondary" onclick="window.app.closeModal(); window.app.verDetalle(${evaluacion.id});"
                                style="padding: 10px; font-weight: 500; background: #f1f5f9; color: #475569; border: 1px solid #e2e8f0;">
                            Ver Detalles / Resumen
                        </button>
                    </div>
                </div>
            `;
            ui.showGenericModal('Operación Exitosa', body);
        });
    } catch (error) {
        mostrarLoading(false);
        showAlert('Error', error.message, 'error');
    }
}

export async function verDetalle(id) {
    try {
        mostrarLoading(true, 'Cargando detalle...');
        const evaluacion = await api.evaluaciones.getById(id);
        setState('currentEvalId', id); // Guardar ID actual
        mostrarLoading(false);
        
        // Navegar a la página de resumen
        if (window.app && window.app.navigateTo) {
            window.app.navigateTo('resumen-evaluacion');
        }
        
        mostrarResumen(evaluacion);
    } catch (error) {
        mostrarLoading(false);
        showAlert('Error', error.message, 'error');
    }
}

export async function resumeEditingDraft(id) {
    try {
        mostrarLoading(true, 'Cargando borrador...');
        const evaluacion = await api.evaluaciones.getById(id);
        
        // 1. Inicializar formulario (esto resetea y carga combos básicos)
        await initEvaluacionForm();
        
        // 2. Navegar a la página de formulario
        if (window.app && window.app.navigateTo) {
            window.app.navigateTo('nueva-evaluacion');
        }
        
        // 3. Poblar Antecedentes
        const form = document.getElementById('evaluacionForm');
        if (!form) throw new Error('No se encontró el formulario');
        
        // Colegio
        if (evaluacion.docente?.colegio_id) {
            const colegioSelect = document.getElementById('colegioSelect');
            if (colegioSelect) {
                colegioSelect.value = evaluacion.docente.colegio_id;
                // Cargar docentes para ese colegio y esperar
                await loadDocentesByColegio(evaluacion.docente.colegio_id);
            }
        }
        
        // Docente
        if (evaluacion.docente_id) {
            const docenteSelect = document.getElementById('docenteSelect');
            if (docenteSelect) docenteSelect.value = evaluacion.docente_id;
        }
        
        // Nivel y Curso
        if (evaluacion.curso?.nivel_id) {
            const nivelSelect = document.getElementById('nivelSelect');
            if (nivelSelect) {
                nivelSelect.value = evaluacion.curso.nivel_id;
                await loadCursosByNivel(evaluacion.curso.nivel_id);
            }
        }
        if (evaluacion.curso_id) {
            const cursoSelect = document.getElementById('cursoSelect');
            if (cursoSelect) cursoSelect.value = evaluacion.curso_id;
        }
        
        // Asignatura
        if (evaluacion.asignatura_id) {
            const asignaturaSelect = document.getElementById('asignaturaSelect');
            if (asignaturaSelect) asignaturaSelect.value = evaluacion.asignatura_id;
        }
        
        // Fecha y Duración
        if (evaluacion.fecha) {
            const dateInput = document.getElementById('fechaObservacion');
            if (dateInput) dateInput.value = evaluacion.fecha.split('T')[0];
        }
        if (evaluacion.duracion) {
            const durInput = document.getElementById('duracion');
            if (durInput) durInput.value = evaluacion.duracion;
        }
        
        // 4. Poblar Rúbrica (Respuestas)
        (evaluacion.respuestas || []).forEach(resp => {
            const radio = form.querySelector(`input[name="ind${resp.subdimension_id}"][value="${resp.valor}"]`);
            if (radio) {
                radio.checked = true;
                // Disparar el evento change para que se actualicen los "hints"
                radio.dispatchEvent(new Event('change'));
            }
        });
        
        // 5. Funcionamiento Grupo
        if (evaluacion.func_grupo) {
            const radioFunc = form.querySelector(`input[name="funcGrupo"][value="${evaluacion.func_grupo}"]`);
            if (radioFunc) radioFunc.checked = true;
        }
        
        // 6. Fortalezas y Aspectos
        const fortalezasText = (evaluacion.fortalezas_aspectos || [])
            .filter(fa => fa.tipo === 'FORTALEZA')
            .map(fa => fa.contenido).join('\n');
        const aspectosText = (evaluacion.fortalezas_aspectos || [])
            .filter(fa => fa.tipo === 'ASPECTO')
            .map(fa => fa.contenido).join('\n');
            
        const fortInput = document.getElementById('fortalezas');
        const aspInput = document.getElementById('aspectos');
        if (fortInput) fortInput.value = fortalezasText;
        if (aspInput) aspInput.value = aspectosText;
        
        // 7. Orientación y Apoyo
        if (evaluacion.orientacion) {
            const radioOri = form.querySelector(`input[name="orientacion"][value="${evaluacion.orientacion}"]`);
            if (radioOri) radioOri.checked = true;
        }
        if (evaluacion.nivel_apoyo) {
            const radioApoyo = form.querySelector(`input[name="nivelApoyo"][value="${evaluacion.nivel_apoyo}"]`);
            if (radioApoyo) radioApoyo.checked = true;
        }
        
        // Tipo Apoyo (Checkboxes)
        const tipos = (evaluacion.apoyos || []).map(a => a.apoyo);
        form.querySelectorAll('.tipoApoyo').forEach(cb => {
            if (tipos.includes(cb.value)) cb.checked = true;
        });
        
        // Comentarios
        if (evaluacion.comentarios) {
            const comInput = document.getElementById('comentarios');
            if (comInput) comInput.value = evaluacion.comentarios;
        }
        
        // 8. Estado final del form
        setState('currentEvalId', id); // Marcar que estamos editando
        calcularPromedios();
        
        const titleH1 = document.getElementById('tituloFormulario');
        if (titleH1) titleH1.textContent = 'Editando Borrador #' + id;
        
        mostrarLoading(false);
    } catch (error) {
        mostrarLoading(false);
        showAlert('Error', 'No se pudo cargar el borrador: ' + error.message, 'error');
    }
}

// FIRMA DIGITAL (TOTP)
let currentSignToken = null;
let currentSignEvalId = null;

export async function prepareSignature(id) {
    console.log('DEBUG: prepareSignature called with ID:', id);
    if (!id || id === 'undefined' || id === 'null') {
        const fallbackId = state.currentEvalId;
        console.log('DEBUG: ID invalid, using fallback from state:', fallbackId);
        id = fallbackId;
    }

    if (!id) {
        showAlert('Error', 'No se pudo identificar el acompañamiento para firmar.', 'warning');
        return;
    }

    try {
        mostrarLoading(true, 'Iniciando proceso de firma...');
        await api.evaluaciones.prepareSign(id);
        
        // Obtener el token para el QR
        const { token } = await api.evaluaciones.getSignToken(id);
        currentSignToken = token;
        currentSignEvalId = id;
        mostrarLoading(false);

        // Limpiar errores previos del modal manual
        const errorEl = document.getElementById('manualSignError');
        if (errorEl) errorEl.style.display = 'none';
        const inputEl = document.getElementById('manualSignatureCode');
        if (inputEl) inputEl.value = '';

        // Generar URL de firma
        const signUrl = `${window.location.origin}/firmar.html?token=${token}`;

        // Mostrar QR en el MODAL (si estamos en el formulario) o en el resumen si existe
        const modalQR = document.getElementById('signatureModalQRContainer');
        if (modalQR) {
            modalQR.innerHTML = '';
            // El usuario prefiere solo código manual. Se elimina generación de QR.
            /*
            new QRCode(modalQR, {
                text: signUrl,
                width: 200,
                height: 200,
                correctLevel: QRCode.CorrectLevel.L
            });
            */
        }
        const modalOverlay = document.getElementById('modalSignatureOverlay');
        if (modalOverlay) {
            modalOverlay.classList.add('active');
        }

        // También intentar actualizar el contenedor en el resumen por si está abierto detrás
        const qrContainer = document.getElementById('signatureQRContainer');
        if (qrContainer) {
            qrContainer.innerHTML = '';
            // El usuario prefiere solo código manual. Se elimina generación de QR.
            /*
            new QRCode(qrContainer, {
                text: signUrl,
                width: 180,
                height: 180,
                correctLevel: QRCode.CorrectLevel.L
            });
            */
            const step = document.getElementById('signatureStep');
            if (step) step.style.display = 'block';
            const btn = document.getElementById('btnPrepareSign');
            if (btn) btn.style.display = 'none';
        }
        
        // Iniciar WebSocket para esperar la firma
        startSignatureWS(id);
        
    } catch (error) {
        mostrarLoading(false);
        showAlert('Error', error.message, 'error');
    }
}

export function closeModalSignature() {
    document.getElementById('modalSignatureOverlay').classList.remove('active');
}

export async function cancelSignatureProcess() {
    closeModalSignature();
    currentSignToken = null;
    currentSignEvalId = null;
    // Simplemente recargamos el detalle para resetear la vista
}

export async function submitManualSignature(isSummary = false) {
    const inputId = isSummary ? 'manualSignatureCodeSummary' : 'manualSignatureCode';
    const errorId = isSummary ? null : 'manualSignError'; // El resumen no tiene p de error dedicado, usamos alert
    
    const codeInput = document.getElementById(inputId);
    const code = codeInput ? codeInput.value.trim() : '';

    if (!code || code.length !== 6) {
        if (errorId) {
            const errP = document.getElementById(errorId);
            if (errP) {
                errP.textContent = 'El código debe ser de 6 dígitos';
                errP.style.display = 'block';
            }
        } else {
            showAlert('Error', 'El código debe ser de 6 dígitos', 'warning');
        }
        return;
    }

    if (!currentSignToken) {
        showAlert('Error', 'No hay un proceso de firma activo', 'error');
        return;
    }

    try {
        mostrarLoading(true, 'Verificando firma...');
        await api.evaluaciones.publicSign({
            token: currentSignToken,
            code: code
        });
        
        mostrarLoading(false);
        // Ocultar error si existía
        if (errorId) {
            const errP = document.getElementById(errorId);
            if (errP) errP.style.display = 'none';
        }

        showAlert('Éxito', 'Firma realizada correctamente y acompañamiento cerrado.', 'success');
        
        // Cerrar modal si estaba abierto
        if (!isSummary) closeModalSignature();
        
        // REDIRECCIÓN: El usuario solicitó ir a la tabla de acompañamientos
        window.app.navigateTo('evaluaciones');
        // Resetear cache para ver el cambio
        if (response.codigo_verificacion) {
            // Mostrar modal de éxito con opción de enviar correo
            showEmailSuccessModal(evalId, response.public_link, response.codigo_verificacion);
            _allEvaluaciones = null;
            loadEvaluaciones();
        }

    } catch (error) {
        mostrarLoading(false);
        const msg = error.response?.data?.detail || error.message || 'Error desconocido';
        if (errorId) {
            const errP = document.getElementById(errorId);
            if (errP) {
                errP.textContent = msg;
                errP.style.display = 'block';
            }
        } else {
            showAlert('Error', msg, 'error');
        }
    }
}

let signatureWS = null;
function startSignatureWS(evalId) {
    if (signatureWS) signatureWS.close();

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const host = window.location.port === '8080' ? 'localhost:8001' : window.location.host;
    const wsUrl = `${protocol}//${host}/ws/evaluacion/${evalId}`;

    signatureWS = new WebSocket(wsUrl);

    signatureWS.onmessage = (event) => {
        const data = JSON.parse(event.data);
        if (data.event === 'DOCENTE_FIRMO') {
            closeModalSignature();
            // Mostrar modal de éxito con opción de enviar correo
            showEmailSuccessModal(evalId, data.public_link, data.verificacion);
            _allEvaluaciones = null;
            loadEvaluaciones();
            signatureWS.close();
        }
    };

    signatureWS.onerror = (err) => console.error('WS Error:', err);
}

export async function finalizeEvaluation(id) {
    if (!confirm('¿Desea cerrar definitivamente este acompañamiento? No podrá ser editado después.')) return;

    try {
        mostrarLoading(true, 'Cerrando acompañamiento...');
        await api.evaluaciones.finalize(id);
        _allEvaluaciones = null; // Clear cache for status update
        mostrarLoading(false);
        showAlert('¡Éxito!', 'El acompañamiento ha sido cerrado y el acta final está lista.', 'success');
        verDetalle(id);
    } catch (error) {
        mostrarLoading(false);
        showAlert('Error', error.message, 'error');
    }
}

export async function deleteEvaluacion(id) {
    if (!confirm('¿Está seguro de eliminar este acompañamiento?')) return;
    try {
        await api.evaluaciones.delete(id);
        loadEvaluaciones(true); // Force reload to clear cache and update table
    } catch (error) {
        showAlert('Error', error.message, 'error');
    }
}

export async function mostrarResumen(evaluacion) {
    // Obtener nombres reales de las dimensiones
    let dimNames = ['Dimensión 1', 'Dimensión 2', 'Dimensión 3', 'Dimensión 4', 'Dimensión 5'];
    try {
        const dimensiones = await api.dimensiones.getAll();
        if (dimensiones && dimensiones.length) {
            const sorted = [...dimensiones].sort((a, b) => (a.orden ?? a.id) - (b.orden ?? b.id));
            dimNames = sorted.map(d => d.nombre);
        }
    } catch(e) { /* usa nombres por defecto si falla */ }

    const dims = [
        { key: 'promedio_dim1', label: dimNames[0] || 'Dimensión 1' },
        { key: 'promedio_dim2', label: dimNames[1] || 'Dimensión 2' },
        { key: 'promedio_dim3', label: dimNames[2] || 'Dimensión 3' },
        { key: 'promedio_dim4', label: dimNames[3] || 'Dimensión 4' },
        { key: 'promedio_dim5', label: dimNames[4] || 'Dimensión 5' }
    ];
    const dimsHtml = dims
        .filter(d => evaluacion[d.key] != null)
        .map(d => {
            const val = evaluacion[d.key];
            const isNA = val === null || val === 0;
            const displayVal = isNA ? "N/A" : Number(val).toFixed(2);
            return `<tr><td><strong>${d.label}:</strong></td><td><span class="badge ${isNA ? 'badge-secondary' : getBadgeClass(val)}">${displayVal}</span></td></tr>`;
        })
        .join('');

    const fortalezas = (evaluacion.fortalezas_aspectos || []).filter(f => f.tipo?.toLowerCase() === 'fortaleza').map(f => f.contenido).join('; ') || '-';
    const aspectos = (evaluacion.fortalezas_aspectos || []).filter(f => f.tipo?.toLowerCase() === 'aspecto').map(f => f.contenido).join('; ') || '-';

    const dimsCards = dims
        .map(d => {
            const val = evaluacion[d.key];
            const isNA = val === null || val === 0;
            const displayVal = isNA ? "N/A" : Number(val).toFixed(2);
            const badgeClass = isNA ? "badge-secondary" : getBadgeClass(val);
            return `
            <div style="display:flex; align-items:center; justify-content:space-between; padding: 14px 20px; background: #fff; border-radius: 10px; border-left: 4px solid ${isNA ? '#94a3b8' : '#004080'}; box-shadow: 0 2px 8px rgba(0,0,0,0.05);">
                <span style="font-size: 1rem; font-weight: 600; color: #2c3e50;">${d.label}</span>
                <span class="badge ${badgeClass}" style="font-size: 1.1rem; padding: 8px 20px; border-radius: 8px; font-weight: 700; min-width: 65px; text-align:center;">${displayVal}</span>
            </div>`;
        }).join('');

    const html = `
        <!-- Header con promedio destacado -->
        <div style="display: flex; align-items: center; justify-content: space-between; padding: 30px 35px; background: linear-gradient(135deg, #002b5e 0%, #004080 100%); border-radius: 14px; margin-bottom: 30px; color: white; box-shadow: 0 6px 20px rgba(0,43,94,0.25);">
            <div>
                <h2 style="margin: 0 0 6px; font-size: 1.9rem; font-weight: 700; letter-spacing: -0.5px;">Acompañamiento #${evaluacion.id}</h2>
                <p style="margin: 0; font-size: 1.05rem; opacity: 0.85;">📅 Fecha de observación: <strong>${evaluacion.fecha || '-'}</strong></p>
            </div>
            <div style="text-align: center; background: rgba(255,255,255,0.12); padding: 18px 30px; border-radius: 14px; border: 1px solid rgba(255,255,255,0.2); backdrop-filter: blur(5px);">
                <p style="margin: 0 0 8px; font-size: 0.8rem; text-transform: uppercase; letter-spacing: 2px; opacity: 0.8; font-weight: 600;">PROMEDIO GLOBAL</p>
                <span class="badge ${(evaluacion.promedio === null || evaluacion.promedio === 0) ? 'badge-secondary' : getBadgeClass(evaluacion.promedio)}" style="font-size: 2.4rem; padding: 12px 28px; border-radius: 12px; font-weight: 800; box-shadow: 0 4px 14px rgba(0,0,0,0.2); display: inline-block;">${(evaluacion.promedio === null || evaluacion.promedio === 0) ? 'N/A' : Number(evaluacion.promedio).toFixed(2)}</span>
                <p style="margin: 10px 0 0; font-size: 0.9rem; opacity: 0.85;">${getInterpretacion(evaluacion.promedio)}</p>
            </div>
        </div>

        <!-- Dos columnas principales: 40% / 60% -->
        <div style="display: grid; grid-template-columns: 40% 60%; gap: 24px; margin-bottom: 24px;">

            <!-- Columna izquierda: Datos del Acompañamiento -->
            <div style="background: #fff; border-radius: 14px; padding: 28px 30px; box-shadow: 0 3px 12px rgba(0,0,0,0.06); border: 1px solid #e8edf3;">
                <h3 style="margin: 0 0 20px; font-size: 1.1rem; color: #002b5e; display: flex; align-items: center; gap: 8px; padding-bottom: 14px; border-bottom: 2px solid #f0f4fa;">
                    <span style="background:#e8f0fe; padding: 6px 10px; border-radius: 8px;">📌</span> Datos del Acompañamiento
                </h3>
                <table style="width: 100%; border-collapse: collapse;">
                    ${[
                        ['Docente', evaluacion.docente?.nombre || '-'],
                        ['RUT', evaluacion.docente?.rut || '-'],
                        ['Colegio', evaluacion.docente?.colegio?.nombre || '-'],
                        ['Curso', evaluacion.curso ? (evaluacion.curso.nivel?.nombre || '') + ' ' + evaluacion.curso.letra : '-'],
                        ['Asignatura', evaluacion.asignatura?.nombre || '-'],
                        ['Observador', evaluacion.observador?.username || '-'],
                        ['Duración', evaluacion.duracion || '-'],
                        ['Func. del Grupo', evaluacion.func_grupo || '-'],
                    ].map(([label, value]) => `
                        <tr style="border-bottom: 1px solid #f4f6fa;">
                            <td style="padding: 12px 0; color: #6c757d; font-size: 0.9rem; font-weight: 600; width: 38%; white-space: nowrap;">${label}</td>
                            <td style="padding: 12px 0 12px 12px; font-size: 0.95rem; color: #2c3e50; font-weight: 500;">${value}</td>
                        </tr>
                    `).join('')}
                </table>
            </div>

            <!-- Columna derecha: Resultados por Dimensión -->
            <div style="background: #fff; border-radius: 14px; padding: 28px 30px; box-shadow: 0 3px 12px rgba(0,0,0,0.06); border: 1px solid #e8edf3;">
                <h3 style="margin: 0 0 20px; font-size: 1.1rem; color: #002b5e; display: flex; align-items: center; gap: 8px; padding-bottom: 14px; border-bottom: 2px solid #f0f4fa;">
                    <span style="background:#e8f0fe; padding: 6px 10px; border-radius: 8px;">📊</span> Resultados por Dimensión
                </h3>
                <div style="display: flex; flex-direction: column; gap: 10px;">
                    ${dimsCards || '<p style="color: #6c757d; text-align:center; padding: 20px;">Sin datos de dimensiones</p>'}
                </div>
                <div style="margin-top: 20px; padding: 20px; background: linear-gradient(135deg, #004080 0%, #002b5e 100%); border-radius: 12px; border: none; box-shadow: inset 0 2px 10px rgba(0,0,0,0.15); color: white;">
                    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 20px; font-size: 0.95rem;">
                        <div style="border-left: 2px solid rgba(255,255,255,0.3); padding-left: 14px;">
                            <strong style="color: rgba(255,255,255,0.7); text-transform: uppercase; font-size: 0.75rem; letter-spacing: 1px; display: block; margin-bottom: 4px;">Orientación</strong>
                            <span style="color: #fff; font-weight: 600; font-size: 1rem;">${evaluacion.orientacion || '-'}</span>
                        </div>
                        <div style="border-left: 2px solid rgba(255,255,255,0.3); padding-left: 14px;">
                            <strong style="color: rgba(255,255,255,0.7); text-transform: uppercase; font-size: 0.75rem; letter-spacing: 1px; display: block; margin-bottom: 4px;">Nivel de Apoyo</strong>
                            <span style="color: #fff; font-weight: 600; font-size: 1rem;">${evaluacion.nivel_apoyo || '-'}</span>
                        </div>
                    </div>
                </div>
            </div>
        </div>

        <!-- Sección Firma Digital -->
        <div id="signatureSection" style="margin-top: 24px; background: #fff; border-radius: 14px; padding: 28px 30px; box-shadow: 0 3px 12px rgba(0,0,0,0.06); border: 2px solid ${evaluacion.estado === 'CERRADA' ? '#28a745' : '#004080'};">
            <h3 style="margin: 0 0 20px; font-size: 1.1rem; color: #002b5e; display: flex; align-items: center; gap: 8px; padding-bottom: 14px; border-bottom: 2px solid #f0f4fa;">
                <span style="background:#e8f0fe; padding: 6px 10px; border-radius: 8px;">🖋️</span> Estado de Firma y Cierre
            </h3>
            
            <div style="display: flex; align-items: start; gap: 30px;">
                <div style="flex: 1;">
                    <div style="display: flex; align-items: center; gap: 15px; margin-bottom: 15px;">
                        <span style="font-size: 0.95rem; font-weight: 600; color: #6c757d;">Estado:</span>
                        <span class="badge" style="background: ${
                            evaluacion.estado === 'CERRADA' ? '#28a745' : 
                            evaluacion.estado === 'FIRMADA_DOCENTE' ? '#007bff' : 
                            evaluacion.estado === 'LISTO_PARA_FIRMA' ? '#ffc107' : '#6c757d'
                        }; color: white; padding: 6px 12px; border-radius: 6px; font-size: 0.85rem; font-weight: 700;">
                            ${evaluacion.estado || 'BORRADOR'}
                        </span>
                    </div>

                    <div id="signatureStatusMsg" style="margin-bottom: 20px; color: #2c3e50; font-size: 0.95rem; line-height: 1.5;">
                        ${
                            evaluacion.estado === 'BORRADOR' ? 'El acompañamiento ha sido guardado como borrador. Debe solicitar la firma del docente para cerrarlo.' :
                            evaluacion.estado === 'LISTO_PARA_FIRMA' ? 'Esperando firma del docente. Solicite el código de 6 dígitos.' :
                            evaluacion.estado === 'FIRMADA_DOCENTE' ? `✅ El docente firmó el ${evaluacion.fecha_firma_docente ? new Date(evaluacion.fecha_firma_docente).toLocaleString() : 'fecha desconocida'}.` :
                            `🛡️ <b>FIRMADA DIGITALMENTE VÍA GOOGLE AUTHENTICATOR</b><br>
                             <span style="color: #28a745; font-weight: bold;">Código de Verificación: ${evaluacion.codigo_firma || '-'}</span><br>
                             Este acompañamiento está cerrado y finalizado correctamente.`
                        }
                    </div>

                    <div style="display: flex; gap: 15px;">
                        ${evaluacion.estado === 'BORRADOR' ? `
                            <button id="btnGuardarBorrador" type="button" class="btn" style="background: #ef8f11; color: white;" data-eval-id="${evaluacion.id}" onclick="window.app.guardarCambiosBorrador(${evaluacion.id})">💾 Guardar Cambios (Borrador)</button>
                            <button id="btnPrepareSign" class="btn btn-primary" onclick="window.app.prepareSignature(${evaluacion.id})">✍️ Firma en pantalla</button>
                            <button class="btn" style="background: #17a2b8; color: white;" onclick="window.app.requestRemoteSign(${evaluacion.id})">📧 Firma por Correo (Remota)</button>
                        ` : ''}

                        ${evaluacion.estado === 'FIRMADA_DOCENTE' ? `
                            <button class="btn btn-success" onclick="window.app.finalizeEvaluation(${evaluacion.id})">🔒 Cerrar Acompañamiento</button>
                        ` : ''}

                        ${evaluacion.estado === 'LISTO_PARA_FIRMA' ? `
                            <button class="btn btn-info btn-sm" style="color: white; padding: 5px 15px;" onclick="window.app.requestRemoteSign(${evaluacion.id})">📧 Re-enviar Enlace Remoto</button>
                            <button class="btn btn-danger btn-sm" onclick="window.app.verDetalle(${evaluacion.id})" style="padding: 5px 15px;">❌ Cancelar Proceso</button>
                        ` : ''}
                    </div>
                </div>

                <div id="signatureStep" style="display: ${evaluacion.estado === 'LISTO_PARA_FIRMA' ? 'block' : 'none'}; text-align: center; background: #f0f7ff; padding: 20px; border-radius: 12px; border: 1px solid #cce5ff;">
                    <p style="font-size: 0.9rem; color: #003366; margin-bottom: 12px; font-weight: 600;">Ingrese el código de 6 dígitos del docente:</p>
                    <div style="display: flex; gap: 10px; justify-content: center; align-items: center;">
                        <input type="text" id="manualSignatureCodeSummary" placeholder="000000" maxlength="6" 
                               style="width: 130px; text-align: center; font-size: 1.4rem; letter-spacing: 3px; padding: 8px; border: 2px solid #003366; border-radius: 8px; font-weight: bold; color: #003366;">
                        <button type="button" class="btn btn-primary" onclick="window.app.submitManualSignature(true)" style="padding: 10px 15px;">✓ Firmar</button>
                    </div>
                </div>

                ${evaluacion.estado === 'CERRADA' ? `
                    <div style="text-align: center; color: #28a745; font-weight: 700; display: flex; flex-direction: column; align-items: center; gap: 10px;">
                        <span style="font-size: 3rem;">🏅</span>
                        <p style="margin: 0;">ACTA CERRADA</p>
                        <button class="btn btn-outline-primary btn-sm" onclick="window.app.sendEmailAccompaniment(${evaluacion.id})" style="margin-top: 5px; border: 1px solid #007bff; color: #007bff; background: transparent; padding: 5px 15px; border-radius: 6px; cursor: pointer; font-weight: 600;">📧 Enviar por Correo</button>
                    </div>
                ` : ''}
            </div>
        </div>

        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 24px; margin-top: 24px;">
                <div style="background: #f0faf0; padding: 20px; border-radius: 10px; border-left: 4px solid #28a745;">
                    <h4 style="margin: 0 0 10px; color: #1e7e34; font-size: 0.95rem; text-transform: uppercase; letter-spacing: 0.5px;">✅ Fortalezas</h4>
                    ${evaluacion.estado === 'BORRADOR' ? 
                        `<textarea id="fortalezasBorrador" rows="4" style="width: 100%; border: 1px solid #ced4da; border-radius: 8px; padding: 12px; font-size: 0.95rem; color: #2c4a2c; background: #fffbe6; line-height: 1.5; resize: vertical;" placeholder="Ingrese las fortalezas observadas...">${fortalezas === '-' ? '' : fortalezas}</textarea>` :
                        `<p style="margin: 0; font-size: 0.95rem; color: #2c4a2c; line-height: 1.7;">${fortalezas}</p>`
                    }
                </div>
                <div style="background: #fff8f8; padding: 20px; border-radius: 10px; border-left: 4px solid #dc3545;">
                    <h4 style="margin: 0 0 10px; color: #c0392b; font-size: 0.95rem; text-transform: uppercase; letter-spacing: 0.5px;">⚡ Aspectos a Fortalecer</h4>
                    ${evaluacion.estado === 'BORRADOR' ? 
                        `<textarea id="aspectosBorrador" rows="4" style="width: 100%; border: 1px solid #ced4da; border-radius: 8px; padding: 12px; font-size: 0.95rem; color: #4a2c2c; background: #fffbe6; line-height: 1.5; resize: vertical;" placeholder="Ingrese los aspectos a fortalecer...">${aspectos === '-' ? '' : aspectos}</textarea>` :
                        `<p style="margin: 0; font-size: 0.95rem; color: #4a2c2c; line-height: 1.7;">${aspectos}</p>`
                    }
                </div>
        </div>
        <div style="background: #f8f9fc; padding: 25px; border-radius: 14px; border: 1px solid #e0e6ef; margin-top: 24px; box-shadow: 0 3px 10px rgba(0,0,0,0.03);">
            <h4 style="margin: 0 0 15px; color: #002b5e; font-size: 1rem; text-transform: uppercase; letter-spacing: 1px; display: flex; align-items: center; gap: 8px;">
                <span style="background:#e8f0fe; padding: 4px 8px; border-radius: 6px;">🧠</span> Retroalimentación Psicología Organizacional
            </h4>
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-bottom: 20px;">
                <div style="background: white; padding: 15px; border-radius: 10px; border: 1px solid #edf2f7;">
                    <strong style="color: #64748b; font-size: 0.8rem; text-transform: uppercase;">Fecha de Retroalimentación:</strong>
                    ${evaluacion.estado === 'BORRADOR' ?
                        `<input type="date" id="fechaRetroBorrador" value="${evaluacion.fecha_retro || ''}" style="width: 100%; margin-top: 8px; border: 1px solid #ced4da; border-radius: 8px; padding: 8px; font-size: 0.95rem; color: #1e293b; background: #fffbe6;">` :
                        `<p style="margin: 5px 0 0; color: #1e293b; font-weight: 600;">${evaluacion.fecha_retro || 'No programada'}</p>`
                    }
                </div>
                <div style="background: white; padding: 15px; border-radius: 10px; border: 1px solid #edf2f7;">
                    <strong style="color: #64748b; font-size: 0.8rem; text-transform: uppercase;">Modalidad:</strong>
                    ${evaluacion.estado === 'BORRADOR' ?
                        `<input type="text" id="modalidadRetroBorrador" value="${evaluacion.modalidad_retro || ''}" style="width: 100%; margin-top: 8px; border: 1px solid #ced4da; border-radius: 8px; padding: 8px; font-size: 0.95rem; color: #1e293b; background: #fffbe6;" placeholder="Ej: Conversación individual...">` :
                        `<p style="margin: 5px 0 0; color: #1e293b; font-weight: 600;">${evaluacion.modalidad_retro || '-'}</p>`
                    }
                </div>
            </div>
            <div style="margin-bottom: 20px;">
                <strong style="color: #64748b; font-size: 0.8rem; text-transform: uppercase;">Síntesis de la Retroalimentación:</strong>
                ${evaluacion.estado === 'BORRADOR' ?
                    `<textarea id="sintesisRetroBorrador" rows="4" style="width: 100%; margin-top: 8px; border: 1px solid #ced4da; border-radius: 8px; padding: 12px; font-size: 0.95rem; color: #334155; line-height: 1.6; background: #fffbe6; resize: vertical;" placeholder="Ingrese la síntesis...">${evaluacion.sintesis_retro || ''}</textarea>` :
                    `<p style="margin: 8px 0 0; color: #334155; line-height: 1.6; background: #fff; padding: 12px; border-radius: 8px; border: 1px solid #f1f5f9;">${evaluacion.sintesis_retro || 'Sin síntesis registrada'}</p>`
                }
            </div>
            <div>
                <strong style="color: #64748b; font-size: 0.8rem; text-transform: uppercase;">Acuerdos de Mejora:</strong>
                ${evaluacion.estado === 'BORRADOR' ?
                    `<textarea id="acuerdosMejoraBorrador" rows="4" style="width: 100%; margin-top: 8px; border: 1px solid #ced4da; border-radius: 8px; padding: 12px; font-size: 0.95rem; color: #334155; line-height: 1.6; background: #fffbe6; resize: vertical;" placeholder="Ingrese los acuerdos...">${evaluacion.acuerdos_mejora || ''}</textarea>` :
                    `<p style="margin: 8px 0 0; color: #334155; line-height: 1.6; background: #fff; padding: 12px; border-radius: 8px; border: 1px solid #f1f5f9;">${evaluacion.acuerdos_mejora || 'Sin acuerdos registrados'}</p>`
                }
            </div>
        </div>

        <div style="background: #ffffff; padding: 25px; border-radius: 14px; border: 1px solid #e0e6ef; margin-top: 24px; box-shadow: 0 3px 10px rgba(0,0,0,0.03);">
            <h4 style="margin: 0 0 10px; color: #002b5e; font-size: 1rem; text-transform: uppercase; letter-spacing: 1px; display: flex; align-items: center; gap: 8px;">
                <span style="background:#fef3c7; padding: 4px 8px; border-radius: 6px;">💬</span> Comentarios para el Desarrollo
            </h4>
            ${evaluacion.estado === 'BORRADOR' ?
                `<textarea id="comentariosBorrador" rows="4" style="width: 100%; border: 1px solid #ced4da; border-radius: 8px; padding: 12px; font-size: 1rem; color: #334155; line-height: 1.7; background: #fffbe6; resize: vertical;" placeholder="Ingrese comentarios adicionales...">${evaluacion.comentarios || ''}</textarea>` :
                `<p style="margin: 0; font-size: 1rem; color: #334155; line-height: 1.7; font-style: ${evaluacion.comentarios ? 'normal' : 'italic'};">${evaluacion.comentarios || 'Sin comentarios adicionales registrados'}</p>`
            }
        </div>
    `;

    const container = document.getElementById('resumenPageContent');
    if (container) {
        container.innerHTML = html;
        const pageEl = document.getElementById('pageResumenEvaluacion');
        if (pageEl) pageEl.classList.add('active');

        // Mostrar/Ocultar botón de re-envío en el header
        const btnResend = document.getElementById('btnResendEmail');
        if (btnResend) {
            btnResend.style.display = evaluacion.estado === 'CERRADA' ? 'block' : 'none';
        }

        // Si está listo para firma, obtener el token y preparar WebSocket
        if (evaluacion.estado === 'LISTO_PARA_FIRMA') {
            setTimeout(() => {
                api.evaluaciones.getSignToken(evaluacion.id).then(({token}) => {
                    currentSignToken = token;
                    currentSignEvalId = evaluacion.id;
                    startSignatureWS(evaluacion.id);
                }).catch(err => {
                    console.error('Error obteniendo token de firma:', err);
                });
            }, 100);
        }
    }
}

export function imprimirResumen() {
    window.print();
}

export function crearNuevaEvaluacion() {
    initEvaluacionForm();
    window.app.navigateTo('nueva-evaluacion');
}

export function previsualizarPDF() {
    // Detectar qué página estamos exportando: el resumen o el formulario nuevo
    const pageResumen = document.getElementById('pageResumenEvaluacion');
    const pageForm = document.getElementById('pageNuevaEvaluacion');
    
    let targetEl = pageForm;
    if (pageResumen && pageResumen.classList.contains('active')) {
        targetEl = document.getElementById('resumenPageContent');
    }

    if (!targetEl) return;

    // Solo para el formulario necesitamos datos del select para el nombre del archivo
    let filename = `Acompanamiento_${new Date().getTime()}.pdf`;
    if (targetEl === pageForm) {
        const docenteSel = document.getElementById('docenteSelect');
        const docenteText = docenteSel.options[docenteSel.selectedIndex]?.text || '';
        const docenteName = docenteText.split(' (')[0] || 'Docente';
        filename = `Formulario_Acompanamiento_${docenteName.replace(/\s+/g, '_')}.pdf`;
    } else {
        // Si es el resumen, buscamos el ID en el header
        const headerH2 = targetEl.parentElement.querySelector('h2');
        if (headerH2) {
            filename = `Resumen_Acompanamiento_${headerH2.textContent.replace(/[^a-zA-Z0-9]/g, '_')}.pdf`;
        }
    }

    targetEl.classList.add('exporting-pdf');

    const opt = {
        margin: [10, 10, 10, 10],
        filename: filename,
        image: { type: 'jpeg', quality: 0.98 },
        html2canvas: { scale: 2, useCORS: true, scrollY: 0 },
        jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
        pagebreak: { mode: 'css', avoid: '.form-section' }
    };

    mostrarLoading(true, 'Generando vista previa...');

    html2pdf().set(opt).from(targetEl).output('bloburl').then(function (pdfUrl) {
        targetEl.classList.remove('exporting-pdf');
        mostrarLoading(false);
        setState('_pdfBlobUrl', pdfUrl);
        document.getElementById('pdfPreviewFrame').src = pdfUrl;
        document.getElementById('pdfPreviewOverlay').classList.add('active');
    }).catch(err => {
        console.error(err);
        targetEl.classList.remove('exporting-pdf');
        mostrarLoading(false);
        showAlert('Error', 'Error al generar PDF: ' + err.message, 'error');
    });
}

export function cerrarPreviewPDF() {
    document.getElementById('pdfPreviewOverlay').classList.remove('active');
    document.getElementById('pdfPreviewFrame').src = '';
    setState('_pdfBlobUrl', null);
}

export function descargarFormularioPDF() {
    const formEl = document.getElementById('evaluacionForm');
    if (!formEl) return;

    // Preparar el estilo temporal para el PDF
    formEl.classList.add('exporting-pdf');

    // Ajustar bordes y visibilidad para una impresión limpia
    const inputs = formEl.querySelectorAll('input, select, textarea');
    inputs.forEach(el => el.style.border = 'none');

    const docenteSel = document.getElementById('docenteSelect');
    const docenteText = docenteSel.options[docenteSel.selectedIndex]?.text || '';
    const docenteName = docenteText.split(' (')[0] || 'Docente';
    const filename = `Acompanamiento_${docenteName.replace(/\s+/g, '_')}.pdf`;

    const opt = {
        margin: [8, 12, 10, 12], // Márgenes equilibrados para hoja carta (top, right, bottom, left)
        filename: filename,
        image: { type: 'jpeg', quality: 0.98 },
        html2canvas: {
            scale: 2,
            useCORS: true,
            scrollY: 0
        },
        jsPDF: {
            unit: 'mm',
            format: 'letter', // Hoja carta (8.5 x 11 pulgadas)
            orientation: 'portrait'
        },
        pagebreak: {
            mode: 'css',
            before: '.agrupacion-final',
            avoid: ['.form-section:not(.agrupacion-final)', '.dimension-card']
        }
    };

    mostrarLoading(true, 'Generando PDF...');
    html2pdf().set(opt).from(formEl).save().then(() => {
        formEl.classList.remove('exporting-pdf');
        inputs.forEach(el => el.style.border = '');
        mostrarLoading(false);
    }).catch(err => {
        console.error(err);
        formEl.classList.remove('exporting-pdf');
        inputs.forEach(el => el.style.border = '');
        mostrarLoading(false);
        showAlert('Error', 'Error al generar PDF: ' + err.message, 'error');
    });
}

export function descargarPDF() {
    const url = state._pdfBlobUrl;
    if (!url) return;
    const a = document.createElement('a');
    a.href = url;
    a.download = `Acompanamiento_${new Date().getTime()}.pdf`;
    a.click();
}

export function closeResumen() {
    // Volver al módulo de Acompañamientos (antes solo quitaba .active y dejaba la
    // pantalla en blanco sin ninguna página activa).
    const el = document.getElementById('pageResumenEvaluacion');
    if (el) el.classList.remove('active');
    window.app.navigateTo('evaluaciones');
}

export async function sendEmailAccompaniment(id, target = 'all') {
    try {
        const msg = target === 'docente' ? 'Enviando acta al docente...' : 
                    target === 'directivo' ? 'Enviando acta a directivos...' : 
                    'Enviando acta a todos los destinatarios...';
                    
        // 1. Mostrar loading
        mostrarLoading(true, msg);

        // 2. Llamar al API
        const result = await api.evaluaciones.sendEmail(id, target);

        mostrarLoading(false);
        
        const successTitle = target === 'docente' ? 'Enviado al Docente' : 
                            target === 'directivo' ? 'Enviado a Directivos' : 
                            '¡Enviado!';
                            
        showAlert(successTitle, result.message || 'El correo ha sido enviado correctamente.', 'success');

        // 3. Cerrar modal si el envío fue exitoso y NO estamos haciendo envíos individuales (opcional)
        // Decisión: No cerrar el modal automáticamente si es un envío individual para dejar que el usuario envíe el otro.
        if (target === 'all') {
            const modal = document.getElementById('modalOverlay');
            if (modal && modal.classList.contains('active')) {
                import('./ui.js').then(ui => ui.closeModal());
            }
        }
    } catch (error) {
        console.error('Error al enviar correo:', error);
        mostrarLoading(false);
        showAlert('Error', 'No se pudo enviar el correo: ' + error.message, 'error');
    }
}

export async function requestRemoteSign(id) {
    import('./ui.js').then(ui => {
        if (!confirm('Se enviará un correo electrónico al docente con un enlace único y temporal (1 hora) para que firme el acta. ¿Desea continuar?')) {
            return;
        }

        mostrarLoading(true, 'Generando enlace y enviando correo al docente...');
        api.evaluaciones.requestRemoteSign(id).then(res => {
            mostrarLoading(false);
            ui.showAlert('Firma Remota Solicitada', 'Se ha enviado un correo al docente con éxito. El acompañamiento debe esperar al docente para poder ser cerrado.', 'success');
            // Recargar la vista actual para reflejar el estado LISTO_PARA_FIRMA si estaba en BORRADOR
            verDetalle(id);
        }).catch(err => {
            mostrarLoading(false);
            ui.showAlert('Error', err.message || 'No se pudo enviar la solicitud de firma remota', 'error');
        });
    });
}

export async function requestRemoteSignFromForm() {
    const id = state.currentEvalId;
    if (!id) {
        showAlert('Error', 'No hay un acompañamiento seleccionado.', 'warning');
        return;
    }

    try {
        const evaluacion = await api.evaluaciones.getById(id);
        if (!evaluacion.docente) {
            showAlert('Error', 'No hay docente asignado para firmar.', 'warning');
            return;
        }

        const docenteNombre = evaluacion.docente.nombre || 'Docente';
        const docenteEmail = evaluacion.docente.email || 'Sin correo asociado';

        const body = `
            <div style="padding: 15px; background: #fff; border-radius: 12px; text-align: left;">
                <div style="display: flex; align-items: center; justify-content: center; margin-bottom: 20px;">
                    <span style="font-size: 3rem;">📧</span>
                </div>
                <h4 style="color: #002b5e; text-align: center; margin-bottom: 5px;">Confirmar Envío de Firma</h4>
                <p style="text-align: center; color: #64748b; font-size: 0.95rem; margin-bottom: 20px;">Se notificará al docente para la firma del acompañamiento #${id}.</p>
                
                <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 10px; padding: 15px; margin-bottom: 20px;">
                    <div style="display: flex; margin-bottom: 10px; gap: 8px;">
                        <span style="color: #64748b; font-weight: 600; min-width: 70px;">Docente:</span>
                        <span style="color: #1e293b; font-weight: 500;">${docenteNombre}</span>
                    </div>
                    <div style="display: flex; gap: 8px;">
                        <span style="color: #64748b; font-weight: 600; min-width: 70px;">Correo:</span>
                        <span style="color: #004080; font-weight: 500; word-break: break-all;">${docenteEmail}</span>
                    </div>
                </div>

                <div style="background: #fffbeb; border: 1px solid #fde68a; padding: 12px; border-radius: 8px; margin-bottom: 20px; font-size: 0.85rem; color: #d97706;">
                    <i class="fas fa-exclamation-triangle" style="margin-right: 5px;"></i> <b>Importante:</b> El enlace de firma que se enviará será válido por <b>1 hora</b>.
                </div>

                <div style="display: flex; gap: 10px;">
                    <button class="btn btn-secondary" style="flex: 1; padding: 12px; border-radius: 8px; font-weight: 600;" onclick="window.app.closeModal()">❌ Cancelar</button>
                    <button class="btn btn-primary" style="flex: 1; padding: 12px; border-radius: 8px; font-weight: 700; background: #004080; border: none; color: white;" onclick="window.app.executeRemoteSignFromForm(${id})">🚀 Enviar y Cambiar a Listo</button>
                </div>
            </div>
        `;
        
        import('./ui.js').then(ui => {
            ui.showGenericModal('Firma por Correo', body);
        });

    } catch (e) {
        showAlert('Error', 'No se pudo cargar la información para la firma.', 'error');
    }
}

export function executeRemoteSignFromForm(id) {
    import('./ui.js').then(ui => ui.closeModal());
    mostrarLoading(true, 'Generando enlace y enviando correo al docente...');
    api.evaluaciones.requestRemoteSign(id).then(res => {
        mostrarLoading(false);
        showAlert('Firma Remota Solicitada', 'Se ha enviado el enlace de firma al correo del docente con éxito.', 'success');
        // Usamos verFormularioSoloLectura para recargar la vista pero de forma controlada
        verFormularioSoloLectura(id);
    }).catch(err => {
        mostrarLoading(false);
        showAlert('Error', err.message || 'No se pudo enviar la solicitud de firma remota', 'error');
    });
}

export function showEmailSuccessModal(evalId, publicLink, code) {
    const body = `
        <div style="text-align: center; padding: 10px;">
            <div style="font-size: 3rem; margin-bottom: 15px;">✅</div>
            <h3 style="color: #28a745; margin-bottom: 10px;">¡Acompañamiento Firmado!</h3>
            <p style="color: #555; margin-bottom: 20px;">El sistema ha generado el código: <b style="color: #004080;">${code}</b></p>
            
            <div style="background: #f0f7ff; padding: 20px; border-radius: 12px; border: 1px solid #cce5ff; margin-bottom: 20px; text-align: left;">
                <p style="margin: 0 0 10px; font-weight: 600; color: #003366;">📤 Gestión de Notificación:</p>
                <div style="display: flex; flex-direction: column; gap: 10px;">
                    <button class="btn btn-primary" onclick="window.app.mostrarEnviarEmailModal(${evalId})" style="width: 100%; padding: 12px; font-weight: 700; background: #004080; border: none; border-radius: 8px;">📧 Abrir Panel de Envío</button>
                    <button class="btn btn-outline-primary" onclick="window.app.copyShareLink('${publicLink}')" style="width: 100%; padding: 12px; border: 1px solid #004080; color: #004080; background: transparent; cursor: pointer; border-radius: 8px; font-weight: 600;">🔗 Copiar Enlace Público</button>
                </div>
            </div>
            
            <button class="btn btn-secondary" onclick="window.app.closeModal()" style="width: 100%; background: #6c757d; color: white; border: none; padding: 10px; border-radius: 8px; cursor: pointer;">Finalizar</button>
        </div>
    `;
    
    import('./ui.js').then(ui => {
        ui.showModal('Acompañamiento Finalizado', body);
    });
}

export function copyShareLink(link) {
    if (!link || link === 'undefined') {
        showAlert('Error', 'El enlace no está disponible.', 'warning');
        return;
    }
    navigator.clipboard.writeText(link).then(() => {
        showAlert('Copiado', 'Enlace copiado al portapapeles.', 'success');
    });
}

export async function sendEmailWithSummary(id) {
    // Si el resumen está visible, lo usamos. Si no, lo cargamos.
    const resumenPage = document.getElementById('pageResumenEvaluacion');
    if (resumenPage && resumenPage.classList.contains('active')) {
        await sendEmailAccompaniment(id);
    } else {
        await window.app.verDetalle(id);
        // Esperamos un poco más para asegurar el renderizado completo
        setTimeout(() => sendEmailAccompaniment(id), 1000);
    }
}

export function showEmailResendModalFromHeader() {
    const id = state.currentEvalId;
    if (!id) {
        showAlert('Error', 'No se ha seleccionado un acompañamiento.', 'warning');
        return;
    }
    showEmailResendModal(id);
}

export async function showEmailResendModal(id) {
    try {
        mostrarLoading(true, 'Consultando destinatarios...');
        
        // 1. Obtener detalle de la evaluación (para correos de docente/observador)
        const evaluacion = await api.evaluaciones.getById(id);
        
        // 2. Obtener destinatarios configurados y filtrar por colegio (CC)
        const extraRecipients = await api.config.getEmailRecipients();
        const schoolId = evaluacion.docente?.colegio_id;
        
        // Filtrar: activos + (mismo colegio o Global)
        const activeCC = extraRecipients.filter(r => 
            r.activo && (r.colegio_id === null || r.colegio_id === schoolId)
        );
        
        const configInfo = await api.config.getInfo();
        const baseUrl = configInfo.BASE_URL || (window.location.pathname.includes('/frontend/') ? `${window.location.origin}/frontend` : window.location.origin);

        mostrarLoading(false);

        const docenteEmail = evaluacion.docente?.email || 'Sin correo';
        const observadorEmail = evaluacion.observador?.email || 'Sin correo';
        const ccList = activeCC.map(r => `<li>${r.nombre} (${r.email})</li>`).join('') || '<li>Sin destinatarios extra configurados</li>';

        const baseUrlFixed = baseUrl.replace(/\/$/, '');
        const docenteLink = `${baseUrlFixed}/ver-acta.html?c=${evaluacion.token_pedagogico || evaluacion.codigo_firma || ''}`;
        const directivoLink = `${baseUrlFixed}/ver-acta.html?c=${evaluacion.token_full || evaluacion.codigo_firma || ''}`;

        const body = `
            <div style="padding: 15px; background: #fff; border-radius: 12px;">
                <div style="margin-bottom: 15px; color: #555; font-size: 0.95rem;">Confirme los detalles del envío:</div>
                
                <!-- SECCIÓN DOCENTE (Acordeón) -->
                <details id="detailsDocente" open style="background: #ffffff; border: 1.5px solid #e2e8f0; border-radius: 12px; overflow: hidden; margin-bottom: 15px;">
                    <summary onclick="document.getElementById('detailsDirectiva').removeAttribute('open')" style="padding: 15px; cursor: pointer; color: #475569; font-weight: 700; display: flex; align-items: center; justify-content: space-between; user-select: none; background: #f1f5f9;">
                         <span style="display: flex; align-items: center; gap: 8px;">
                            <span style="background: #059669; color: white; width: 24px; height: 24px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 0.7rem;">1</span>
                            🚀 Versión para el Docente
                        </span>
                        <i class="fas fa-chevron-down" style="font-size: 0.8rem;"></i>
                    </summary>
                    <div style="padding: 15px; background: #fff; border-top: 1px solid #e2e8f0;">
                        <div style="display: flex; flex-direction: column; gap: 8px;">
                            <div style="display: flex; gap: 8px; align-items: baseline;">
                                <span style="color: #64748b; min-width: 80px; font-weight: 600;">Docente:</span>
                                <span style="color: #1e293b;">${evaluacion.docente?.nombre || 'Docente'} &lt;${docenteEmail}&gt;</span>
                            </div>
                            <div style="display: flex; gap: 8px; align-items: baseline; margin-top: 4px;">
                                <span style="color: #64748b; min-width: 80px; font-weight: 600; font-size: 0.85rem;">Con Copia:</span>
                                <span style="color: #475569; font-size: 0.85rem;">${observadorEmail} (Observador)</span>
                            </div>
                            <div style="display: flex; gap: 8px; align-items: baseline; margin-top: 5px; padding-top: 8px; border-top: 1px dashed #cbd5e1;">
                                <span style="color: #64748b; min-width: 80px; font-weight: 600;">Link:</span>
                                <a href="${docenteLink}" target="_blank" style="color: #10b981; text-decoration: underline; font-size: 0.85rem; word-break: break-all;">${docenteLink}</a>
                            </div>
                            <div style="margin-top: 8px; padding: 10px; background: #ecfdf5; border: 1px solid #d1fae5; border-radius: 8px; font-size: 0.8rem; color: #065f46;">
                                <i class="fas fa-eye-slash"></i> <b>Restringida:</b> El docente solo verá retroalimentación y acuerdos.
                            </div>
                            <button class="btn btn-primary" onclick="window.app.sendEmailAccompaniment(${id}, 'docente')" style="margin-top: 10px; background: #059669; border: none; padding: 10px; font-weight: 700; width: 100%; border-radius: 8px;">🚀 Enviar a Docente</button>
                        </div>
                    </div>
                </details>

                <!-- SECCIÓN DIRECTIVA (Acordeón) -->
                <details id="detailsDirectiva" style="background: #ffffff; border: 1.5px solid #e2e8f0; border-radius: 12px; overflow: hidden;">
                    <summary onclick="document.getElementById('detailsDocente').removeAttribute('open')" style="padding: 15px; cursor: pointer; color: #475569; font-weight: 700; display: flex; align-items: center; justify-content: space-between; user-select: none; background: #f1f5f9;">
                        <span>📂 Gestión Directiva y Reporte Total</span>
                        <i class="fas fa-chevron-down" style="font-size: 0.8rem;"></i>
                    </summary>
                    <div style="padding: 15px; background: #fff; border-top: 1px solid #e2e8f0;">
                         <div style="display: flex; flex-direction: column; gap: 10px;">
                            <div style="display: flex; gap: 8px; align-items: baseline;">
                                <span style="color: #64748b; min-width: 80px; font-weight: 600;">Link Total:</span>
                                <a href="${directivoLink}" target="_blank" style="color: #004080; text-decoration: underline; font-size: 0.85rem; word-break: break-all;">${directivoLink}</a>
                            </div>
                            
                            <div style="margin-top: 5px;">
                                <div style="color: #64748b; font-weight: 600; font-size: 0.85rem; margin-bottom: 5px;">👥 Destinatarios en Copia:</div>
                                <div style="background: #f8fafc; padding: 10px; border-radius: 8px; border: 1px solid #cbd5e1; font-size: 0.85rem; color: #475569; max-height: 100px; overflow-y: auto;">
                                    ${activeCC.length > 0 
                                        ? activeCC.map(r => `<div style="margin-bottom: 4px;">• ${r.email}</div>`).join('') 
                                        : '<i style="color: #94a3b8;">No hay directivos configurados para este colegio.</i>'}
                                </div>
                            </div>

                            <div style="padding: 10px; background: #eff6ff; border: 1px solid #dbeafe; border-radius: 8px; font-size: 0.8rem; color: #1e40af;">
                                <i class="fas fa-info-circle"></i> <b>Completa:</b> Incluye dimensiones, promedios y nivel de liderazgo.
                            </div>
                            <button class="btn btn-primary" onclick="window.app.sendEmailAccompaniment(${id}, 'directivo')" style="margin-top: 10px; background: #004080; border: none; padding: 10px; font-weight: 700; width: 100%; border-radius: 8px;">📁 Enviar a Directivos</button>
                        </div>
                    </div>
                </details>

                <div style="margin-top: 25px; text-align: center;">
                    <button class="btn btn-link" onclick="window.app.closeModal()" style="color: #64748b; text-decoration: underline; cursor: pointer; border: none; background: transparent;">Cerrar sin enviar más</button>
                </div>
            </div>
        `;

        import('./ui.js').then(ui => {
            ui.showGenericModal('Resumen de Envío por Correo', body);
        });

    } catch (error) {
        mostrarLoading(false);
        showAlert('Error', 'No se pudieron cargar los destinatarios: ' + error.message, 'error');
    }
}
