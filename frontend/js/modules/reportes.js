import { api } from '../api.js';
import { state } from '../state.js';
import { mostrarLoading, showAlert } from '../utils.js';

function setupChartDefaults() {
    if (typeof Chart !== 'undefined') {
        // Registrar plugin de etiquetas si está disponible
        if (typeof ChartDataLabels !== 'undefined') {
            try {
                Chart.register(ChartDataLabels);
            } catch (e) {
                console.warn('No se pudo registrar ChartDataLabels:', e);
            }
        }

        Chart.defaults.font.family = "'Inter', sans-serif";
        Chart.defaults.color = '#64748b';
        
        if (Chart.defaults.plugins && Chart.defaults.plugins.tooltip) {
            Object.assign(Chart.defaults.plugins.tooltip, {
                backgroundColor: 'rgba(255, 255, 255, 0.95)',
                titleColor: '#1e293b',
                bodyColor: '#475569',
                borderColor: '#e2e8f0',
                borderWidth: 1,
                padding: 12,
                cornerRadius: 10,
                usePointStyle: true
            });
        }
    }
}

let charts = {};
let dimensionesCache = [];

export async function initReportes() {
    setupChartDefaults();
    await loadFiltrosReportes();
    await actualizarReportes();
    
    // Configurar toggle del mapa de talentos si no existe el handler global
    window.toggleTalentMap = toggleTalentMap;
}

async function loadFiltrosReportes() {
    try {
        const selAnio = document.getElementById('repFilterAnio');
        if (selAnio && selAnio.options.length === 0) {
            const currentYear = new Date().getFullYear();
            let options = '';
            for (let y = currentYear - 2; y <= currentYear + 1; y++) {
                options += `<option value="${y}" ${y === currentYear ? 'selected' : ''}>${y}</option>`;
            }
            selAnio.innerHTML = options;
        }

        const colegios = await api.colegios.getAll();
        const asignaturas = await api.asignaturas.getAll();
        
        const selCol = document.getElementById('repFilterColegio');
        const selAsig = document.getElementById('repFilterAsignatura');
        
        if (selCol) {
            selCol.innerHTML = '<option value="">Todos los colegios</option>' + 
                colegios.map(c => `<option value="${c.id}">${c.nombre}</option>`).join('');
        }
        if (selAsig) {
            selAsig.innerHTML = '<option value="">Todas las asignaturas</option>' + 
                asignaturas.map(a => `<option value="${a.id}">${a.nombre}</option>`).join('');
        }
    } catch (error) {
        console.error('Error cargando filtros:', error);
    }
}

export async function actualizarReportes() {
    const params = {};
    const colId = document.getElementById('repFilterColegio').value;
    const asigId = document.getElementById('repFilterAsignatura').value;
    const from = document.getElementById('repFechaInicio').value;
    const to = document.getElementById('repFechaFin').value;
    const anio = document.getElementById('repFilterAnio').value;

    if (colId) params.colegio_id = colId;
    if (asigId) params.asignatura_id = asigId;
    if (from) params.fecha_inicio = from;
    if (to) params.fecha_fin = to;
    if (anio) params.anio = anio;

    // Plataforma activa: filtra los datos (liderazgo vs visita)
    const context = state.currentContext === 'visita' ? 'visita' : 'liderazgo';
    params.plataforma = context;

    try {
        // Solo proceder si estamos en la página de reportes
        const pageReportes = document.getElementById('pageReportes');
        if (!pageReportes || !pageReportes.classList.contains('active')) {
            console.log('Actualización de reportes cancelada: página no activa');
            return;
        }

        // Mostrar la vista correspondiente al contexto
        const liderazgoView = document.getElementById('reportesLiderazgoView');
        const visitaView = document.getElementById('reportesVisitaView');
        if (liderazgoView) liderazgoView.style.display = (context === 'visita') ? 'none' : '';
        if (visitaView) visitaView.style.display = (context === 'visita') ? '' : 'none';

        // ===== Vista dedicada para Visitas al Aula =====
        if (context === 'visita') {
            mostrarLoading(true, 'Generando informes de visitas al aula...');
            const stats = await api.evaluaciones.getStats(params);
            renderVisitaReports(stats);
            await renderVisitaRolReports(anio);
            mostrarLoading(false);
            return;
        }

        mostrarLoading(true, 'Generando informes de acompañamiento...');

        // Parámetros para el mapa de talentos (incluye tipo de vista)
        const vView = document.getElementById('filterTalentView')?.value || 'promedio';
        const talentParams = { ...params, tipo_vista: vView };

        // Ejecutar peticiones en paralelo
        const [stats, talentMap, dimensiones] = await Promise.all([
            api.evaluaciones.getStats(params),
            api.evaluaciones.getTalentMap(talentParams),
            dimensionesCache.length > 0 ? Promise.resolve(dimensionesCache) : api.dimensiones.getAll()
        ]);
        
        if (dimensionesCache.length === 0) dimensionesCache = dimensiones;
        
        // 1. KPIs Básicos
        document.getElementById('repStatTotal').textContent = stats.total_evaluaciones;
        document.getElementById('repStatPromedio').textContent = stats.promedio_global.toFixed(2);

        // 2. Cálculo de Mejor y Menor Dimensión
        if (stats.promedios_dimensiones && stats.promedios_dimensiones.length > 0) {
            const dimsWithNames = stats.promedios_dimensiones.map((val, idx) => ({
                nombre: dimensiones[idx]?.nombre || `Dimensión ${idx + 1}`,
                valor: val
            })).filter(d => d.valor > 0);

            if (dimsWithNames.length > 0) {
                const sorted = [...dimsWithNames].sort((a, b) => b.valor - a.valor);
                const strongDim = sorted[0];
                const weakDim = sorted[sorted.length - 1];

                const strongEl = document.getElementById('repStatStrong');
                const weakEl = document.getElementById('repStatWeak');

                if (strongEl) strongEl.textContent = `${strongDim.nombre} (${strongDim.valor.toFixed(2)})`;
                if (weakEl) weakEl.textContent = `${weakDim.nombre} (${weakDim.valor.toFixed(2)})`;
            } else {
                if (document.getElementById('repStatStrong')) document.getElementById('repStatStrong').textContent = '-';
                if (document.getElementById('repStatWeak')) document.getElementById('repStatWeak').textContent = '-';
            }
        }
        
        // 3. Renderizado de Gráficos
        renderDocentesNivelesChart(stats.distribucion_func_grupo);
        renderNivelesChart(stats.distribucion_niveles);
        renderMensualChart(stats.por_mes);
        renderColegiosChart(stats.por_colegio);
        renderComparativoChart(stats.dimensiones_por_colegio, dimensiones);
        renderDocentesDimensionesCharts(stats.dimensiones_por_docente, dimensiones);
        renderTalentMap(talentMap.puntaje, '');
        renderTalentMap(talentMap.orientacion, 'Orientacion');
        
    } catch (error) {
        console.error('Error API Stats:', error);
        showAlert('Error', 'No se pudieron cargar las estadísticas', 'error');
    } finally {
        mostrarLoading(false);
    }
}

