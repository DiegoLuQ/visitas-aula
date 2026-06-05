import { api } from '../api.js';
import { state, setState } from '../state.js';
import { showAlert, mostrarLoading } from '../utils.js';

const ROL_LABEL = { inspectoria: 'Inspectoría', director: 'Director', utp: 'UTP', pie: 'PIE', orien_conv: 'Orient./Conv.' };
const PERIODO_LABEL = { ANUAL: 'Anual', SEMESTRE: 'Semestral' };

let _metasFiltrosInit = false;
let _metaUsuarios = []; // usuarios candidatos (roles de visita)

function aniosDisponibles() {
    const arr = [];
    for (let y = 2026; y <= 2035; y++) arr.push(y);
    return arr;
}

async function ensureCatalogos() {
    if (!state.colegios || state.colegios.length === 0) {
        state.colegios = await api.colegios.getAll();
    }
    if (_metaUsuarios.length === 0) {
        _metaUsuarios = await api.metas.getUsuarios();
    }
}

export async function loadMetas() {
    const tbody = document.getElementById('metasBody');
    if (!tbody) return;
    tbody.innerHTML = '<tr><td colspan="6" class="text-center">Cargando...</td></tr>';

    // Enlazar el submit del form (vive en un partial cargado dinámicamente)
    const form = document.getElementById('formMeta');
    if (form) form.onsubmit = handleMetaSubmit;

    try {
        await ensureCatalogos();

        if (!_metasFiltrosInit) {
            const selAnio = document.getElementById('metaFilterAnio');
            if (selAnio) {
                const actual = new Date().getFullYear();
                selAnio.innerHTML = aniosDisponibles()
                    .map(y => `<option value="${y}" ${y === actual ? 'selected' : ''}>${y}</option>`).join('');
            }
            const selCol = document.getElementById('metaFilterColegio');
            if (selCol) {
                selCol.innerHTML = '<option value="">Todos</option>' +
                    (state.colegios || []).map(c => `<option value="${c.id}">${c.nombre}</option>`).join('');
            }
            _metasFiltrosInit = true;
        }

        const params = {};
        const anio = document.getElementById('metaFilterAnio')?.value;
        const colId = document.getElementById('metaFilterColegio')?.value;
        if (anio) params.anio = anio;
        if (colId) params.colegio_id = colId;

        const metas = await api.metas.getAll(params);
        setState('metas', metas);

        tbody.innerHTML = metas.length > 0
            ? metas.map(m => `
                <tr>
                    <td style="font-weight:600;">${m.usuario_nombre || m.usuario_id}</td>
                    <td>${ROL_LABEL[(m.rol_nombre || '').toLowerCase()] || m.rol_nombre || '-'}</td>
                    <td>${m.colegio_nombre || '-'}</td>
                    <td>${m.anio}</td>
                    <td>${PERIODO_LABEL[m.periodo] || m.periodo}</td>
                    <td style="font-weight:700;">${m.cantidad}
                        <div class="actions" style="display:inline-flex; gap:6px; margin-left:10px;">
                            <button class="btn btn-warning btn-sm" onclick="window.app.editMeta(${m.id})" title="Editar"><i class="fas fa-edit"></i></button>
                            <button class="btn btn-danger btn-sm" onclick="window.app.deleteMeta(${m.id})" title="Eliminar"><i class="fas fa-trash"></i></button>
                        </div>
                    </td>
                </tr>
            `).join('')
            : '<tr><td colspan="6" class="text-center" style="color:#94a3b8; padding:20px;">No hay metas registradas para los filtros seleccionados.</td></tr>';
    } catch (error) {
        tbody.innerHTML = `<tr><td colspan="6" class="text-center" style="color:#dc2626;">Error: ${error.message}</td></tr>`;
    }
}

