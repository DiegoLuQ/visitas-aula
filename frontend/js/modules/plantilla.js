import { api } from '../api.js';
import { mostrarLoading, showAlert, closeAlert, showConfirm } from '../utils.js';
import { state, setState } from '../state.js';

export async function loadPlantilla(plantillaId = null) {
    const container = document.getElementById('plantillaContainer');
    const select = document.getElementById('selectPlantillaEdit');
    if (!container) return;
    
    container.innerHTML = '<div class="loading">Cargando plantilla...</div>';
    
    try {
        // Refrescar siempre la lista de plantillas (preservando la selección actual)
        if (select) {
            const prevValue = select.value;
            const plantillas = await api.plantillas.getAll();
            select.innerHTML = plantillas.map(p => `<option value="${p.id}">${p.nombre_largo || p.nombre}</option>`).join('');
            if (plantillaId) {
                select.value = String(plantillaId);
            } else if (prevValue) {
                select.value = prevValue;
            }
            if (!plantillaId) plantillaId = select.value;
        }

        let currentPlantillaId = parseInt(plantillaId || (select ? select.value : 1));
        if (isNaN(currentPlantillaId)) {
            currentPlantillaId = 1;
        }
        if (select) {
            select.value = String(currentPlantillaId);
        }
        setState('editingPlantillaId', currentPlantillaId);
        
        // Controlar visibilidad del botón global "Agregar Dimensión"
        const btnAddDim = document.querySelector('#pagePlantilla .btn-primary');
        if (btnAddDim) {
            btnAddDim.style.display = state.currentUser?.rol_id === 1 ? 'block' : 'none';
        }

        // Botón "Copiar Plantilla": visible para admin y director
        const btnCopy = document.getElementById('btnCopyPlantilla');
        if (btnCopy) {
            btnCopy.style.display = puedeCopiarPlantillas() ? 'inline-flex' : 'none';
        }

        // Botón "Importar plantilla (Excel)": visible para admin y director
        const btnImport = document.getElementById('btnImportPlantilla');
        if (btnImport) {
            btnImport.style.display = puedeCopiarPlantillas() ? 'inline-flex' : 'none';
        }

        // Botón "Eliminar plantilla": visible para admin y director
        const btnDelete = document.getElementById('btnDeletePlantilla');
        if (btnDelete) {
            btnDelete.style.display = puedeCopiarPlantillas() ? 'inline-flex' : 'none';
        }

        const dimensiones = await api.plantillas.getDimensiones(currentPlantillaId);
        renderPlantilla(dimensiones, container);
    } catch (error) {
        console.error('Error cargando plantilla:', error);
        container.innerHTML = `<div class="alert alert-danger">Error al cargar la plantilla: ${error.message}</div>`;
    }
}