function renderDocentesNivelesChart(data) {
    const canvas = document.getElementById('chartFuncGrupo');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (charts.docentesNiveles) charts.docentesNiveles.destroy();
    
    if (!data) return;

    const labels = ["Bajo", "Regular", "Adecuado", "Bueno", "Muy bueno"];
    const values = labels.map(l => data[l] || 0);

    // Paleta de Colores Soft & Premium
    const colors = [
        '#ef4444', // Bajo
        '#f97316', // Regular
        '#eab308', // Adecuado
        '#84cc16', // Bueno
        '#10b981'  // Muy bueno
    ];

    charts.docentesNiveles = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [{
                data: values,
                backgroundColor: colors,
                borderRadius: 6,
                barPercentage: 0.8,      // Ocupar el 80% del espacio de la categoría
                categoryPercentage: 0.9  // Ocupar el 90% del espacio entre categorías
            }]
        },
        options: {
            indexAxis: 'y', // Horizontal
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
                datalabels: {
                    display: true,
                    anchor: 'end',
                    align: 'right',
                    offset: 12,
                    color: '#1e293b',
                    font: { weight: '800', size: 14 },
                    formatter: (val) => val > 0 ? val : ''
                }
            },
            scales: { 
                x: { 
                    display: false,
                    grid: { display: false }
                },
                y: {
                    grid: { display: false },
                    ticks: {
                        color: '#1e293b',
                        font: { weight: '700', size: 13 }
                    }
                }
            },
            layout: {
                padding: { 
                    right: 40,
                    top: 10,
                    bottom: 10
                }
            }
        }
    });
}

function renderNivelesChart(data) {
    const ctx = document.getElementById('chartNiveles').getContext('2d');
    if (charts.niveles) charts.niveles.destroy();
    
    const total = Object.values(data).reduce((a, b) => a + b, 0);

    charts.niveles = new Chart(ctx, {
        type: 'pie',
        data: {
            labels: Object.keys(data),
            datasets: [{
                data: Object.values(data),
                backgroundColor: [
                    '#ef4444', '#f97316', '#eab308', '#84cc16', '#10b981'
                ],
                borderWidth: 2,
                borderColor: '#fff'
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { 
                    position: 'bottom',
                    labels: { padding: 20, usePointStyle: true }
                },
                datalabels: {
                    color: '#fff',
                    font: { weight: 'bold', size: 14 },
                    textShadowColor: 'rgba(0,0,0,0.5)',
                    textShadowBlur: 4,
                    formatter: (value) => {
                        if (total === 0) return '';
                        const percentage = ((value / total) * 100).toFixed(1) + '%';
                        return value > 0 ? percentage : '';
                    }
                }
            }
        }
    });
}

function renderMensualChart(data) {
    const el = document.getElementById('chartMensual');
    if (!el) {
        console.warn('Canvas chartMensual no encontrado');
        return;
    }
    const ctx = el.getContext('2d');
    if (charts.mensual) charts.mensual.destroy();
    
    // Si no hay datos, inicializar con ceros
    const monthData = data || { 1:0, 2:0, 3:0, 4:0, 5:0, 6:0, 7:0, 8:0, 9:0, 10:0, 11:0, 12:0 };

    const labels = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];
    const values = labels.map((_, i) => monthData[i + 1] || 0);

    charts.mensual = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [{
                label: 'Acompañamientos',
                data: values,
                backgroundColor: 'rgba(0, 43, 94, 0.7)',
                borderColor: '#002b5e',
                borderWidth: 1,
                borderRadius: 4,
                barThickness: 15
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
                datalabels: {
                    display: true,
                    anchor: 'end',
                    align: 'top',
                    offset: 3,
                    formatter: (val) => val > 0 ? val : '0',
                    font: { weight: 'bold', size: 12 },
                    color: '#444'
                }
            },
            scales: {
                y: { 
                    beginAtZero: true,
                    suggestedMax: 5,
                    ticks: { stepSize: 1 }
                }
            }
        }
    });
}