export async function editMeta(id = null) {
    await ensureCatalogos();
    const isEdit = id !== null;
    const meta = isEdit ? (state.metas || []).find(m => m.id === id) : null;
    if (isEdit && !meta) return;

    document.getElementById('modalMetaTitle').textContent = isEdit ? 'Editar Meta' : 'Agregar Meta';
    document.getElementById('metaId').value = isEdit ? meta.id : '';

    // Usuarios (visitadores)
    const selUser = document.getElementById('metaUsuario');
    selUser.innerHTML = '<option value="">Seleccione...</option>' +
        _metaUsuarios.map(u => {
            const rol = ROL_LABEL[(u.rol_nombre || '').toLowerCase()] || u.rol_nombre || '';
            const col = u.colegio_nombre ? ` · ${u.colegio_nombre}` : '';
            return `<option value="${u.id}" ${isEdit && meta.usuario_id === u.id ? 'selected' : ''}>${u.nombre} (${rol}${col})</option>`;
        }).join('');

    const selAnio = document.getElementById('metaAnio');
    const actual = new Date().getFullYear();
    selAnio.innerHTML = aniosDisponibles()
        .map(y => `<option value="${y}" ${(isEdit ? meta.anio : actual) === y ? 'selected' : ''}>${y}</option>`).join('');

    document.getElementById('metaPeriodo').value = isEdit ? meta.periodo : 'ANUAL';
    document.getElementById('metaCantidad').value = isEdit ? meta.cantidad : '';

    document.getElementById('modalMeta').classList.add('active');
}

export function closeMetaModal() {
    document.getElementById('modalMeta').classList.remove('active');
}

export async function deleteMeta(id) {
    if (!confirm('¿Eliminar esta meta?')) return;
    try {
        await api.metas.delete(id);
        loadMetas();
    } catch (error) {
        showAlert('Error', error.message, 'error');
    }
}

// --- Carga masiva de metas ---
export async function exportarMetasExcel() {
    try {
        mostrarLoading(true, 'Generando archivo Excel...');
        const response = await api.metas.exportExcel();
        if (!response.ok) throw new Error('Error al exportar metas');
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `metas_${new Date().toISOString().split('T')[0]}.xlsx`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        window.URL.revokeObjectURL(url);
        mostrarLoading(false);
    } catch (error) {
        mostrarLoading(false);
        showAlert('Error', error.message, 'error');
    }
}

export async function descargarMetasPlantilla() {
    try {
        mostrarLoading(true, 'Descargando plantilla...');
        const response = await api.metas.downloadTemplate();
        if (!response.ok) throw new Error('Error al descargar la plantilla');
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `plantilla_metas.xlsx`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        window.URL.revokeObjectURL(url);
        mostrarLoading(false);
    } catch (error) {
        mostrarLoading(false);
        showAlert('Error', error.message, 'error');
    }
}

export async function importarMetasExcel(input) {
    if (!input.files || input.files.length === 0) return;
    const file = input.files[0];
    if (!confirm(`¿Importar metas desde el archivo "${file.name}"?`)) {
        input.value = '';
        return;
    }
    try {
        mostrarLoading(true, 'Importando metas...');
        const res = await api.metas.importExcel(file);
        mostrarLoading(false);
        let msg = res.message || 'Importación finalizada';
        if (res.errors && res.errors.length > 0) {
            msg += '\n\nDetalles:\n' + res.errors.join('\n');
        }
        showAlert('Resultado de importación', msg, res.errors?.length ? 'warning' : 'success');
        loadMetas();
    } catch (error) {
        mostrarLoading(false);
        showAlert('Error', error.message, 'error');
    } finally {
        input.value = '';
    }
}

async function handleMetaSubmit(e) {
    e.preventDefault();
    const id = document.getElementById('metaId').value;
    const data = {
        usuario_id: parseInt(document.getElementById('metaUsuario').value),
        anio: parseInt(document.getElementById('metaAnio').value),
        periodo: document.getElementById('metaPeriodo').value,
        cantidad: parseInt(document.getElementById('metaCantidad').value),
    };

    if (!data.usuario_id || !data.anio || isNaN(data.cantidad)) {
        showAlert('Atención', 'Complete todos los campos', 'warning');
        return;
    }

    try {
        if (id) {
            await api.metas.update(id, data);
            showAlert('Éxito', 'Meta actualizada correctamente', 'success');
        } else {
            await api.metas.create(data);
            showAlert('Éxito', 'Meta creada correctamente', 'success');
        }
        closeMetaModal();
        loadMetas();
    } catch (error) {
        showAlert('Error', error.message, 'error');
    }
}