function renderPlantilla(dimensiones, container) {
    if (!document.getElementById('plantilla-styles')) {
        const style = document.createElement('style');
        style.id = 'plantilla-styles';
        style.textContent = `
            .dim-card { background: #fff; border-radius: 12px; box-shadow: 0 4px 15px rgba(0,0,0,0.05); margin-bottom: 24px; overflow: hidden; border: 1px solid #eaeaea; transition: transform 0.2s; }
            .dim-header { display: flex; justify-content: space-between; align-items: center; background: linear-gradient(to right, #ffffff, #f8f9fa); padding: 20px 24px; border-bottom: 1px solid #eaeaea; }
            .dim-title-group { display: flex; align-items: center; gap: 15px; }
            .drag-handle-dim { color: #b0b5ba; cursor: grab; font-size: 20px; transition: color 0.2s; }
            .drag-handle-dim:hover { color: #002b5e; }
            .dim-name { font-size: 1.25rem; font-weight: 600; color: #1a233a; margin: 0; }
            .dim-actions { display: flex; gap: 10px; }
            .btn-action-dim { padding: 8px 14px; border-radius: 8px; font-size: 0.85rem; font-weight: 600; display: inline-flex; align-items: center; gap: 8px; border: 1px solid transparent; cursor: pointer; transition: all 0.2s; }
            .btn-action-dim svg { width: 14px; height: 14px; }
            .btn-action-dim:hover { transform: translateY(-1px); box-shadow: 0 4px 8px rgba(0,0,0,0.05); }
            .btn-edit-dim { color: #004080; border-color: #d0e1f9; background: #f0f6ff; }
            .btn-edit-dim:hover { background: #e0edff; }
            .btn-del-dim { color: #dc3545; border-color: #f8d7da; background: #fff5f6; }
            .btn-del-dim:hover { background: #ffebee; }
            .btn-add-ind { color: #fff; background: #004080; border-color: #004080; }
            .btn-add-ind:hover { background: #002b5e; }
            
            .ind-list { list-style: none; padding: 0; margin: 0; }
            .ind-item { display: flex; justify-content: space-between; align-items: center; padding: 16px 24px; border-bottom: 1px solid #f0f0f0; background: #fff; transition: background 0.2s; }
            .ind-item:last-child { border-bottom: none; }
            .ind-item:hover { background: #fcfcfc; }
            .ind-content { display: flex; align-items: flex-start; gap: 16px; flex: 1; }
            .drag-handle-ind { color: #d0d5da; cursor: grab; padding-top: 2px; }
            .drag-handle-ind:hover { color: #004080; }
            .ind-text { font-size: 0.95rem; color: #444; line-height: 1.5; margin: 0; }
            .ind-actions { display: flex; gap: 6px; opacity: 0.7; transition: opacity 0.2s; }
            .ind-item:hover .ind-actions { opacity: 1; }
            .btn-icon { width: 34px; height: 34px; border-radius: 8px; display: inline-flex; align-items: center; justify-content: center; border: 1px solid transparent; cursor: pointer; transition: all 0.2s; background: transparent; }
            .btn-icon svg { width: 16px; height: 16px; }
            .btn-icon-edit { color: #004080; }
            .btn-icon-edit:hover { background: #f0f6ff; border-color: #d0e1f9; }
            .btn-icon-del { color: #dc3545; }
            .btn-icon-del:hover { background: #fff5f6; border-color: #f8d7da; }
            .empty-inds { padding: 30px; text-align: center; color: #888; font-style: italic; font-size: 0.95rem; background: #fafafa; }
        `;
        document.head.appendChild(style);
    }

    if (!dimensiones || dimensiones.length === 0) {
        container.innerHTML = '<div class="empty-state" style="text-align:center; padding: 50px; background: #fff; border-radius: 12px; box-shadow: 0 4px 15px rgba(0,0,0,0.05);">No hay dimensiones configuradas. Haga clic en "Nueva Dimensión" para comenzar.</div>';
        return;
    }

    const isAdmin = state.currentUser?.rol_id === 1;

    let html = '';
    dimensiones.sort((a, b) => a.orden - b.orden).forEach(dim => {
        html += `
            <div class="dim-card" data-id="${dim.id}">
                <div class="dim-header">
                    <div class="dim-title-group">
                        ${isAdmin ? '<span class="drag-handle-dim">☰</span>' : ''}
                        <h3 class="dim-name">${dim.nombre}</h3>
                    </div>
                    ${isAdmin ? `
                    <div class="dim-actions">
                        <button class="btn-action-dim btn-edit-dim" onclick="window.app.showModalDimension(${dim.id}, \`${dim.nombre}\`)">
                            <svg fill="currentColor" viewBox="0 0 20 20"><path d="M13.586 3.586a2 2 0 112.828 2.828l-.793.793-2.828-2.828.793-.793zM11.379 5.793L3 14.172V17h2.828l8.38-8.379-2.83-2.828z"></path></svg>
                            Editar
                        </button>
                        <button class="btn-action-dim btn-del-dim" onclick="window.app.deleteDimension(${dim.id})">
                            <svg fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clip-rule="evenodd"></path></svg>
                            Eliminar
                        </button>
                        <button class="btn-action-dim btn-add-ind" onclick="window.app.showModalIndicador(${dim.id})">
                            <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M12 4v16m8-8H4"></path></svg>
                            Nuevo Indicador
                        </button>
                    </div>
                    ` : ''}
                </div>
                <div class="dim-body">
                    <ul class="ind-list" data-dimension-id="${dim.id}">
        `;

        if (dim.subdimensiones && dim.subdimensiones.length > 0) {
            dim.subdimensiones.sort((a, b) => a.orden - b.orden).forEach(sub => {
                html += `
                        <li class="ind-item" data-id="${sub.id}">
                            <div class="ind-content">
                                ${isAdmin ? '<span class="drag-handle-ind">⠿</span>' : ''}
                                <div class="ind-text-group" style="display: flex; flex-direction: column; gap: 4px;">
                                    <p class="ind-title" style="font-weight: 600; font-size: 1rem; color: #2c3e50; margin: 0;">${sub.nombre}</p>
                                    ${sub.descripcion ? `<p class="ind-desc" style="font-size: 0.85rem; color: #6c757d; line-height: 1.4; margin: 0;">${sub.descripcion}</p>` : ''}
                                </div>
                            </div>
                            ${isAdmin ? `
                            <div class="ind-actions">
                                <button class="btn-icon btn-icon-edit" onclick='window.app.showModalIndicador(${dim.id}, ${sub.id}, ${JSON.stringify(sub.nombre).replace(/'/g, "\\'")}, ${JSON.stringify(sub.descripcion || "").replace(/'/g, "\\'")})' title="Editar Indicador">
                                    <svg fill="currentColor" viewBox="0 0 20 20"><path d="M13.586 3.586a2 2 0 112.828 2.828l-.793.793-2.828-2.828.793-.793zM11.379 5.793L3 14.172V17h2.828l8.38-8.379-2.83-2.828z"></path></svg>
                                </button>
                                <button class="btn-icon btn-icon-del" onclick="window.app.deleteIndicador(${sub.id})" title="Eliminar Indicador">
                                    <svg fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clip-rule="evenodd"></path></svg>
                                </button>
                            </div>
                            ` : ''}
                        </li>
                `;
            });
        } else {
            html += `<li class="empty-inds">${isAdmin ? 'No hay indicadores. Añade el primero.' : 'Sin indicadores.'}</li>`;
        }

        html += `
                    </ul>
                </div>
            </div>
        `;
    });

    container.innerHTML = html;

    if (window.Sortable && isAdmin) {
        new Sortable(container, {
            animation: 150,
            handle: '.drag-handle-dim',
            ghostClass: 'sortable-ghost',
            onEnd: async function (evt) {
                const dimensionIds = Array.from(container.querySelectorAll('.dim-card')).map(card => parseInt(card.dataset.id));
                try {
                    await api.dimensiones.reorder(dimensionIds);
                } catch (error) {
                    console.error('Error reordenando dimensiones', error);
                    showAlert('Error', 'No se pudo guardar el orden de las dimensiones');
                }
            }
        });

        container.querySelectorAll('.ind-list').forEach(ul => {
            new Sortable(ul, {
                animation: 150,
                handle: '.drag-handle-ind',
                group: 'shared', 
                ghostClass: 'sortable-ghost',
                onEnd: async function (evt) {
                    const dimensionId = parseInt(evt.to.dataset.dimensionId);
                    const indicadorIds = Array.from(evt.to.querySelectorAll('li.ind-item[data-id]')).map(li => parseInt(li.dataset.id));
                    try {
                        await api.dimensiones.reorderIndicadores(indicadorIds);
                    } catch (error) {
                         console.error('Error reordenando indicadores', error);
                         showAlert('Error', 'No se pudo guardar el orden de los indicadores');
                    }
                }
            });
        });
    }
}