function renderColegiosChart(data) {
    const ctx = document.getElementById('chartColegios').getContext('2d');
    if (charts.colegios) charts.colegios.destroy();
    
    const labels = Object.keys(data);
    const backgroundColors = labels.map(label => {
        const lowerLabel = label.toLowerCase();
        if (lowerLabel.includes('macaya')) return '#059669'; // Esmeralda
        if (lowerLabel.includes('diego portales') || lowerLabel.includes('portales')) return '#2563eb'; // Azul Real
        return '#64748b'; // Slate Default
    });

    charts.colegios = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [{
                label: 'Promedio Global',
                data: Object.values(data),
                backgroundColor: backgroundColors,
                borderWidth: 0,
                borderRadius: 6,
                barPercentage: 0.6,
                categoryPercentage: 0.8
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
                datalabels: {
                    anchor: 'end',
                    align: 'start',
                    offset: 5,
                    formatter: (value) => value.toFixed(2),
                    font: { weight: 'bold', size: 12 },
                    color: '#fff',
                    textShadowColor: 'rgba(0,0,0,0.5)',
                    textShadowBlur: 3
                }
            },
            scales: { y: { beginAtZero: true, max: 5 } }
        }
    });
}


function renderDocentesDimensionesCharts(data, dimensiones) {
    if (!data || Object.keys(data).length === 0) return;

    const docentes = Object.keys(data).sort();
    
    // Nombres de Dimensiones
    const dimNames = dimensiones && dimensiones.length > 0 
        ? dimensiones.map(d => d.nombre)
        : ['Dim 1', 'Dim 2', 'Dim 3', 'Dim 4', 'Dim 5'];

    // Colores para cada gráfico (pueden ser iguales o diferentes)
    const colors = [
        'rgba(54, 162, 235, 0.7)',  // Azul
        'rgba(255, 99, 132, 0.7)',  // Rojo
        'rgba(255, 206, 86, 0.7)',  // Amarillo
        'rgba(75, 192, 192, 0.7)',  // Verde agua
        'rgba(153, 102, 255, 0.7)'  // Púrpura
    ];

    // Iterar por las 5 dimensiones
    for (let i = 0; i < 5; i++) {
        const charId = `chartDocenteDim${i+1}`;
        const titleId = `titleDim${i+1}`;
        const canvas = document.getElementById(charId);
        if (!canvas) continue;

        const ctx = canvas.getContext('2d');
        const chartKey = `docenteDim${i+1}`;

        if (charts[chartKey]) charts[chartKey].destroy();

        // Ajustar altura dinámica del contenedor basado en cantidad de docentes para que no se vea apretado
        const minHeightPerRow = 35;
        const totalHeight = Math.max(300, docentes.length * minHeightPerRow);
        canvas.parentElement.style.height = `${totalHeight}px`;

        // Actualizar título
        const titleEl = document.getElementById(titleId);
        if (titleEl) titleEl.textContent = dimNames[i] || `Dimensión ${i+1}`;

        const datasetValues = docentes.map(doc => data[doc][i] || 0);

        charts[chartKey] = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: docentes,
                datasets: [{
                    label: 'Puntaje',
                    data: datasetValues,
                    backgroundColor: colors[i],
                    borderColor: colors[i].replace('0.7', '1'),
                    borderWidth: 1,
                    borderRadius: 4
                }]
            },
            options: {
                indexAxis: 'y', // Horizontal
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { display: false },
                    datalabels: {
                        anchor: 'end',
                        align: 'end',
                        offset: 4,
                        formatter: (value) => value > 0 ? value.toFixed(2) : '0',
                        font: { size: 11, weight: 'bold' },
                        color: '#334155'
                    }
                },
                scales: {
                    x: { beginAtZero: true, max: 5, ticks: { stepSize: 1 } },
                    y: {
                        ticks: {
                            font: { size: 11, weight: '600' }
                        }
                    }
                }
            }
        });
    }
}

function renderComparativoChart(data, dimensiones) {
    const ctx = document.getElementById('chartComparativo').getContext('2d');
    if (charts.comparativo) charts.comparativo.destroy();
    
    if (!data || Object.keys(data).length === 0) return;

    const labels = dimensiones && dimensiones.length > 0 
        ? dimensiones.map(d => d.nombre)
        : ['Dim 1', 'Dim 2', 'Dim 3', 'Dim 4', 'Dim 5'];

    const datasets = Object.keys(data).map(colName => {
        const lowerName = colName.toLowerCase();
        let color = '#64748b';
        if (lowerName.includes('macaya')) color = '#059669';
        else if (lowerName.includes('diego portales') || lowerName.includes('portales')) color = '#2563eb';

        return {
            label: colName,
            data: data[colName],
            backgroundColor: color,
            borderColor: color,
            borderWidth: 1,
            borderRadius: 4
        };
    });

    charts.comparativo = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: datasets
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { position: 'top' },
                datalabels: {
                    anchor: 'end',
                    align: 'start',
                    offset: 2,
                    formatter: (value) => value > 0 ? value.toFixed(2) : '',
                    font: { size: 11, weight: 'bold' },
                    color: '#fff',
                    textShadowColor: 'rgba(0,0,0,0.5)',
                    textShadowBlur: 3
                }
            },
            scales: {
                y: { beginAtZero: true, max: 5 },
                x: {
                    ticks: {
                        autoSkip: false,
                        maxRotation: 45,
                        minRotation: 0,
                        font: { size: 11 }
                    }
                }
            }
        }
    });
}

