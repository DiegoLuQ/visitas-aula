import { api } from '../api.js';
import { state } from '../state.js';
import { capitalize } from '../utils.js';

export function closeModal() {
    const overlay = document.getElementById('modalOverlay');
    if (overlay) {
        overlay.classList.remove('active');
        // Restaurar el ancho por defecto (algunos modales lo amplían con .modal-wide)
        overlay.querySelector('.modal')?.classList.remove('modal-wide');
        document.getElementById('modalBody').innerHTML = '';
    }
}

export function showGenericModal(title, content) {
    const titleEl = document.getElementById('modalTitle');
    const bodyEl = document.getElementById('modalBody');
    if (titleEl) titleEl.textContent = title;
    if (bodyEl) bodyEl.innerHTML = content;
    document.getElementById('modalOverlay').classList.add('active');
}

export async function showModal(type, data = null) {
    const isEdit = data !== null;
    const titleEl = document.getElementById('modalTitle');
    if (titleEl) {
        titleEl.textContent = `${isEdit ? 'Editar' : 'Agregar'} ${capitalize(type)}`;
    }
    
    let bodyHtml = '';

    switch (type) {
        case 'colegio':
            bodyHtml = `
                <div class="form-group"><label>Nombre *</label><input type="text" id="modalNombre" value="${data?.nombre || ''}" required></div>
                <div class="form-group"><label>Dirección</label><input type="text" id="modalDireccion" value="${data?.direccion || ''}"></div>
                <div class="modal-actions">
                    <button class="btn btn-primary" onclick="window.app.saveColegio(${data?.id || 'null'})">Guardar</button>
                    <button class="btn btn-secondary" onclick="window.app.closeModal()">Cancelar</button>
                </div>
            `;
            break;
        case 'docente':
            bodyHtml = `
                <div class="form-group"><label>Nombre *</label><input type="text" id="modalNombre" value="${data?.nombre || ''}" required></div>
                <div class="form-group"><label>RUT * (Formato: 12345678-9)</label><input type="text" id="modalRut" value="${data?.rut || ''}" placeholder="12345678-9" required></div>
                <div class="form-group"><label>Email *</label><input type="email" id="modalEmail" value="${data?.email || ''}" required></div>
                <div class="form-group"><label>Colegio *</label><select id="modalColegio" class="form-select" required><option value="">Cargando...</option></select></div>
                <div class="modal-actions">
                    <button class="btn btn-primary" onclick="window.app.saveDocente(${data?.id || 'null'})">Guardar</button>
                    <button class="btn btn-secondary" onclick="window.app.closeModal()">Cancelar</button>
                </div>
            `;
            break;
        case 'curso':
            bodyHtml = `
                <div class="form-group"><label>Nivel *</label><select id="modalNivel" class="form-select" required><option value="">Cargando...</option></select></div>
                <div class="form-group"><label>Letra *</label><input type="text" id="modalLetra" maxlength="1" placeholder="Ej: A" value="${data?.letra || ''}" required></div>
                <div class="modal-actions">
                    <button class="btn btn-primary" onclick="window.app.saveCurso()">Guardar</button>
                    <button class="btn btn-secondary" onclick="window.app.closeModal()">Cancelar</button>
                </div>
            `;
            break;
        case 'asignatura':
            bodyHtml = `
                <div class="form-group"><label>Nombre *</label><input type="text" id="modalNombre" value="${data?.nombre || ''}" required></div>
                <div class="modal-actions">
                    <button class="btn btn-primary" onclick="window.app.saveAsignatura()">Guardar</button>
                    <button class="btn btn-secondary" onclick="window.app.closeModal()">Cancelar</button>
                </div>
            `;
            break;

    }

    const modalBody = document.getElementById('modalBody');
    if (modalBody) {
        modalBody.innerHTML = bodyHtml;
        document.getElementById('modalOverlay').classList.add('active');
        
        if (type === 'docente') await loadColegiosForModal(data?.colegio_id);
        if (type === 'curso') await loadNivelesForModal(data?.nivel_id);
    }
}

async function loadColegiosForModal(selectedId = null) {
    const select = document.getElementById('modalColegio');
    if (!select) return;
    try {
        const colegios = await api.colegios.getAll();
        select.innerHTML = '<option value="">Seleccione...</option>';
        colegios.forEach(c => {
            const opt = document.createElement('option');
            opt.value = c.id;
            opt.textContent = c.nombre;
            if (selectedId && c.id == selectedId) opt.selected = true;
            select.appendChild(opt);
        });
    } catch (error) { console.error(error); }
}

async function loadNivelesForModal(selectedId = null) {
    const select = document.getElementById('modalNivel');
    if (!select) return;
    try {
        const niveles = await api.niveles.getAll();
        select.innerHTML = '<option value="">Seleccione...</option>';
        niveles.forEach(n => {
            const opt = document.createElement('option');
            opt.value = n.id;
            opt.textContent = n.nombre;
            if (selectedId && n.id == selectedId) opt.selected = true;
            select.appendChild(opt);
        });
    } catch (error) { console.error(error); }
}