export async function showModalDimension(id = null, nombre = '') {
    const isEdit = id !== null;
    const title = isEdit ? 'Editar Dimensión' : 'Nueva Dimensión';
    
    document.getElementById('modalTitle').textContent = title;
    
    const bodyHtml = `
        <div class="form-group">
            <label>Nombre de la Dimensión *</label>
            <input type="text" id="modalDimNombre" value="${nombre}" class="form-control" placeholder="Ej: Liderazgo" required>
        </div>
        <div class="modal-actions" style="margin-top: 25px; display: flex; justify-content: flex-end; gap: 10px;">
            <button class="btn btn-secondary" onclick="window.app.closeModal()">Cancelar</button>
            <button class="btn btn-primary" onclick="window.app.saveDimension(${id || 'null'})">Guardar Dimensión</button>
        </div>
    `;
    
    document.getElementById('modalBody').innerHTML = bodyHtml;
    document.getElementById('modalOverlay').classList.add('active');
}

export async function saveDimension(id) {
    const nombre = document.getElementById('modalDimNombre').value;
    
    if (!nombre) {
        showAlert('Atención', 'El nombre es requerido');
        return;
    }
    
    try {
        const plantillaId = state.editingPlantillaId || 1;
        if (id) {
            await api.dimensiones.update(id, { nombre: nombre });
        } else {
            await api.dimensiones.create({ nombre: nombre, plantilla_id: plantillaId });
        }
        document.getElementById('modalOverlay').classList.remove('active');
        await loadPlantilla(plantillaId);
    } catch (error) {
        showAlert('Error', error.message, 'error');
    }
}

export async function deleteDimension(id) {
    if (!confirm('¿Está seguro de eliminar esta dimensión? Se eliminarán todos sus indicadores irreversiblemente.')) return;
    
    try {
        const plantillaId = state.editingPlantillaId || 1;
        await api.dimensiones.delete(id);
        await loadPlantilla(plantillaId);
    } catch (error) {
        showAlert('Error', error.message, 'error');
    }
}

