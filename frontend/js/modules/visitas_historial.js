
import { api } from '../api.js';
import { state } from '../state.js';
import { mostrarLoading, showAlert, showConfirm, formatFecha, getBadgeClass } from '../utils.js';

/**
 * Módulo independiente para el Historial de Visitas a Aula y UTP
 */

export async function loadVisitasHistorial() {
    try {
        mostrarLoading(true, 'Cargando historial de visitas...');
        const tbody = document.getElementById('visitasBody');
        if (!tbody) return;

        // 1. Cargar colegios para el filtro
        const colegios = await api.colegios.getAll();
        populateSelect('filterVisitaColegio', colegios, 'Todos los Colegios');

        // 2. Cargar todas las evaluaciones del sistema
        const allEvaluaciones = await api.evaluaciones.getAll();
        
        // 3. Filtrado: Excluir Liderazgo (plantilla_id 1) – incluir todas las demás pautas y sus copias
        let visitas = allEvaluaciones.filter(v => v.plantilla_id != 1);

        // Solo el ADMIN ve todas las visitas (de ambos colegios y de todos los usuarios).
        // Cualquier otro rol ve únicamente las visitas que él realizó (su colegio).
        const isAdmin = Number(state.currentUser?.rol_id) === 1;
        if (!isAdmin) {
            const uid = state.currentUser?.id;
            visitas = visitas.filter(v => v.observador_id == uid || v.usuario_id == uid);
        }

        // 4. Guardar en estado local del módulo para filtros rápidos
        state.allVisitasHistorial = visitas;

        // 5. Poblar filtros dinámicos (visitante, estado y tipo de acompañamiento)
        //    a partir de los datos realmente presentes en el historial.
        poblarFiltrosDinamicos(visitas);

        renderTable(visitas);
        setupFilters();
        mostrarLoading(false);
    } catch (error) {
        mostrarLoading(false);
        console.error('Error loadVisitasHistorial:', error);
        showAlert('Error', 'No se pudo cargar el historial de visitas', 'error');
    }
}