// ============================================================
// Vista dedicada de Reportes para "Visitas al Aula"
// ============================================================
function renderVisitaReports(stats) {
    // KPIs
    const setTxt = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
    setTxt('vrepStatTotal', stats.total_evaluaciones || 0);
    setTxt('vrepStatPromedio', (stats.promedio_global || 0).toFixed(2));

    const tipos = stats.por_tipo_pauta || {};
    const tipoTop = Object.keys(tipos).sort((a, b) => tipos[b] - tipos[a])[0];
    const tipoLabels = { UTP: 'UTP', ORIENTACION: 'Orientación', LIDERAZGO: 'Liderazgo' };
    setTxt('vrepStatPauta', tipoTop ? (tipoLabels[tipoTop] || tipoTop) : '-');

    setTxt('vrepStatDocentes', Object.keys(stats.por_docente || {}).length);

    // Gráficos
    renderTipoPautaChart('vTipoPauta', 'vchartTipoPauta', tipos, tipoLabels);
    renderCountByMonthChart('vMensual', 'vchartMensual', stats.por_mes, 'Visitas');
    renderAvgBarChart('vColegios', 'vchartColegios', stats.por_colegio || {});
    renderAvgHBarChart('vDocentes', 'vchartDocentes', stats.por_docente || {});
}

const NIVEL_COLORS = ['#ef4444', '#f97316', '#eab308', '#84cc16', '#10b981'];