export async function showModalIndicador(dimensionId, id = null, nombre = '', descripcion = '') {
    const isEdit = id !== null;
    const title = isEdit ? 'Editar Indicador' : 'Nuevo Indicador';
    
    document.getElementById('modalTitle').textContent = title;
    
    const bodyHtml = `
        <input type="hidden" id="modalIndDimId" value="${dimensionId}">
        <div class="form-group" style="margin-bottom: 15px;">
            <label>Nombre del Indicador (Corto) *</label>
            <input type="text" id="modalIndNombre" class="form-control" value="${nombre.replace(/"/g, '&quot;')}" placeholder="Ej: 1. Expresión verbal" required>
        </div>
        <div class="form-group">
            <label>Descripción detallada</label>
            <textarea id="modalIndDesc" class="form-control" rows="3" placeholder="Ej: Comunica con claridad los objetivos...">${descripcion}</textarea>
        </div>
        <div class="modal-actions" style="margin-top: 25px; display: flex; justify-content: flex-end; gap: 10px;">
            <button class="btn btn-secondary" onclick="window.app.closeModal()">Cancelar</button>
            <button class="btn btn-primary" onclick="window.app.saveIndicador(${id || 'null'})">Guardar Indicador</button>
        </div>
    `;
    
    document.getElementById('modalBody').innerHTML = bodyHtml;
    document.getElementById('modalOverlay').classList.add('active');
}

export async function saveIndicador(id) {
    const dimensionId = parseInt(document.getElementById('modalIndDimId').value);
    const nombre = document.getElementById('modalIndNombre').value;
    const descripcion = document.getElementById('modalIndDesc').value;
    
    if (!nombre) {
        showAlert('Atención', 'El nombre del indicador es requerido');
        return;
    }
    
    try {
        const plantillaId = state.editingPlantillaId || 1;
        if (id) {
            // EDICIÓN: actualizar solo ese indicador en el DOM (sin recargar toda la rúbrica)
            await api.dimensiones.updateIndicador(id, { nombre: nombre, descripcion: descripcion, dimension_id: dimensionId });
            updateIndicadorDOM(id, dimensionId, nombre, descripcion);
            document.getElementById('modalOverlay').classList.remove('active');
        } else {
            // CREACIÓN: agrega un ítem nuevo → re-render para traerlo con su id y handlers
            await api.dimensiones.createIndicador(dimensionId, { nombre: nombre, descripcion: descripcion, dimension_id: dimensionId });
            document.getElementById('modalOverlay').classList.remove('active');
            await loadPlantilla(plantillaId);
        }
    } catch (error) {
        showAlert('Error', error.message, 'error');
    }
}

// Actualiza un indicador ya renderizado in situ, evitando recargar toda la rúbrica.
function updateIndicadorDOM(id, dimensionId, nombre, descripcion) {
    const li = document.querySelector(`.ind-item[data-id="${id}"]`);
    if (!li) return;

    const titleEl = li.querySelector('.ind-title');
    if (titleEl) titleEl.textContent = nombre;

    const group = li.querySelector('.ind-text-group');
    let descEl = li.querySelector('.ind-desc');
    if (descripcion && descripcion.trim()) {
        if (!descEl && group) {
            descEl = document.createElement('p');
            descEl.className = 'ind-desc';
            descEl.style.cssText = 'font-size: 0.85rem; color: #6c757d; line-height: 1.4; margin: 0;';
            group.appendChild(descEl);
        }
        if (descEl) descEl.textContent = descripcion;
    } else if (descEl) {
        descEl.remove();
    }

    // Refrescar los valores que el botón "Editar" pasa al modal la próxima vez
    const editBtn = li.querySelector('.btn-icon-edit');
    if (editBtn) {
        editBtn.setAttribute(
            'onclick',
            `window.app.showModalIndicador(${dimensionId}, ${id}, ${JSON.stringify(nombre)}, ${JSON.stringify(descripcion || '')})`
        );
    }
}

export async function deleteIndicador(id) {
    if (!confirm('¿Está seguro de eliminar este indicador?')) return;
    
    try {
        const plantillaId = state.editingPlantillaId || 1;
        await api.dimensiones.deleteIndicador(id);
        await loadPlantilla(plantillaId);
    } catch (error) {
        showAlert('Error', error.message, 'error');
    }
}

export async function exportarPlantillaExcel() {
    try {
        await api.dimensiones.exportExcel();
    } catch (error) {
        console.error("Error al exportar plantilla", error);
        showAlert("Error", "No se pudo exportar la plantilla a Excel.");
    }
}