// Botones de acción de una visita (reutilizados en tabla de escritorio y tarjetas móviles)
function visitaActionButtons(v) {
    const isAdmin = state.currentUser?.rol_id === 1 || parseInt(localStorage.getItem('userRole')) === 1;
    // "Enviar Pauta al Docente": permitido a todos los roles excepto "usuario".
    const roleName = (state.currentUser?.rol?.nombre || '').toLowerCase();
    const isUsuario = roleName ? roleName === 'usuario' : Number(state.currentUser?.rol_id) === 3;
    const canSendPauta = !isUsuario;
    const canSign = v.estado !== 'FIRMADA' && v.estado !== 'CERRADA';
    const safeNombre = String(v.plantilla_nombre || '').replace(/'/g, "\\'");
    const safeSlug = String(v.plantilla_slug || '').replace(/'/g, "\\'");

    // Visitas históricas subidas como PDF: visor + descarga (no tienen pauta editable).
    if (v.tiene_pdf) {
        const tituloPdf = `Visita ${v.docente_nombre || ''} · ${formatFecha(v.fecha)}`.replace(/'/g, "\\'");
        return `
            <button class="btn btn-sm btn-info" onclick="window.app.openPdfViewer(${v.id}, '${tituloPdf}')" title="Ver PDF" style="padding: 6px 10px; border-radius: 6px;">
                <i class="fas fa-file-pdf"></i>
            </button>
            <button class="btn btn-sm" onclick="window.app.descargarPdfVisita(${v.id}, 'visita_${v.id}.pdf')" title="Descargar PDF" style="padding: 6px 10px; border-radius: 6px; background-color:#0ea5e9; color:#fff;">
                <i class="fas fa-download"></i>
            </button>
            ${isAdmin ? `
            <button class="btn btn-sm btn-danger" onclick="window.app.eliminarVisita(${v.id})" title="Eliminar" style="padding: 6px 10px; border-radius: 6px;">
                <i class="fas fa-trash"></i>
            </button>` : ''}
        `;
    }

    return `
        <button class="btn btn-sm btn-info" onclick="window.app.verDetalleVisita(${v.id}, ${v.plantilla_id}, '${safeNombre}', '${safeSlug}')" title="Ver Detalle" style="padding: 6px 10px; border-radius: 6px;">
            <i class="fas fa-eye"></i>
        </button>
        ${canSign ? `
        <button class="btn btn-sm btn-success" onclick="window.app.abrirModalFirma(${v.id})" title="Firmar Pauta" style="padding: 6px 10px; border-radius: 6px; background-color: #10b981;">
            <i class="fas fa-pen-nib"></i>
        </button>` : ''}
        ${(v.estado === 'CERRADA' && canSendPauta) ? `
        <button class="btn btn-sm btn-primary" onclick="window.app.enviarPautaResumida(${v.id})" title="Enviar Pauta al Docente" style="padding: 6px 10px; border-radius: 6px; background-color: #4f46e5; border-color: #4f46e5; color: white;">
            <i class="fas fa-paper-plane"></i>
        </button>` : ''}
        ${isAdmin ? `
        <button class="btn btn-sm btn-danger" onclick="window.app.eliminarVisita(${v.id})" title="Eliminar" style="padding: 6px 10px; border-radius: 6px;">
            <i class="fas fa-trash"></i>
        </button>` : ''}
    `;
}

function estadoBadgeStyle(estado) {
    const cerrada = estado === 'CERRADA';
    return `background: ${cerrada ? '#f1f5f9' : '#f0fdf4'}; color: ${cerrada ? '#64748b' : '#16a34a'}; border: 1px solid ${cerrada ? '#e2e8f0' : '#bbf7d0'};`;
}

// Formatos cuya pauta usa escala numérica con promedio (se muestra igual que UTP).
// Cubre el UTP base, las copias UTP por colegio y todas las pautas PIE.
const FORMATOS_CON_PROMEDIO = ['UTP', 'PIE'];
function tienePromedioNumerico(v) {
    return FORMATOS_CON_PROMEDIO.includes((v.plantilla_formato || '').toUpperCase());
}

function renderTable(visitas) {
    renderTableRows(visitas);
    renderCards(visitas);
}

// Tabla (escritorio / tablet)
function renderTableRows(visitas) {
    const tbody = document.getElementById('visitasBody');
    if (!tbody) return;

    if (!visitas || visitas.length === 0) {
        tbody.innerHTML = '<tr><td colspan="8" class="text-center" style="padding:40px; color:#94a3b8;">No se encontraron visitas registradas con los criterios seleccionados</td></tr>';
        return;
    }

    tbody.innerHTML = visitas.map(v => `
        <tr class="hover:bg-slate-50 transition-colors">
            <td style="font-family: monospace; font-weight: bold; color: #6366f1;">#${v.id}</td>
            <td>${formatFecha(v.fecha)}</td>
            <td style="font-weight: 600; color: #1e293b;">${v.docente_nombre || 'N/A'}</td>
            <td style="font-size: 0.85rem; color: #64748b;">${v.colegio_nombre || 'N/A'}</td>
            <td style="font-size: 0.85rem; color: #64748b;">${v.observador_nombre || 'N/A'}</td>
            <td>
                <div class="flex flex-col">
                    <span style="font-weight: 700; color: #334155; font-size: 0.9rem;">${v.plantilla_nombre || 'Visita Aula'}</span>
                    ${tienePromedioNumerico(v) && v.promedio != null ? `<span class="badge ${getBadgeClass(v.promedio)}" style="margin-top:4px; align-self:flex-start;">${v.promedio.toFixed(2)}</span>` : ''}
                </div>
            </td>
            <td>
                <span class="badge" style="${estadoBadgeStyle(v.estado)}">${v.estado || 'ABIERTA'}</span>
            </td>
            <td>
                <div style="display:flex; gap:8px;">${visitaActionButtons(v)}</div>
            </td>
        </tr>
    `).join('');
}

// Tarjetas (móvil) — diseño a medida
function renderCards(visitas) {
    const cont = document.getElementById('visitasCards');
    if (!cont) return;

    if (!visitas || visitas.length === 0) {
        cont.innerHTML = '<div class="vh-empty">No se encontraron visitas registradas con los criterios seleccionados</div>';
        return;
    }

    cont.innerHTML = visitas.map(v => {
        const prom = (tienePromedioNumerico(v) && v.promedio != null)
            ? `<span class="badge ${getBadgeClass(v.promedio)}" style="margin-left:6px;">${v.promedio.toFixed(2)}</span>`
            : '';
        return `
        <div class="vh-card">
            <div class="vh-card-head">
                <div class="min-w-0">
                    <div class="vh-docente">${v.docente_nombre || 'N/A'}</div>
                    <div class="vh-id">#${v.id} · ${formatFecha(v.fecha)}</div>
                </div>
                <span class="badge" style="${estadoBadgeStyle(v.estado)}; flex-shrink:0;">${v.estado || 'ABIERTA'}</span>
            </div>
            <div class="vh-rows">
                <div class="vh-row"><span class="vh-k">Colegio</span><span>${v.colegio_nombre || 'N/A'}</span></div>
                <div class="vh-row"><span class="vh-k">Visitante</span><span>${v.observador_nombre || 'N/A'}</span></div>
                <div class="vh-row"><span class="vh-k">Pauta</span><span style="text-align:right;">${v.plantilla_nombre || 'Visita Aula'}${prom}</span></div>
            </div>
            <div class="vh-actions">${visitaActionButtons(v)}</div>
        </div>`;
    }).join('');
}

// Etiquetas legibles para los estados del ciclo de vida de la evaluación.
const ESTADO_LABELS = {
    BORRADOR: 'Borrador',
    LISTO_PARA_FIRMA: 'Listo para firma',
    FIRMADA_DOCENTE: 'Firmada',
    FIRMADA: 'Firmada',
    CERRADA: 'Cerrada',
};

// Rellena los selects de Visitante, Estado y Tipo de Acompañamiento con los
// valores únicos presentes en el historial cargado.
function poblarFiltrosDinamicos(visitas) {
    const fVis = document.getElementById('filterVisitaVisitante');
    const fEst = document.getElementById('filterVisitaEstado');
    const fTipo = document.getElementById('filterVisitaTipo');

    // Visitante (observador): value = id, label = nombre
    if (fVis) {
        const map = new Map();
        visitas.forEach(v => {
            if (v.observador_id != null && !map.has(v.observador_id)) {
                map.set(v.observador_id, v.observador_nombre || `Usuario ${v.observador_id}`);
            }
        });
        fVis.innerHTML = '<option value="">Todos los Visitantes</option>' +
            [...map.entries()]
                .sort((a, b) => a[1].localeCompare(b[1]))
                .map(([id, nombre]) => `<option value="${id}">${nombre}</option>`).join('');
    }

    // Estado
    if (fEst) {
        const estados = [...new Set(visitas.map(v => v.estado || 'ABIERTA'))];
        fEst.innerHTML = '<option value="">Todos los Estados</option>' +
            estados.sort().map(e => `<option value="${e}">${ESTADO_LABELS[e] || e}</option>`).join('');
    }

    // Tipo de acompañamiento (pauta/plantilla): value = plantilla_id, label = nombre
    if (fTipo) {
        const map = new Map();
        visitas.forEach(v => {
            if (v.plantilla_id != null && !map.has(v.plantilla_id)) {
                map.set(v.plantilla_id, v.plantilla_nombre || 'Visita Aula');
            }
        });
        fTipo.innerHTML = '<option value="">Todos los Acompañamientos</option>' +
            [...map.entries()]
                .sort((a, b) => a[1].localeCompare(b[1]))
                .map(([id, nombre]) => `<option value="${id}">${nombre}</option>`).join('');
    }
}

function setupFilters() {
    const fCol = document.getElementById('filterVisitaColegio');
    const fDoc = document.getElementById('filterVisitaDocente');
    const fVis = document.getElementById('filterVisitaVisitante');
    const fEst = document.getElementById('filterVisitaEstado');
    const fTipo = document.getElementById('filterVisitaTipo');
    const fDesde = document.getElementById('filterVisitaDesde');
    const fHasta = document.getElementById('filterVisitaHasta');

    const run = () => aplicarFiltros();

    if (fCol) fCol.onchange = run;
    if (fDoc) fDoc.oninput = run;
    if (fVis) fVis.onchange = run;
    if (fEst) fEst.onchange = run;
    if (fTipo) fTipo.onchange = run;
    if (fDesde) fDesde.onchange = run;
    if (fHasta) fHasta.onchange = run;
}

export function aplicarFiltros() {
    const colId = document.getElementById('filterVisitaColegio')?.value;
    const search = document.getElementById('filterVisitaDocente')?.value.toLowerCase();
    const visitanteId = document.getElementById('filterVisitaVisitante')?.value;
    const estado = document.getElementById('filterVisitaEstado')?.value;
    const tipoId = document.getElementById('filterVisitaTipo')?.value;
    const desde = document.getElementById('filterVisitaDesde')?.value;
    const hasta = document.getElementById('filterVisitaHasta')?.value;

    let data = state.allVisitasHistorial || [];

    if (colId) data = data.filter(v => v.colegio_id == colId);
    if (search) data = data.filter(v =>
        (v.docente_nombre || '').toLowerCase().includes(search) ||
        (v.observador_nombre || '').toLowerCase().includes(search)
    );
    if (visitanteId) data = data.filter(v => v.observador_id == visitanteId);
    if (estado) data = data.filter(v => (v.estado || 'ABIERTA') === estado);
    if (tipoId) data = data.filter(v => v.plantilla_id == tipoId);
    if (desde) data = data.filter(v => v.fecha >= desde);
    if (hasta) data = data.filter(v => v.fecha <= hasta);

    actualizarBadgeFiltros();
    renderTable(data);
}

// Muestra/oculta el panel de filtros avanzados (búsqueda siempre visible).
export function toggleFiltrosVisitas() {
    const panel = document.getElementById('filtrosAvanzadosVisitas');
    const btn = document.getElementById('btnToggleFiltrosVisitas');
    if (!panel) return;
    const oculto = getComputedStyle(panel).display === 'none';
    panel.style.display = oculto ? 'flex' : 'none';
    if (btn) btn.classList.toggle('active', oculto);
}

// Actualiza el contador de filtros avanzados activos en el botón "Filtros".
function actualizarBadgeFiltros() {
    const ids = ['filterVisitaColegio', 'filterVisitaVisitante', 'filterVisitaEstado', 'filterVisitaTipo', 'filterVisitaDesde', 'filterVisitaHasta'];
    const activos = ids.filter(id => document.getElementById(id)?.value).length;
    const badge = document.getElementById('filterVisitaBadge');
    if (badge) {
        badge.textContent = activos;
        badge.style.display = activos ? 'inline-flex' : 'none';
    }
}

export function limpiarFiltros() {
    ['filterVisitaColegio', 'filterVisitaDocente', 'filterVisitaVisitante', 'filterVisitaEstado', 'filterVisitaTipo', 'filterVisitaDesde', 'filterVisitaHasta'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.value = '';
    });
    actualizarBadgeFiltros();
    renderTable(state.allVisitasHistorial || []);
}

export async function verDetalleVisita(id, plantillaId, plantillaNombre = '', plantillaSlug = '') {
    let parsedPlantillaId = parseInt(plantillaId);
    if (isNaN(parsedPlantillaId)) {
        parsedPlantillaId = 2;
    }

    // Determinar el formato real de la plantilla (fuente de verdad). Fallback a heurísticas si no existe.
    let formato = '';
    try {
        const pl = await api.plantillas.get(parsedPlantillaId);
        formato = (pl.formato || '').toUpperCase();
    } catch (e) { /* usamos heurística abajo */ }

    const isUTP = formato
        ? formato === 'UTP'
        : (plantillaSlug === 'UTP' || parsedPlantillaId == 3 || (plantillaNombre && plantillaNombre.toUpperCase().includes('UTP')));

    if (isUTP) {
        // Redirigir a Pauta UTP en modo edición (pasando el id de la plantilla por si es una copia)
        app.navigateTo('visitas-nueva', true);
        if (window.app.initUtpPauta) {
            window.app.initUtpPauta(id, parsedPlantillaId);
        }
    } else {
        // Por defecto Visita Aula (Orientación/Convivencia)
        app.navigateTo('visitas-nueva');
        setTimeout(() => {
            if (window.app.initVisitaForm) {
                window.app.initVisitaForm(null, parsedPlantillaId, id);
            }
        }, 100);
    }
}

let currentEvalToSign = null;

export function abrirModalFirma(id) {
    currentEvalToSign = id;
    const modalHtml = `
        <div id="modalFirmaOpciones" class="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center z-[9999] p-4">
            <div class="bg-white rounded-[32px] shadow-2xl w-full max-w-md overflow-hidden animate-in zoom-in duration-300">
                <div class="p-8 text-center">
                    <div class="w-16 h-16 bg-indigo-100 text-indigo-600 rounded-2xl flex items-center justify-center mx-auto mb-6">
                        <i class="fas fa-file-signature text-2xl"></i>
                    </div>
                    <h3 class="text-2xl font-black text-slate-900 mb-2">Finalizar con Firma</h3>
                    <p class="text-slate-500 text-sm mb-8">Selecciona el método para que el docente firme la pauta de acompañamiento.</p>
                    
                    <div class="space-y-4">
                        <button onclick="window.app.iniciarFirmaDigital(${id})" class="w-full flex items-center justify-between p-4 bg-slate-50 hover:bg-indigo-50 border-2 border-transparent hover:border-indigo-200 rounded-2xl transition-all group">
                            <div class="flex items-center gap-4">
                                <div class="w-10 h-10 bg-white rounded-xl shadow-sm flex items-center justify-center text-indigo-600">
                                    <i class="fas fa-fingerprint"></i>
                                </div>
                                <div class="text-left">
                                    <span class="block font-bold text-slate-900">Firma Digital (Presencial)</span>
                                    <span class="text-[10px] text-slate-400 uppercase font-black">Usar código PIN / TOTP</span>
                                </div>
                            </div>
                            <i class="fas fa-chevron-right text-slate-300 group-hover:text-indigo-400 transition-colors"></i>
                        </button>

                        <button onclick="window.app.iniciarFirmaEmail(${id})" class="w-full flex items-center justify-between p-4 bg-slate-50 hover:bg-emerald-50 border-2 border-transparent hover:border-emerald-200 rounded-2xl transition-all group">
                            <div class="flex items-center gap-4">
                                <div class="w-10 h-10 bg-white rounded-xl shadow-sm flex items-center justify-center text-emerald-600">
                                    <i class="fas fa-envelope"></i>
                                </div>
                                <div class="text-left">
                                    <span class="block font-bold text-slate-900">Firmar por Correo (Remoto)</span>
                                    <span class="text-[10px] text-slate-400 uppercase font-black">Enviar enlace al docente</span>
                                </div>
                            </div>
                            <i class="fas fa-chevron-right text-slate-300 group-hover:text-emerald-400 transition-colors"></i>
                        </button>
                    </div>

                    <button onclick="document.getElementById('modalFirmaOpciones').remove()" class="mt-8 text-slate-400 hover:text-slate-600 text-sm font-bold uppercase tracking-widest">
                        Cancelar y cerrar
                    </button>
                </div>
            </div>
        </div>
    `;
    document.body.insertAdjacentHTML('beforeend', modalHtml);
}

export async function iniciarFirmaDigital(id) {
    document.getElementById('modalFirmaOpciones')?.remove();
    // Reutilizamos la lógica de firma existente en el sistema
    if (window.app.prepareSignature) {
        window.app.prepareSignature(id);
    } else {
        showAlert('Error', 'Módulo de firma digital no disponible', 'error');
    }
}

export async function iniciarFirmaEmail(id) {
    try {
        mostrarLoading(true, 'Preparando información de envío...');
        await api.evaluaciones.prepareSign(id);
        const v = await api.evaluaciones.getById(id);
        mostrarLoading(false);
        
        document.getElementById('modalFirmaOpciones')?.remove();
        
        const docenteEmail = v.docente?.email || 'No configurado';
        
        // Generamos el link de firma para mostrarlo (usamos el endpoint de token)
        let linkFirma = 'Generando enlace...';
        try {
            const tokenRes = await api.evaluaciones.getSignToken(id);
            // Detectamos el path actual para manejar subcarpetas (ej: /frontend/)
            const pathParts = window.location.pathname.split('/');
            pathParts.pop(); // Quitar el .html actual
            const currentPath = pathParts.join('/');
            const baseUrl = window.location.origin + (currentPath.endsWith('/') ? currentPath : currentPath + '/');
            
            linkFirma = `${baseUrl}firmar-remota.html?token=${tokenRes.token}`;
        } catch (e) {
            console.error('Error al obtener sign token:', e);
            linkFirma = 'Error al generar enlace';
        }

        const modalHtml = `
            <div id="modalFlujoFirma" class="fixed inset-0 bg-slate-900/80 backdrop-blur-md flex items-center justify-center z-50 p-4">
                <div class="bg-white rounded-[40px] shadow-2xl w-full max-w-2xl overflow-hidden animate-in slide-in-from-bottom-8 duration-500">
                    <!-- Header -->
                    <div class="bg-indigo-600 p-8 text-white">
                        <div class="flex items-center gap-4 mb-2">
                            <div class="w-12 h-12 bg-white/20 rounded-2xl flex items-center justify-center">
                                <i class="fas fa-paper-plane text-xl"></i>
                            </div>
                            <h3 class="text-2xl font-black italic tracking-tight">FLUJO DE FIRMA REMOTA</h3>
                        </div>
                        <p class="text-indigo-100 text-sm font-medium">Verifica la información antes de enviar el enlace seguro al docente.</p>
                    </div>

                    <div class="p-8">
                        <!-- Workflow Steps -->
                        <div class="grid grid-cols-3 gap-4 mb-10">
                            <div class="text-center">
                                <div class="w-10 h-10 bg-indigo-100 text-indigo-600 rounded-full flex items-center justify-center mx-auto mb-3 font-black">1</div>
                                <span class="text-[10px] font-black uppercase tracking-widest text-slate-400">Envío de<br>Correo</span>
                            </div>
                            <div class="text-center relative">
                                <div class="absolute top-5 -left-1/2 w-full h-[2px] bg-slate-100 -z-10"></div>
                                <div class="w-10 h-10 bg-indigo-100 text-indigo-600 rounded-full flex items-center justify-center mx-auto mb-3 font-black">2</div>
                                <span class="text-[10px] font-black uppercase tracking-widest text-slate-400">Revisión del<br>Docente</span>
                                <div class="absolute top-5 -right-1/2 w-full h-[2px] bg-slate-100 -z-10"></div>
                            </div>
                            <div class="text-center">
                                <div class="w-10 h-10 bg-indigo-600 text-white rounded-full flex items-center justify-center mx-auto mb-3 font-black">3</div>
                                <span class="text-[10px] font-black uppercase tracking-widest text-slate-400">Firma y<br>Cierre Pauta</span>
                            </div>
                        </div>

                        <!-- Info Cards -->
                        <div class="space-y-4 mb-10">
                            <div class="flex items-start gap-4 p-4 bg-slate-50 rounded-2xl border border-slate-100">
                                <div class="w-8 h-8 bg-white rounded-lg flex items-center justify-center text-slate-400 shadow-sm">
                                    <i class="fas fa-user-edit text-xs"></i>
                                </div>
                                <div class="flex-1">
                                    <span class="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Docente Destinatario</span>
                                    <span class="font-bold text-slate-900">${v.docente?.nombre}</span>
                                    <span class="block text-xs text-indigo-600 font-medium">${docenteEmail}</span>
                                </div>
                            </div>

                            <div class="flex items-start gap-4 p-4 bg-slate-50 rounded-2xl border border-slate-100">
                                <div class="w-8 h-8 bg-white rounded-lg flex items-center justify-center text-indigo-600 shadow-sm">
                                    <i class="fas fa-link text-xs"></i>
                                </div>
                                <div class="flex-1 overflow-hidden">
                                    <span class="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Enlace de Acceso y Firma</span>
                                    <div class="flex items-center gap-2">
                                        <span id="linkFirmaText" class="font-bold text-slate-700 text-xs truncate">${linkFirma}</span>
                                        <button id="btnCopiarLinkFirma" onclick="navigator.clipboard.writeText('${linkFirma}').then(() => showAlert('Copiado', 'Enlace copiado al portapapeles', 'info'))" class="text-indigo-600 hover:text-indigo-800 p-1" title="Copiar enlace">
                                            <i class="fas fa-copy"></i>
                                        </button>
                                        <button onclick="window.app.regenerarLinkFirma(${id})" class="text-amber-600 hover:text-amber-800 p-1 ml-1" title="Regenerar enlace (nueva expiración de 24 horas)">
                                            <i class="fas fa-sync-alt"></i>
                                        </button>
                                    </div>
                                </div>
                            </div>

                            <div class="flex items-start gap-4 p-4 bg-amber-50 rounded-2xl border border-amber-100">
                                <div class="w-8 h-8 bg-white rounded-lg flex items-center justify-center text-amber-500 shadow-sm">
                                    <i class="fas fa-shield-alt text-xs"></i>
                                </div>
                                <div class="flex-1">
                                    <span class="block text-[10px] font-black text-amber-600 uppercase tracking-widest mb-1">Seguridad del Enlace</span>
                                    <span class="block text-xs text-amber-800 leading-relaxed font-medium italic">
                                        El enlace es único y expirará automáticamente en 24 horas por motivos de seguridad institucional.
                                    </span>
                                </div>
                            </div>
                        </div>

                        <div class="flex gap-4">
                            <button onclick="document.getElementById('modalFlujoFirma').remove()" class="flex-1 py-4 text-slate-400 hover:text-slate-600 font-black uppercase tracking-widest text-xs transition-colors">
                                Cancelar
                            </button>
                            <button onclick="window.app.confirmarEnvioFirma(${id})" class="flex-[2] bg-indigo-600 hover:bg-indigo-700 text-white py-4 rounded-2xl font-black uppercase tracking-widest text-xs shadow-xl shadow-indigo-200 transition-all transform hover:-translate-y-1">
                                Confirmar y Enviar Correo
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        `;
        document.body.insertAdjacentHTML('beforeend', modalHtml);
    } catch (error) {
        mostrarLoading(false);
        showAlert('Error', 'No se pudo obtener la información: ' + error.message, 'error');
    }
}

export async function confirmarEnvioFirma(id) {
    document.getElementById('modalFlujoFirma')?.remove();
    try {
        mostrarLoading(true, 'Enviando pauta por correo...');
        await api.evaluaciones.requestRemoteSign(id);
        mostrarLoading(false);
        showAlert('Enviado', 'Se ha enviado el correo electrónico al docente con éxito.', 'success');
        loadVisitasHistorial(); 
    } catch (error) {
        mostrarLoading(false);
        showAlert('Error', 'No se pudo enviar el correo: ' + error.message, 'error');
    }
}

export async function eliminarVisita(id) {
    showConfirm(
        'Confirmar eliminación',
        '¿Está seguro de eliminar esta visita? Esta acción no se puede deshacer.',
        async () => {
            try {
                mostrarLoading(true, 'Eliminando visita...');
                await api.evaluaciones.delete(id);
                mostrarLoading(false);
                showAlert('Éxito', 'Visita eliminada correctamente', 'success');
                loadVisitasHistorial();
            } catch (e) {
                mostrarLoading(false);
                showAlert('Error', e.message, 'error');
            }
        }
    );
}

function populateSelect(id, items, placeholder) {
    const select = document.getElementById(id);
    if (!select) return;
    select.innerHTML = `<option value="">${placeholder}</option>`;
    items.forEach(item => {
        const opt = document.createElement('option');
        opt.value = item.id;
        opt.textContent = item.nombre;
        select.appendChild(opt);
    });
}

export async function regenerarLinkFirma(id) {
    try {
        mostrarLoading(true, 'Regenerando enlace de firma...');
        await api.evaluaciones.prepareSign(id);
        const tokenRes = await api.evaluaciones.getSignToken(id);
        
        const pathParts = window.location.pathname.split('/');
        pathParts.pop();
        const currentPath = pathParts.join('/');
        const baseUrl = window.location.origin + (currentPath.endsWith('/') ? currentPath : currentPath + '/');
        
        const nuevoLink = `${baseUrl}firmar-remota.html?token=${tokenRes.token}`;
        
        const linkTextEl = document.getElementById('linkFirmaText');
        if (linkTextEl) {
            linkTextEl.textContent = nuevoLink;
        }
        
        const copyBtn = document.getElementById('btnCopiarLinkFirma');
        if (copyBtn) {
            copyBtn.onclick = () => navigator.clipboard.writeText(nuevoLink).then(() => showAlert('Copiado', 'Enlace copiado al portapapeles', 'info'));
        }
        
        mostrarLoading(false);
        showAlert('Éxito', 'Se ha generado un nuevo enlace válido por 24 horas.', 'success');
    } catch (error) {
        mostrarLoading(false);
        showAlert('Error', 'No se pudo regenerar el enlace: ' + error.message, 'error');
    }
}

export async function enviarPautaResumida(id) {
    try {
        mostrarLoading(true, 'Cargando información del destinatario...');
        const evaluation = await api.evaluaciones.getById(id);
        const allRecipients = await api.config.getEmailRecipients();
        mostrarLoading(false);

        const docenteEmail = evaluation.docente?.email || 'No configurado';
        const observadorEmail = evaluation.observador?.email || evaluation.usuario?.email || 'No configurado';
        const observadorNombre = evaluation.observador?.username || evaluation.usuario?.username || 'N/A';
        
        // Filtrar destinatarios del equipo directivo (CC) para este colegio
        const colegioId = evaluation.docente?.colegio_id;
        const directivos = allRecipients.filter(r => r.activo && (r.colegio_id === colegioId || r.colegio_id === null));
        
        const modalHtml = `
            <div id="modalEnviarPauta" class="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center z-[9999] p-4">
                <div class="bg-white rounded-[32px] shadow-2xl w-full max-w-lg overflow-hidden animate-in zoom-in duration-300">
                    <!-- Header -->
                    <div class="bg-indigo-600 p-8 text-white relative overflow-hidden">
                        <div class="relative z-10">
                            <div class="flex items-center gap-3 mb-2">
                                <span class="bg-indigo-500/20 text-indigo-200 px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest border border-indigo-500/30">Envío de Acta</span>
                            </div>
                            <h3 class="text-2xl font-black italic tracking-tight">ENVIAR PAUTA DE ACOMPAÑAMIENTO</h3>
                            <p class="text-indigo-100 text-xs mt-1">Verifica los destinatarios antes de proceder con el envío.</p>
                        </div>
                        <div class="absolute -right-10 -bottom-10 w-40 h-40 bg-indigo-500/20 rounded-full blur-3xl"></div>
                    </div>

                    <div class="p-8 space-y-6">
                        <!-- Opción 1: Correo Pedagógico (Docente + Observador) -->
                        <div class="p-5 bg-slate-50 rounded-2xl border border-slate-100 flex flex-col gap-3">
                            <div class="flex items-center gap-3">
                                <div class="w-8 h-8 bg-indigo-100 text-indigo-600 rounded-lg flex items-center justify-center">
                                    <i class="fas fa-user-graduate text-sm"></i>
                                </div>
                                <div>
                                    <h4 class="font-bold text-slate-800 text-sm">1. Envío Pedagógico (Sin Puntajes)</h4>
                                    <p class="text-[10px] text-slate-400 font-bold uppercase">Docente + Observador (CC)</p>
                                </div>
                            </div>
                            <div class="text-xs text-slate-600 pl-11 space-y-1">
                                <p><strong>Docente:</strong> ${evaluation.docente?.nombre} &lt;${docenteEmail}&gt;</p>
                                <p><strong>Observador:</strong> ${observadorNombre} &lt;${observadorEmail}&gt;</p>
                                <p class="text-indigo-600 font-semibold mt-2">ℹ️ Se enviará el acta resumida con observaciones y retroalimentación cualitativa.</p>
                            </div>
                            
                            <button onclick="window.app.confirmarEnvioPauta(${id})" class="mt-2 w-full bg-indigo-600 hover:bg-indigo-700 text-white py-3 rounded-xl font-black uppercase tracking-widest text-xs shadow-md transition-all flex items-center justify-center gap-2">
                                <i class="fas fa-paper-plane"></i>
                                Enviar Pautas por Correo
                            </button>
                        </div>

                        <!-- Opción 2: Correo Completo (Directivos - Solo Lectura/Info) -->
                        <div class="p-5 bg-slate-50 rounded-2xl border border-slate-100 flex flex-col gap-2">
                            <div class="flex items-center gap-3">
                                <div class="w-8 h-8 bg-amber-100 text-amber-700 rounded-lg flex items-center justify-center">
                                    <i class="fas fa-users text-sm"></i>
                                </div>
                                <div>
                                    <h4 class="font-bold text-slate-800 text-sm">2. Copia al Equipo Directivo (Con Puntajes)</h4>
                                    <p class="text-[10px] text-slate-400 font-bold uppercase">Configurados para el Colegio</p>
                                </div>
                            </div>
                            <div class="text-xs text-slate-600 pl-11 space-y-2">
                                <div class="bg-white p-3 rounded-lg border border-slate-200 font-mono text-[11px] max-h-24 overflow-y-auto break-all">
                                    ${directivos.length > 0 ? directivos.map(d => `<div class="mb-1">👤 <strong>${d.nombre}</strong> &lt;${d.email}&gt;</div>`).join('') : '<div class="text-slate-400 italic">No hay directivos configurados para este colegio.</div>'}
                                </div>
                                <p class="text-amber-700 font-semibold">ℹ️ Se enviará el acta completa con promedios y desglose de dimensiones.</p>
                            </div>
                        </div>

                        <div class="text-center pt-2">
                            <button onclick="document.getElementById('modalEnviarPauta').remove()" class="text-slate-400 hover:text-slate-600 text-xs font-bold uppercase tracking-widest">
                                Cancelar y Cerrar
                            </button>
                        </div>
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

export async function confirmarEnvioPauta(id) {
    document.getElementById('modalEnviarPauta')?.remove();
    try {
        mostrarLoading(true, 'Enviando pautas por correo...');
        await api.evaluaciones.sendEmail(id, 'all');
        mostrarLoading(false);
        showAlert('Enviado', 'Se han enviado los correos pedagógico (docente) y directivo con éxito.', 'success');
    } catch (error) {
        mostrarLoading(false);
        showAlert('Error', 'No se pudieron enviar los correos: ' + error.message, 'error');
    }
}