function renderPieChart(key, canvasId, data) {
    const canvas = document.getElementById(canvasId);
    if (!canvas) return;
    if (charts[key]) charts[key].destroy();
    const total = Object.values(data).reduce((a, b) => a + b, 0);

    charts[key] = new Chart(canvas.getContext('2d'), {
        type: 'pie',
        data: {
            labels: Object.keys(data),
            datasets: [{
                data: Object.values(data),
                backgroundColor: NIVEL_COLORS,
                borderWidth: 2,
                borderColor: '#fff'
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { position: 'bottom', labels: { padding: 20, usePointStyle: true } },
                datalabels: {
                    color: '#fff',
                    font: { weight: 'bold', size: 14 },
                    formatter: (value) => (total === 0 || value === 0) ? '' : ((value / total) * 100).toFixed(1) + '%'
                }
            }
        }
    });
}

function renderTipoPautaChart(key, canvasId, data, labelMap) {
    const canvas = document.getElementById(canvasId);
    if (!canvas) return;
    if (charts[key]) charts[key].destroy();

    const labels = Object.keys(data).map(k => labelMap[k] || k);
    const total = Object.values(data).reduce((a, b) => a + b, 0);

    charts[key] = new Chart(canvas.getContext('2d'), {
        type: 'doughnut',
        data: {
            labels,
            datasets: [{
                data: Object.values(data),
                backgroundColor: ['#2563eb', '#059669', '#f59e0b', '#8b5cf6'],
                borderWidth: 2,
                borderColor: '#fff'
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { position: 'bottom', labels: { padding: 20, usePointStyle: true } },
                datalabels: {
                    color: '#fff',
                    font: { weight: 'bold', size: 14 },
                    formatter: (value) => (total === 0 || value === 0) ? '' : value
                }
            }
        }
    });
}

function renderCountByMonthChart(key, canvasId, data, label) {
    const canvas = document.getElementById(canvasId);
    if (!canvas) return;
    if (charts[key]) charts[key].destroy();

    const monthData = data || {};
    const labels = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];
    const values = labels.map((_, i) => monthData[i + 1] || 0);

    charts[key] = new Chart(canvas.getContext('2d'), {
        type: 'bar',
        data: {
            labels,
            datasets: [{
                label,
                data: values,
                backgroundColor: 'rgba(0, 43, 94, 0.7)',
                borderColor: '#002b5e',
                borderWidth: 1,
                borderRadius: 4,
                barThickness: 15
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
                datalabels: {
                    anchor: 'end', align: 'top', offset: 3,
                    formatter: (val) => val > 0 ? val : '',
                    font: { weight: 'bold', size: 12 }, color: '#444'
                }
            },
            scales: { y: { beginAtZero: true, ticks: { stepSize: 1 } } }
        }
    });
}

function renderAvgBarChart(key, canvasId, data) {
    const canvas = document.getElementById(canvasId);
    if (!canvas) return;
    if (charts[key]) charts[key].destroy();

    const labels = Object.keys(data);
    const colors = labels.map(label => {
        const l = label.toLowerCase();
        if (l.includes('macaya')) return '#059669';
        if (l.includes('portales')) return '#2563eb';
        return '#64748b';
    });

    charts[key] = new Chart(canvas.getContext('2d'), {
        type: 'bar',
        data: {
            labels,
            datasets: [{
                label: 'Promedio',
                data: Object.values(data),
                backgroundColor: colors,
                borderWidth: 0,
                borderRadius: 6,
                barPercentage: 0.6,
                categoryPercentage: 0.8
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
                datalabels: {
                    anchor: 'end', align: 'start', offset: 5,
                    formatter: (value) => value.toFixed(2),
                    font: { weight: 'bold', size: 12 }, color: '#fff',
                    textShadowColor: 'rgba(0,0,0,0.5)', textShadowBlur: 3
                }
            },
            scales: { y: { beginAtZero: true, max: 5 } }
        }
    });
}

function renderAvgHBarChart(key, canvasId, data) {
    const canvas = document.getElementById(canvasId);
    if (!canvas) return;
    if (charts[key]) charts[key].destroy();

    const labels = Object.keys(data).sort((a, b) => data[b] - data[a]);
    const values = labels.map(l => data[l]);

    // Altura dinámica según cantidad de docentes
    const totalHeight = Math.max(300, labels.length * 32);
    canvas.parentElement.style.height = `${totalHeight}px`;

    charts[key] = new Chart(canvas.getContext('2d'), {
        type: 'bar',
        data: {
            labels,
            datasets: [{
                label: 'Promedio',
                data: values,
                backgroundColor: 'rgba(37, 99, 235, 0.75)',
                borderColor: '#2563eb',
                borderWidth: 1,
                borderRadius: 4
            }]
        },
        options: {
            indexAxis: 'y',
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
                datalabels: {
                    anchor: 'end', align: 'end', offset: 4,
                    formatter: (value) => value > 0 ? value.toFixed(2) : '0',
                    font: { size: 11, weight: 'bold' }, color: '#334155'
                }
            },
            scales: {
                x: { beginAtZero: true, max: 5, ticks: { stepSize: 1 } },
                y: { ticks: { font: { size: 11, weight: '600' } } }
            }
        }
    });
}

// ============================================================
// Visitas por ROL: tablas (Mar–Nov) + gráfico por semestre + anual
// ============================================================
const MESES_ESCOLAR = [3, 4, 5, 6, 7, 8, 9, 10, 11];
const MES_LABEL = { 3: 'Mar', 4: 'Abr', 5: 'May', 6: 'Jun', 7: 'Jul', 8: 'Ago', 9: 'Sep', 10: 'Oct', 11: 'Nov' };
const ROL_LABEL = { inspectoria: 'Inspectoría', director: 'Director', utp: 'UTP', pie: 'PIE', orien_conv: 'Orient./Conv.' };
// Orden de presentación de roles solicitado por el usuario
const ROL_ORDER = ['director', 'inspectoria', 'utp', 'orien_conv', 'pie'];
const SEM1 = [3, 4, 5, 6, 7];   // Mar–Jul
const SEM2 = [8, 9, 10, 11];    // Ago–Nov

let rolCharts = {};

function colegioColor(nombre) {
    const l = (nombre || '').toLowerCase();
    if (l.includes('macaya')) return '#065f46';   // verde oscuro
    if (l.includes('portales')) return '#2563eb'; // azul
    return '#64748b';
}

function hexToRgba(hex, alpha) {
    const h = hex.replace('#', '');
    const r = parseInt(h.substring(0, 2), 16);
    const g = parseInt(h.substring(2, 4), 16);
    const b = parseInt(h.substring(4, 6), 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function sumMonths(mm, months) {
    if (!mm) return 0;
    return months.reduce((acc, m) => acc + (mm[m] || 0), 0);
}

async function renderVisitaRolReports(anio) {
    const cont = document.getElementById('vrepRolSection');
    if (!cont) return;

    // Limpiar gráficos previos de esta sección
    Object.values(rolCharts).forEach(c => { try { c.destroy(); } catch (e) {} });
    rolCharts = {};

    let resp;
    try {
        resp = await api.evaluaciones.getVisitasPorRol({ anio });
    } catch (error) {
        console.error('Error visitas-por-rol:', error);
        cont.innerHTML = `<div class="dimension-card"><div class="dimension-body" style="text-align:center; color:#dc2626; padding:30px;">
            No se pudo cargar el reporte de visitas por rol.<br><span style="font-size:0.8rem; color:#94a3b8;">${error.message || ''}</span>
        </div></div>`;
        return;
    }

    // Diagnóstico: deja ver en consola exactamente qué devolvió el backend.
    console.log('[visitas-por-rol] respuesta:', resp);

    const data = resp.data || {};
    const rolesRaw = resp.roles || ['inspectoria', 'director', 'utp', 'pie', 'orien_conv'];
    // Reordenar según el orden solicitado (director, inspectoría, utp, orien_conv, pie)
    const roles = [...rolesRaw].sort((a, b) => {
        const ia = ROL_ORDER.indexOf(a), ib = ROL_ORDER.indexOf(b);
        return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
    });
    const colegios = Object.keys(data);
    const anioQuery = resp.anio || anio || new Date().getFullYear();
    const borradores = resp.borradores || 0;

    if (colegios.length === 0) {
        // Mostramos la tabla vacía (con la estructura de roles) + los criterios,
        // para que se vea la sección y se entienda por qué los conteos están en 0.
        const emptyPorRolMes = {};
        cont.innerHTML = `
            ${buildBorradoresCard(borradores)}
            <div class="dimension-card full-width">
                <div class="dimension-header" style="background:#002b5e; border-bottom:none;">
                    <h3 style="color:#fff;">Visitas por Rol — ${anioQuery}</h3>
                </div>
                <div class="dimension-body" style="overflow-x:auto;">
                    ${buildRolTable(emptyPorRolMes, roles)}
                    <div style="margin-top:18px; background:#fffbeb; border:1px solid #fde68a; border-radius:12px; padding:14px 16px; color:#92400e; font-size:0.85rem; line-height:1.5;">
                        <strong>No hay visitas que cumplan los criterios del reporte para ${anioQuery}.</strong>
                        Una visita se cuenta aquí si:
                        <ul style="margin:8px 0 0 18px;">
                            <li>la realizó un usuario cuyo <strong>rol</strong> es uno de: Director, Inspectoría, UTP, Orient./Conv. o PIE, y</li>
                            <li>su fecha está en el año <strong>${anioQuery}</strong> (meses marzo a noviembre), y</li>
                            <li>su estado es <strong>CERRADA</strong>.</li>
                        </ul>
                        <span style="display:block; margin-top:8px;">Solo se contabilizan las visitas <strong>CERRADAS</strong>. Las visitas creadas por una cuenta <strong>Admin</strong> o <strong>Usuario</strong> no se contabilizan, porque esos no son roles de visita.</span>
                    </div>
                </div>
            </div>`;
        return;
    }

    let html = buildBorradoresCard(borradores);

    // Una tarjeta por colegio: tabla + gráfico por semestre
    colegios.forEach((col, idx) => {
        html += `
            <div class="dimension-card full-width" style="margin-bottom:24px;">
                <div class="dimension-header" style="background:${colegioColor(col)}; border-bottom:none;">
                    <h3 style="color:#fff;">Visitas por Rol — ${col}</h3>
                </div>
                <div class="dimension-body" style="overflow-x:auto;">
                    ${buildMetasTable(data[col].por_observador, roles)}
                    ${buildRolUserTable(data[col].por_observador, roles)}
                    <div class="chart-wrapper" style="height:300px; margin-top:24px;">
                        <canvas id="vrolSem_${idx}"></canvas>
                    </div>
                </div>
            </div>`;
    });

    // Gráfico anual combinado (eje X = rol · nombre del visitador; color por colegio)
    const legend = colegios.length > 1
        ? `<div style="display:flex; gap:18px; justify-content:center; margin-bottom:12px; font-size:0.8rem; color:#475569; flex-wrap:wrap;">
                ${colegios.map(c => `<span><span style="display:inline-block; width:12px; height:12px; background:${colegioColor(c)}; border-radius:3px; margin-right:6px; vertical-align:middle;"></span>${c}</span>`).join('')}
           </div>`
        : '';

    html += `
        <div class="dimension-card full-width">
            <div class="dimension-header" style="background:#002b5e; border-bottom:none;">
                <h3 style="color:#fff;">Visitas Totales por Visitador (Anual)</h3>
            </div>
            <div class="dimension-body">
                ${legend}
                <div class="chart-wrapper large-chart">
                    <canvas id="vrolAnual"></canvas>
                </div>
            </div>
        </div>`;

    // Tabla de Visitas por Mes (totales por colegio; comparativa si hay varios)
    html += `
        <div class="dimension-card full-width" style="margin-top:24px;">
            <div class="dimension-header" style="background:#0f766e; border-bottom:none;">
                <h3 style="color:#fff;">Visitas por Mes${colegios.length > 1 ? ' — Comparativa por Colegio' : ''}</h3>
            </div>
            <div class="dimension-body" style="overflow-x:auto;">
                ${buildMonthlyTable(data, colegios, roles)}
            </div>
        </div>`;

    cont.innerHTML = html;

    // Construir gráficos ya con el DOM en su sitio
    colegios.forEach((col, idx) => {
        buildSemesterChart(`vrolSem_${idx}`, `sem_${idx}`, data[col].por_rol_mes, roles, col);
    });
    buildAnnualChart('vrolAnual', 'anual', data, colegios);
}

// Card único con el total de visitas en estado BORRADOR (no entran en los gráficos).
function buildBorradoresCard(borradores) {
    const n = borradores || 0;
    return `
        <div class="dimension-card full-width" style="margin-bottom:24px;">
            <div class="dimension-body" style="display:flex; align-items:center; gap:18px; padding:20px 24px;">
                <div style="font-size:2.4rem; line-height:1;">📝</div>
                <div style="flex:1;">
                    <div style="font-size:0.8rem; font-weight:700; color:#92400e; text-transform:uppercase; letter-spacing:0.5px;">Visitas en Borrador</div>
                    <div style="font-size:0.82rem; color:#64748b; margin-top:2px;">Aún sin cerrar — no se incluyen en los gráficos ni en las metas.</div>
                </div>
                <div style="font-size:2.6rem; font-weight:800; color:#b45309; min-width:60px; text-align:right;">${n}</div>
            </div>
        </div>`;
}

function buildRolTable(porRolMes, roles) {
    const headMeses = MESES_ESCOLAR.map(m => `<th style="text-align:center;">${MES_LABEL[m]}</th>`).join('');
    const rows = roles.map(rol => {
        const mm = porRolMes[rol] || {};
        let total = 0;
        const cells = MESES_ESCOLAR.map(m => {
            const v = mm[m] || 0;
            total += v;
            return `<td style="text-align:center;">${v || ''}</td>`;
        }).join('');
        return `<tr>
            <td style="font-weight:700; color:#1e293b;">${ROL_LABEL[rol] || rol}</td>
            ${cells}
            <td style="text-align:center; font-weight:800; color:#002b5e;">${total}</td>
        </tr>`;
    }).join('');

    return `
        <table class="data-table" style="width:100%; min-width:640px;">
            <thead>
                <tr><th>Rol</th>${headMeses}<th style="text-align:center;">Total</th></tr>
            </thead>
            <tbody>${rows}</tbody>
        </table>`;
}

// Badge de cumplimiento "realizadas/meta · %" (verde si cumple, ámbar si no).
function metaBadge(real, meta) {
    const ok = meta > 0 && real >= meta;
    const bg = ok ? '#dcfce7' : '#fef3c7';
    const fg = ok ? '#166534' : '#92400e';
    const pct = meta > 0 ? Math.round((real / meta) * 100) : 0;
    return `<span style="background:${bg}; color:${fg}; padding:3px 9px; border-radius:999px; font-size:0.7rem; font-weight:800; white-space:nowrap;">${real}/${meta} · ${pct}%</span>`;
}

// Tabla dedicada de cumplimiento de metas, POR VISITADOR (meta individual).
function buildMetasTable(porObservador, roles) {
    const conMeta = (porObservador || []).filter(o => o.meta);
    if (conMeta.length === 0) {
        return `<div style="margin-bottom:20px; background:#f8fafc; border:1px dashed #cbd5e1; border-radius:12px; padding:12px 16px; color:#64748b; font-size:0.85rem;">
            🎯 Sin metas individuales para los visitadores de este colegio. Configúralas en <strong>Metas</strong> (menú lateral).
        </div>`;
    }

    const orden = (r) => { const i = ROL_ORDER.indexOf(r); return i === -1 ? 99 : i; };
    conMeta.sort((a, b) => orden(a.rol) - orden(b.rol) || (a.nombre || '').localeCompare(b.nombre || ''));

    const rows = conMeta.map(o => {
        const meta = o.meta;
        const mm = o.por_mes || {};
        let realizadasCell, cumpCell;
        if (meta.periodo === 'SEMESTRE') {
            const s1 = sumMonths(mm, SEM1), s2 = sumMonths(mm, SEM2);
            realizadasCell = `1°S: ${s1} · 2°S: ${s2}`;
            cumpCell = `<div style="display:flex; gap:5px; justify-content:center; flex-wrap:wrap;">${metaBadge(s1, meta.cantidad)} ${metaBadge(s2, meta.cantidad)}</div>`;
        } else {
            const total = MESES_ESCOLAR.reduce((a, m) => a + (mm[m] || 0), 0);
            realizadasCell = `${total}`;
            cumpCell = metaBadge(total, meta.cantidad);
        }
        return `<tr>
            <td style="font-weight:700; color:#1e293b;">${o.nombre}</td>
            <td>${ROL_LABEL[o.rol] || o.rol}</td>
            <td style="text-align:center;">${meta.periodo === 'SEMESTRE' ? 'Semestral' : 'Anual'}</td>
            <td style="text-align:center; font-weight:800; color:#0f766e;">${meta.cantidad}</td>
            <td style="text-align:center;">${realizadasCell}</td>
            <td style="text-align:center;">${cumpCell}</td>
        </tr>`;
    }).join('');

    return `
        <div style="margin-bottom:22px;">
            <h4 style="font-size:0.95rem; font-weight:800; color:#0f766e; margin:0 0 10px;">🎯 Cumplimiento de Metas (por visitador)</h4>
            <table class="data-table" style="width:100%; min-width:560px;">
                <thead>
                    <tr><th>Visitador</th><th>Rol</th><th style="text-align:center;">Periodo</th><th style="text-align:center;">Meta</th><th style="text-align:center;">Realizadas</th><th style="text-align:center;">Cumplimiento</th></tr>
                </thead>
                <tbody>${rows}</tbody>
            </table>
        </div>`;
}

function buildRolUserTable(porObservador, roles) {
    const headMeses = MESES_ESCOLAR.map(m => `<th style="text-align:center;">${MES_LABEL[m]}</th>`).join('');
    const observadores = porObservador || [];

    // Agrupar visitadores por rol (un rol puede tener varios usuarios).
    const porRol = {};
    observadores.forEach(o => { (porRol[o.rol] = porRol[o.rol] || []).push(o); });

    let body = '';
    roles.forEach(rol => {
        const users = (porRol[rol] || []).slice().sort((a, b) => b.total - a.total);
        if (users.length === 0) {
            // Rol sin visitadores: fila tenue para conservar la estructura.
            body += `<tr>
                <td style="font-weight:700; color:#1e293b;">${ROL_LABEL[rol] || rol}</td>
                <td style="color:#94a3b8; font-style:italic;">Sin visitas</td>
                ${MESES_ESCOLAR.map(() => `<td style="text-align:center; color:#cbd5e1;">·</td>`).join('')}
                <td style="text-align:center; color:#cbd5e1;">0</td>
            </tr>`;
            return;
        }
        users.forEach((o, i) => {
            const mm = o.por_mes || {};
            const cells = MESES_ESCOLAR.map(m => {
                const v = mm[m] || 0;
                return `<td style="text-align:center;">${v || ''}</td>`;
            }).join('');
            body += `<tr>
                <td style="font-weight:700; color:#1e293b;">${i === 0 ? (ROL_LABEL[rol] || rol) : ''}</td>
                <td style="color:#334155;">${o.nombre}</td>
                ${cells}
                <td style="text-align:center; font-weight:800; color:#002b5e;">${o.total}</td>
            </tr>`;
        });
    });

    return `
        <table class="data-table" style="width:100%; min-width:720px;">
            <thead>
                <tr><th>Rol</th><th>Visitador</th>${headMeses}<th style="text-align:center;">Total</th></tr>
            </thead>
            <tbody>${body}</tbody>
        </table>`;
}

function buildMonthlyTable(data, colegios, roles) {
    // Totales mensuales por colegio: suma de todos los roles en cada mes.
    const totalsByCol = {};
    colegios.forEach(col => {
        const porRolMes = (data[col] && data[col].por_rol_mes) || {};
        const monthTotals = {};
        MESES_ESCOLAR.forEach(m => {
            monthTotals[m] = roles.reduce((acc, rol) => acc + ((porRolMes[rol] || {})[m] || 0), 0);
        });
        totalsByCol[col] = monthTotals;
    });

    const multi = colegios.length > 1;
    const head = `<tr>
        <th>Mes</th>
        ${colegios.map(c => `<th style="text-align:center;">${c}</th>`).join('')}
        ${multi ? '<th style="text-align:center;">Total</th>' : ''}
    </tr>`;

    const rows = MESES_ESCOLAR.map(m => {
        let rowTotal = 0;
        const cells = colegios.map(col => {
            const v = totalsByCol[col][m] || 0;
            rowTotal += v;
            return `<td style="text-align:center;">${v || ''}</td>`;
        }).join('');
        return `<tr>
            <td style="font-weight:700; color:#1e293b;">${MES_LABEL[m]}</td>
            ${cells}
            ${multi ? `<td style="text-align:center; font-weight:800; color:#002b5e;">${rowTotal}</td>` : ''}
        </tr>`;
    }).join('');

    // Fila de totales anuales por colegio
    let grand = 0;
    const totalCells = colegios.map(col => {
        const t = MESES_ESCOLAR.reduce((acc, m) => acc + (totalsByCol[col][m] || 0), 0);
        grand += t;
        return `<td style="text-align:center; font-weight:800; color:#002b5e;">${t}</td>`;
    }).join('');
    const totalRow = `<tr style="border-top:2px solid #e2e8f0;">
        <td style="font-weight:800; color:#1e293b;">Total</td>
        ${totalCells}
        ${multi ? `<td style="text-align:center; font-weight:900; color:#002b5e;">${grand}</td>` : ''}
    </tr>`;

    return `
        <table class="data-table" style="width:100%; min-width:480px;">
            <thead>${head}</thead>
            <tbody>${rows}${totalRow}</tbody>
        </table>`;
}

function buildSemesterChart(canvasId, key, porRolMes, roles, colName) {
    const canvas = document.getElementById(canvasId);
    if (!canvas) return;

    const base = colegioColor(colName);
    const s1 = roles.map(rol => sumMonths(porRolMes[rol], SEM1));
    const s2 = roles.map(rol => sumMonths(porRolMes[rol], SEM2));

    rolCharts[key] = new Chart(canvas.getContext('2d'), {
        type: 'bar',
        data: {
            labels: roles.map(r => ROL_LABEL[r] || r),
            datasets: [
                { label: '1° Semestre (Mar–Jul)', data: s1, backgroundColor: base, borderRadius: 4 },
                { label: '2° Semestre (Ago–Nov)', data: s2, backgroundColor: hexToRgba(base, 0.45), borderRadius: 4 }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { position: 'top', labels: { usePointStyle: true, padding: 16 } },
                datalabels: {
                    anchor: 'end', align: 'top', offset: 2,
                    formatter: (v) => v > 0 ? v : '',
                    font: { weight: 'bold', size: 11 }, color: '#334155'
                }
            },
            scales: { y: { beginAtZero: true, ticks: { stepSize: 1 } } }
        }
    });
}

function buildAnnualChart(canvasId, key, data, colegios) {
    const canvas = document.getElementById(canvasId);
    if (!canvas) return;

    const items = [];
    colegios.forEach(col => {
        (data[col].por_observador || []).forEach(o => {
            items.push({
                label: `${ROL_LABEL[o.rol] || o.rol} · ${o.nombre}`,
                total: o.total,
                colegio: col
            });
        });
    });
    items.sort((a, b) => b.total - a.total);

    if (items.length === 0) {
        canvas.parentElement.style.height = '120px';
        return;
    }

    const totalHeight = Math.max(300, items.length * 34);
    canvas.parentElement.style.height = `${totalHeight}px`;

    rolCharts[key] = new Chart(canvas.getContext('2d'), {
        type: 'bar',
        data: {
            labels: items.map(i => i.label),
            datasets: [{
                label: 'Visitas',
                data: items.map(i => i.total),
                backgroundColor: items.map(i => colegioColor(i.colegio)),
                borderRadius: 4
            }]
        },
        options: {
            indexAxis: 'y',
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
                datalabels: {
                    anchor: 'end', align: 'end', offset: 4,
                    formatter: (v) => v > 0 ? v : '',
                    font: { weight: 'bold', size: 11 }, color: '#334155'
                },
                tooltip: { callbacks: { afterLabel: (ctx) => items[ctx.dataIndex].colegio } }
            },
            scales: {
                x: { beginAtZero: true, ticks: { stepSize: 1 } },
                y: { ticks: { font: { size: 11, weight: '600' } } }
            }
        }
    });
}

export function exportarReportePDF() {
    window.print();
}

function renderTalentMap(data, suffix = '') {
    const listIds = {
        avanzado: 'listAvanzado' + suffix,
        intermedio: 'listIntermedio' + suffix,
        en_desarrollo: 'listDesarrollo' + suffix,
        inicial: 'listInicial' + suffix,
        prioritario: 'listPrioritario' + suffix
    };

    Object.keys(listIds).forEach(key => {
        const list = document.getElementById(listIds[key]);
        if (!list) return;
        
        const teachers = data[key] || [];
        list.innerHTML = teachers.length > 0 
            ? teachers.map(t => `
                <li class="talent-item">
                    <span class="talent-name">${t.nombre}</span>
                    <span class="talent-score">${t.puntaje.toFixed(2)}</span>
                </li>
            `).join('')
            : '<li class="talent-empty">Sin docentes registrados</li>';
    });
}

export function toggleTalentMap(suffix = '') {
    const body = document.getElementById('talentMapBody' + suffix);
    const icon = document.getElementById('talentMapIcon' + suffix);
    if (!body || !icon) return;

    if (body.style.display === 'none' || !body.style.display) {
        body.style.display = 'block';
        body.classList.add('active');
        icon.style.transform = 'rotate(180deg)';
    } else {
        body.style.display = 'none';
        body.classList.remove('active');
        icon.style.transform = 'rotate(0deg)';
    }
}