export async function showModalEditPlantilla() {
    const select = document.getElementById('selectPlantillaEdit');
    if (!select) return;

    let plantillaId = parseInt(select.value);
    // Si el select está vacío (carga previa fallida), intentar repoblarlo antes de continuar
    if (!plantillaId || isNaN(plantillaId)) {
        try {
            const plantillas = await api.plantillas.getAll();
            if (plantillas.length) {
                select.innerHTML = plantillas.map(p => `<option value="${p.id}">${p.nombre_largo || p.nombre}</option>`).join('');
                plantillaId = parseInt(select.value);
            }
        } catch (e) { /* se maneja abajo */ }
    }
    if (!plantillaId || isNaN(plantillaId)) {
        showAlert('Atención', 'No hay ninguna plantilla seleccionada. Recarga la página (Ctrl+Shift+R) e inténtalo de nuevo.', 'warning');
        return;
    }

    const esAdmin = state.currentUser?.rol_id === 1;

    mostrarLoading(true, 'Obteniendo datos de plantilla...');
    try {
        const plantilla = await api.plantillas.get(plantillaId);
        // Solo el admin puede reasignar el colegio de una plantilla
        let colegioFieldHtml = '';
        if (esAdmin) {
            const colegios = await api.colegios.getAll();
            colegioFieldHtml = `
            <div class="form-group" style="margin-bottom:15px;">
                <label style="font-weight: 600; display:block; margin-bottom:5px;">Colegio</label>
                <select id="modalPlantillaColegio" class="form-select">
                    <option value="">— Sin colegio (global / LIDERAZGO) —</option>
                    ${colegios.map(c => `<option value="${c.id}" ${plantilla.colegio_id === c.id ? 'selected' : ''}>${c.nombre}</option>`).join('')}
                </select>
            </div>`;
        }
        mostrarLoading(false);

        document.getElementById('modalTitle').textContent = 'Editar Plantilla';

        const bodyHtml = `
            <div class="form-group" style="margin-bottom:15px;">
                <label style="font-weight: 600; display:block; margin-bottom:5px;">Nombre de la Plantilla *</label>
                <input type="text" id="modalPlantillaNombre" value="${plantilla.nombre || ''}" class="form-control" required>
            </div>
            <div class="form-group" style="margin-bottom:15px;">
                <label style="font-weight: 600; display:block; margin-bottom:5px;">Nombre Largo</label>
                <input type="text" id="modalPlantillaNombreLargo" value="${plantilla.nombre_largo || ''}" class="form-control">
            </div>
            <div class="form-group" style="margin-bottom:15px;">
                <label style="font-weight: 600; display:block; margin-bottom:5px;">Tipo de Plantilla *</label>
                <select id="modalPlantillaTipo" class="form-select" required>
                    <option value="LIDERAZGO" ${plantilla.tipo === 'LIDERAZGO' ? 'selected' : ''}>LIDERAZGO</option>
                    <option value="visita" ${plantilla.tipo === 'visita' ? 'selected' : ''}>visita</option>
                </select>
            </div>
            <div class="form-group" style="margin-bottom:15px;">
                <label style="font-weight: 600; display:block; margin-bottom:5px;">Slug *</label>
                <input type="text" id="modalPlantillaSlug" value="${plantilla.slug || ''}" class="form-control" required>
            </div>
            <div class="form-group" style="margin-bottom:15px;">
                <label style="font-weight: 600; display:block; margin-bottom:5px;">Formato (diseño del formulario) *</label>
                <select id="modalPlantillaFormato" class="form-select" required>
                    <option value="ORIENTACION" ${plantilla.formato === 'ORIENTACION' ? 'selected' : ''}>Orientación / Convivencia</option>
                    <option value="UTP" ${plantilla.formato === 'UTP' ? 'selected' : ''}>UTP (por pasos)</option>
                    <option value="PIE" ${plantilla.formato === 'PIE' ? 'selected' : ''}>PIE</option>
                    <option value="LIDERAZGO" ${plantilla.formato === 'LIDERAZGO' ? 'selected' : ''}>Liderazgo</option>
                </select>
            </div>
            ${colegioFieldHtml}
            <div class="form-group" style="margin-bottom:15px; display:flex; align-items:center; gap:10px;">
                <input type="checkbox" id="modalPlantillaActiva" ${plantilla.activa ? 'checked' : ''} style="width:18px; height:18px; cursor:pointer;">
                <label for="modalPlantillaActiva" style="font-weight: 600; cursor:pointer;">Plantilla Activa</label>
            </div>
            <div class="modal-actions" style="margin-top: 25px; display: flex; justify-content: flex-end; gap: 10px;">
                <button class="btn btn-secondary" onclick="window.app.closeModal()">Cancelar</button>
                <button class="btn btn-primary" onclick="window.app.savePlantilla(${plantilla.id})">Guardar Cambios</button>
            </div>
        `;
        
        document.getElementById('modalBody').innerHTML = bodyHtml;
        document.getElementById('modalOverlay').classList.add('active');
    } catch (error) {
        mostrarLoading(false);
        showAlert('Error', `No se pudieron cargar los datos de la plantilla: ${error.message}`, 'error');
    }
}

export async function deletePlantilla() {
    const select = document.getElementById('selectPlantillaEdit');
    if (!select || !select.value) {
        showAlert('Atención', 'Selecciona una plantilla para eliminar.');
        return;
    }
    const plantillaId = parseInt(select.value);
    const nombre = select.options[select.selectedIndex]?.text || 'esta plantilla';

    if (!confirm(`¿Eliminar "${nombre}"? Esta acción es irreversible. (No se podrá si la plantilla está en uso.)`)) return;

    mostrarLoading(true, 'Eliminando plantilla...');
    try {
        await api.plantillas.delete(plantillaId);
        mostrarLoading(false);
        showAlert('Éxito', 'Plantilla eliminada correctamente.', 'success');
        const sel = document.getElementById('selectPlantillaEdit');
        if (sel) sel.innerHTML = '';
        await loadPlantilla();
    } catch (error) {
        mostrarLoading(false);
        showAlert('No se puede eliminar', error.message, 'error');
    }
}

export async function exportarEstructuraPlantilla() {
    const select = document.getElementById('selectPlantillaEdit');
    if (!select || !select.value) {
        showAlert('Atención', 'Selecciona una plantilla para exportar su estructura.');
        return;
    }
    const plantillaId = parseInt(select.value);
    try {
        mostrarLoading(true, 'Generando Excel...');
        const response = await api.plantillas.exportEstructura(plantillaId);
        if (!response.ok) throw new Error('No se pudo exportar la estructura');
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `estructura_plantilla_${plantillaId}.xlsx`;
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

export async function showModalImportPlantilla() {
    const esAdmin = state.currentUser?.rol_id === 1;

    // Para el admin, cargar colegios (puede elegir) ; para director se asigna el suyo automáticamente
    let colegioFieldHtml = '';
    if (esAdmin) {
        let colegios = [];
        try { colegios = await api.colegios.getAll(); } catch (e) { colegios = []; }
        colegioFieldHtml = `
            <div class="form-group" style="margin:0;">
                <label style="font-weight:600; display:block; margin-bottom:4px; font-size:0.85rem;">Colegio</label>
                <select id="impPlantillaColegio" class="form-select">
                    <option value="">— Sin colegio (global) —</option>
                    ${colegios.map(c => `<option value="${c.id}">${c.nombre}</option>`).join('')}
                </select>
            </div>`;
    }

    document.getElementById('modalTitle').textContent = 'Importar Plantilla desde Excel';
    document.getElementById('modalBody').innerHTML = `
        <p style="margin:0 0 12px; color:#555; font-size:0.9rem;">Se creará una <strong>nueva plantilla</strong> con la estructura (dimensiones e indicadores) del Excel.</p>
        <div style="display:grid; grid-template-columns:1fr 1fr; gap:12px;">
            <div class="form-group" style="margin:0;">
                <label style="font-weight:600; display:block; margin-bottom:4px; font-size:0.85rem;">Nombre de la Plantilla *</label>
                <input type="text" id="impPlantillaNombre" class="form-control" placeholder="Ej: Visita UTP - Colegio X" required>
            </div>
            <div class="form-group" style="margin:0;">
                <label style="font-weight:600; display:block; margin-bottom:4px; font-size:0.85rem;">Nombre Largo</label>
                <input type="text" id="impPlantillaNombreLargo" class="form-control">
            </div>
            <div class="form-group" style="margin:0;">
                <label style="font-weight:600; display:block; margin-bottom:4px; font-size:0.85rem;">Tipo *</label>
                <select id="impPlantillaTipo" class="form-select" required>
                    <option value="VISITA">VISITA</option>
                    <option value="LIDERAZGO">LIDERAZGO</option>
                </select>
            </div>
            <div class="form-group" style="margin:0;">
                <label style="font-weight:600; display:block; margin-bottom:4px; font-size:0.85rem;">Slug</label>
                <input type="text" id="impPlantillaSlug" class="form-control" placeholder="(opcional)">
            </div>
            <div class="form-group" style="margin:0;">
                <label style="font-weight:600; display:block; margin-bottom:4px; font-size:0.85rem;">Formato (diseño) *</label>
                <select id="impPlantillaFormato" class="form-select" required>
                    <option value="ORIENTACION">Orientación / Convivencia</option>
                    <option value="UTP">UTP (por pasos)</option>
                    <option value="PIE">PIE</option>
                    <option value="LIDERAZGO">Liderazgo</option>
                </select>
            </div>
            ${colegioFieldHtml}
            <div class="form-group" style="margin:0; grid-column:1 / -1;">
                <label style="font-weight:600; display:block; margin-bottom:4px; font-size:0.85rem;">Archivo Excel (.xlsx) *</label>
                <input type="file" id="impPlantillaFile" class="form-control" accept=".xlsx,.xls" required>
                <small style="color:#64748b;">Columnas esperadas: <strong>Dimensión</strong>, <strong>Indicador</strong>, <strong>Descripción</strong>.</small>
            </div>
        </div>
        <div class="modal-actions" style="margin-top:18px; display:flex; justify-content:flex-end; gap:10px;">
            <button class="btn btn-secondary" onclick="window.app.closeModal()">Cancelar</button>
            <button class="btn btn-primary" onclick="window.app.confirmImportPlantilla()">Crear Plantilla</button>
        </div>
    `;
    document.getElementById('modalOverlay').classList.add('active');
}

export async function confirmImportPlantilla() {
    const nombre = document.getElementById('impPlantillaNombre').value.trim();
    const nombre_largo = document.getElementById('impPlantillaNombreLargo').value.trim();
    const tipo = document.getElementById('impPlantillaTipo').value;
    const slug = document.getElementById('impPlantillaSlug').value.trim();
    const formato = document.getElementById('impPlantillaFormato').value;
    const colegioSelect = document.getElementById('impPlantillaColegio');
    const fileInput = document.getElementById('impPlantillaFile');
    const file = fileInput?.files?.[0];

    if (!nombre || !tipo) {
        showAlert('Atención', 'Nombre y Tipo son obligatorios.');
        return;
    }
    if (!file) {
        showAlert('Atención', 'Debes seleccionar un archivo Excel.');
        return;
    }

    const formData = new FormData();
    formData.append('nombre', nombre);
    formData.append('nombre_largo', nombre_largo);
    formData.append('tipo', tipo);
    formData.append('slug', slug);
    formData.append('formato', formato);
    if (colegioSelect && colegioSelect.value) formData.append('colegio_id', colegioSelect.value);
    formData.append('file', file);

    mostrarLoading(true, 'Importando plantilla...');
    try {
        const resp = await api.plantillas.importExcel(formData);
        const data = await resp.json().catch(() => ({}));
        if (!resp.ok) {
            throw new Error(data.detail || 'No se pudo importar la plantilla');
        }
        mostrarLoading(false);
        document.getElementById('modalOverlay').classList.remove('active');
        showAlert('Éxito', 'Plantilla creada desde el Excel correctamente.', 'success');

        const select = document.getElementById('selectPlantillaEdit');
        if (select) select.innerHTML = '';
        await loadPlantilla(data.id);
    } catch (error) {
        mostrarLoading(false);
        showAlert('Error', error.message, 'error');
    }
}

export function puedeCopiarPlantillas() {
    const u = state.currentUser;
    if (!u) return false;
    const r = (u.rol?.nombre || '').toLowerCase();
    return u.rol_id === 1 || r === 'director' || r === 'utp' || r === 'pie' || r === 'orien_conv';
}

function colegiosDelUsuario() {
    // state.currentUser.colegio_id puede ser "1" o "1,2"
    const raw = state.currentUser?.colegio_id;
    if (!raw) return [];
    return String(raw).split(',').map(s => s.trim()).filter(s => /^\d+$/.test(s)).map(Number);
}

export async function duplicarPlantilla() {
    const select = document.getElementById('selectPlantillaEdit');
    if (!select || !select.value) return;
    const plantillaId = parseInt(select.value);
    const nombrePlantilla = select.options[select.selectedIndex]?.text || 'la plantilla';

    const esAdmin = state.currentUser?.rol_id === 1;
    const misColegios = colegiosDelUsuario();

    // Director con un único colegio: se copia directo a ese colegio (modal de confirmación)
    if (!esAdmin && misColegios.length === 1) {
        showConfirm(
            'Copiar Plantilla',
            `Se creará una copia editable de <strong>${nombrePlantilla}</strong> (con todas sus dimensiones e indicadores) para tu colegio.`,
            () => ejecutarDuplicado(plantillaId, misColegios[0])
        );
        return;
    }

    // Admin, o director con varios colegios: modal para elegir el colegio destino
    mostrarLoading(true, 'Cargando colegios...');
    let colegios = [];
    try {
        colegios = await api.colegios.getAll(); // el backend ya filtra por los colegios del usuario
    } catch (error) {
        mostrarLoading(false);
        showAlert('Error', `No se pudieron cargar los colegios: ${error.message}`, 'error');
        return;
    }
    mostrarLoading(false);

    if (!colegios.length) {
        showAlert('Atención', 'No tienes colegios disponibles para asignar la plantilla.', 'warning');
        return;
    }

    document.getElementById('modalTitle').textContent = 'Copiar Plantilla';
    document.getElementById('modalBody').innerHTML = `
        <p style="margin-bottom:15px; color:#555;">Se creará una copia editable de <strong>${nombrePlantilla}</strong> (con todas sus dimensiones e indicadores).</p>
        <div class="form-group" style="margin-bottom:15px;">
            <label style="font-weight:600; display:block; margin-bottom:5px;">Colegio destino *</label>
            <select id="modalDupColegio" class="form-select" required>
                ${colegios.map(c => `<option value="${c.id}">${c.nombre}</option>`).join('')}
            </select>
        </div>
        <div class="modal-actions" style="margin-top:25px; display:flex; justify-content:flex-end; gap:10px;">
            <button class="btn btn-secondary" onclick="window.app.closeModal()">Cancelar</button>
            <button class="btn btn-primary" onclick="window.app.confirmarDuplicarPlantilla(${plantillaId})">Crear Copia</button>
        </div>
    `;
    document.getElementById('modalOverlay').classList.add('active');
}

export async function confirmarDuplicarPlantilla(plantillaId) {
    const colegioId = parseInt(document.getElementById('modalDupColegio').value);
    if (!colegioId) {
        showAlert('Atención', 'Debes seleccionar un colegio destino.');
        return;
    }
    document.getElementById('modalOverlay').classList.remove('active');
    await ejecutarDuplicado(plantillaId, colegioId);
}

async function ejecutarDuplicado(plantillaId, colegioId) {
    mostrarLoading(true, 'Copiando plantilla...');
    try {
        const nueva = await api.plantillas.duplicate(plantillaId, { colegio_id: colegioId });
        mostrarLoading(false);
        showAlert('Éxito', 'Plantilla copiada correctamente. Ahora puedes adaptarla.', 'success');

        // Forzar refresco del select y abrir la nueva plantilla
        const select = document.getElementById('selectPlantillaEdit');
        if (select) select.innerHTML = '';
        await loadPlantilla(nueva.id);
    } catch (error) {
        mostrarLoading(false);
        showAlert('Error', error.message, 'error');
    }
}

export async function savePlantilla(id) {
    const nombre = document.getElementById('modalPlantillaNombre').value;
    const nombre_largo = document.getElementById('modalPlantillaNombreLargo').value;
    const tipo = document.getElementById('modalPlantillaTipo').value;
    const slug = document.getElementById('modalPlantillaSlug').value;
    const formato = document.getElementById('modalPlantillaFormato')?.value || null;
    const activa = document.getElementById('modalPlantillaActiva').checked;
    const colegioSelect = document.getElementById('modalPlantillaColegio');

    if (!nombre || !tipo || !slug) {
        showAlert('Atención', 'Nombre, Tipo y Slug son campos obligatorios');
        return;
    }

    const payload = { nombre, nombre_largo, tipo, slug, formato, activa };
    // Solo el admin tiene este selector; "" = sin colegio (global). Enviamos 0 para limpiar.
    if (colegioSelect) {
        payload.colegio_id = colegioSelect.value ? parseInt(colegioSelect.value) : 0;
    }

    mostrarLoading(true, 'Guardando plantilla...');
    try {
        await api.plantillas.update(id, payload);
        mostrarLoading(false);
        document.getElementById('modalOverlay').classList.remove('active');
        showAlert('Éxito', 'Plantilla actualizada correctamente', 'success');
        
        // Limpiar y recargar el select para forzar refresco
        const select = document.getElementById('selectPlantillaEdit');
        if (select) {
            select.innerHTML = '';
        }
        await loadPlantilla(id);
    } catch (error) {
        mostrarLoading(false);
        showAlert('Error', error.message, 'error');
    }
}

