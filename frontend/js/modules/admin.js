import { api } from '../api.js';
import { state, setState } from '../state.js';
import { showAlert, mostrarLoading } from '../utils.js';
import { showModal, closeModal } from './ui.js';

// --- Colegios ---
export async function loadColegios() {
    const tbody = document.getElementById('colegiosBody');
    if (!tbody) return;
    tbody.innerHTML = '<tr><td colspan="4">Cargando...</td></tr>';
    try {
        const data = await api.colegios.getAll();
        tbody.innerHTML = data.map(c => `
            <tr>
                <td>${c.id}</td>
                <td>${c.nombre}</td>
                <td>${c.direccion || '-'}</td>
                <td>
                    <div class="actions">
                        <button class="btn btn-warning btn-sm" onclick="window.app.editColegio(${c.id})" title="Editar"><i class="fas fa-edit"></i></button>
                        <button class="btn btn-danger btn-sm" onclick="window.app.deleteColegio(${c.id})" title="Eliminar"><i class="fas fa-trash"></i></button>
                    </div>
                </td>
            </tr>
        `).join('');
        setState('colegios', data);
    } catch (error) {
        tbody.innerHTML = `<tr><td colspan="4">Error: ${error.message}</td></tr>`;
    }
}

export async function saveColegio(id) {
    const nombre = document.getElementById('modalNombre').value;
    const direccion = document.getElementById('modalDireccion').value;
    if (!nombre) { showAlert('Requerido', 'Nombre es obligatorio', 'warning'); return; }
    try {
        if (id && id !== 'null') await api.colegios.update(id, { nombre, direccion });
        else await api.colegios.create({ nombre, direccion });
        closeModal();
        loadColegios();
    } catch (error) {
        showAlert('Error', error.message, 'error');
    }
}

export async function deleteColegio(id) {
    if (!confirm('¿Seguro?')) return;
    try {
        await api.colegios.delete(id);
        loadColegios();
    } catch (error) {
        showAlert('Error', error.message, 'error');
    }
}

export function editColegio(id) {
    const c = state.colegios.find(col => col.id === id);
    if (c) showModal('colegio', c);
}

// --- Cursos ---
export async function loadCursos() {
    const tbody = document.getElementById('cursosBody');
    if (!tbody) return;
    tbody.innerHTML = '<tr><td colspan="5">Cargando...</td></tr>';
    try {
        const data = await api.cursos.getAll();
        tbody.innerHTML = data.map(c => `
            <tr>
                <td>${c.id}</td>
                <td>${c.nivel?.nombre || '-'}</td>
                <td>${c.letra}</td>
                <td>${c.nivel?.nombre || ''} ${c.letra}</td>
                <td>
                    <div class="actions">
                        <button class="btn btn-danger btn-sm" onclick="window.app.deleteCurso(${c.id})" title="Eliminar"><i class="fas fa-trash"></i></button>
                    </div>
                </td>
            </tr>
        `).join('');
    } catch (error) {
        tbody.innerHTML = `<tr><td colspan="5">Error: ${error.message}</td></tr>`;
    }
}

export async function saveCurso() {
    const nivel_id = parseInt(document.getElementById('modalNivel').value);
    const letra = document.getElementById('modalLetra').value.toUpperCase();
    if (!nivel_id || !letra) { showAlert('Error', 'Complete los campos', 'warning'); return; }
    try {
        await api.cursos.create({ nivel_id, letra });
        closeModal();
        loadCursos();
    } catch (error) {
        showAlert('Error', error.message, 'error');
    }
}

export async function deleteCurso(id) {
    if (!confirm('¿Seguro?')) return;
    try {
        await api.cursos.delete(id);
        loadCursos();
    } catch (error) {
        showAlert('Error', error.message, 'error');
    }
}

// --- Asignaturas ---
export async function loadAsignaturas() {
    const tbody = document.getElementById('asignaturasBody');
    if (!tbody) return;
    tbody.innerHTML = '<tr><td colspan="3">Cargando...</td></tr>';
    try {
        const data = await api.asignaturas.getAll();
        tbody.innerHTML = data.map(a => `
            <tr>
                <td>${a.id}</td>
                <td>${a.nombre}</td>
                <td>
                    <div class="actions">
                        <button class="btn btn-danger btn-sm" onclick="window.app.deleteAsignatura(${a.id})" title="Eliminar"><i class="fas fa-trash"></i></button>
                    </div>
                </td>
            </tr>
        `).join('');
    } catch (error) {
        tbody.innerHTML = `<tr><td colspan="3">Error: ${error.message}</td></tr>`;
    }
}

export async function saveAsignatura() {
    const nombre = document.getElementById('modalNombre').value;
    if (!nombre) return;
    try {
        await api.asignaturas.create({ nombre });
        closeModal();
        loadAsignaturas();
    } catch (error) {
        showAlert('Error', error.message, 'error');
    }
}

export async function deleteAsignatura(id) {
    if (!confirm('¿Seguro?')) return;
    try {
        await api.asignaturas.delete(id);
        loadAsignaturas();
    } catch (error) {
        showAlert('Error', error.message, 'error');
    }
}

// --- Usuarios ---
export async function loadUsuarios() {
    const tbody = document.getElementById('usuariosBody');
    if (!tbody) return;
    tbody.innerHTML = '<tr><td colspan="7">Cargando...</td></tr>';
    try {
        const data = await api.auth.getUsers();
        tbody.innerHTML = data.map(u => `
            <tr>
                <td>${u.id}</td>
                <td>${u.username}</td>
                <td>${u.nombre_completo || '-'}</td>
                <td>${u.email}</td>
                <td><span class="badge ${u.rol_id === 1 ? 'badge-primary' : 'badge-secondary'}">${u.rol?.nombre || '-'}</span></td>
                <td><span class="badge ${u.activo ? 'badge-success' : 'badge-danger'}">${u.activo ? 'Activo' : 'Inactivo'}</span></td>
                <td>
                    <div class="actions">
                        <button class="btn btn-warning btn-sm" onclick="window.app.editUsuario(${u.id})" title="Editar"><i class="fas fa-edit"></i></button>
                        <button class="btn btn-danger btn-sm" onclick="window.app.deleteUsuario(${u.id})" title="Eliminar"><i class="fas fa-trash"></i></button>
                    </div>
                </td>
            </tr>
        `).join('');
        setState('usuarios', data);
    } catch (error) {
        tbody.innerHTML = `<tr><td colspan="7">Error: ${error.message}</td></tr>`;
    }
}

export async function editUsuario(id = null) {
    const isEdit = id !== null;
    const user = isEdit ? state.usuarios.find(u => u.id === id) : null;
    
    if (isEdit && !user) return;

    document.getElementById('modalUsuarioTitle').textContent = isEdit ? 'Editar Usuario' : 'Agregar Usuario';

    const starEl = document.getElementById('passwordRequiredStar');
    const helpEl = document.getElementById('passwordHelp');
    const passInput = document.getElementById('editUserPassword');

    if (isEdit) {
        document.getElementById('editUserId').value = user.id;
        document.getElementById('editUserUsername').value = user.username || '';
        document.getElementById('editUserNombreCompleto').value = user.nombre_completo || '';
        document.getElementById('editUserEmail').value = user.email;
        document.getElementById('editUserAcceso').value = user.acceso || 'todos';
        document.getElementById('editUserActivo').value = user.activo ? '1' : '0';
        
        if (starEl) starEl.style.display = 'none';
        if (helpEl) helpEl.textContent = 'Dejar en blanco para no cambiar';
        if (passInput) passInput.required = false;
    } else {
        document.getElementById('editUserId').value = '';
        document.getElementById('editUserUsername').value = '';
        document.getElementById('editUserNombreCompleto').value = '';
        document.getElementById('editUserEmail').value = '';
        document.getElementById('editUserAcceso').value = 'todos';
        document.getElementById('editUserActivo').value = '1';
        
        if (starEl) starEl.style.display = 'inline';
        if (helpEl) helpEl.textContent = 'Ingrese una contraseña segura';
        if (passInput) passInput.required = true;
    }
    
    // Asegurar que los colegios estén cargados
    if (!state.colegios || state.colegios.length === 0) {
        try {
            state.colegios = await api.colegios.getAll();
        } catch (err) {
            console.error('Error loading schools for user edit:', err);
        }
    }

    // Poblar colegios como checkboxes
    const colegioContainer = document.getElementById('editUserColegioContainer');
    if (colegioContainer) {
        const colegios = state.colegios || [];
        const assignedIds = isEdit ? (user.colegio_id || '').split(',').map(id => id.trim()).filter(id => id) : [];
        const hasAccessToAll = isEdit ? (!user.colegio_id) : true;

        let html = `
            <label class="colegio-checkbox-item todos-option ${hasAccessToAll ? 'checked' : ''}">
                <input type="checkbox" name="colegio_check" value="todos" ${hasAccessToAll ? 'checked' : ''}>
                <span class="colegio-label">🏫 Todos los Colegios (Acceso Total)</span>
            </label>`;
        
        html += colegios.map(c => {
            const isChecked = !hasAccessToAll && assignedIds.includes(String(c.id));
            return `
            <label class="colegio-checkbox-item ${isChecked ? 'checked' : ''}">
                <input type="checkbox" name="colegio_check" value="${c.id}" ${isChecked ? 'checked' : ''} ${hasAccessToAll ? 'disabled' : ''}>
                <span class="colegio-label">${c.nombre}</span>
            </label>`;
        }).join('');

        colegioContainer.innerHTML = html;

        // Lógica: si se marca "Todos", deshabilitar los individuales
        const todosCheck = colegioContainer.querySelector('input[value="todos"]');
        const individualChecks = colegioContainer.querySelectorAll('input[name="colegio_check"]:not([value="todos"])');

        todosCheck?.addEventListener('change', () => {
            const isAll = todosCheck.checked;
            individualChecks.forEach(cb => {
                cb.disabled = isAll;
                cb.checked = false;
                cb.closest('.colegio-checkbox-item').classList.toggle('checked', false);
            });
            todosCheck.closest('.colegio-checkbox-item').classList.toggle('checked', isAll);
        });

        individualChecks.forEach(cb => {
            cb.addEventListener('change', () => {
                cb.closest('.colegio-checkbox-item').classList.toggle('checked', cb.checked);
                // Si se marca alguno individual, desmarcar "Todos"
                if (cb.checked && todosCheck.checked) {
                    todosCheck.checked = false;
                    todosCheck.closest('.colegio-checkbox-item').classList.remove('checked');
                    individualChecks.forEach(c2 => { c2.disabled = false; });
                }
            });
        });
    }

    document.getElementById('editUserPassword').value = ''; // Limpiar campo pass

    // Cargar roles si no están en state
    let roles = state.roles || [];
    if (!roles || roles.length === 0) {
        try {
            console.log("Cargando roles desde API...");
            roles = await api.auth.listRoles();
            setState('roles', roles);
        } catch (error) {
            console.error('Error cargando roles:', error);
            roles = [
                { id: 1, nombre: 'admin' },
                { id: 2, nombre: 'director' },
                { id: 3, nombre: 'usuario' },
                { id: 4, nombre: 'utp' },
                { id: 5, nombre: 'liderazgo' },
                { id: 6, nombre: 'orien_conv' },
                { id: 7, nombre: 'pie' },
                { id: 8, nombre: 'inspectoria' }
            ]; // Fallback
        }
    }

    const selRol = document.getElementById('editUserRol');
    if (selRol) {
        console.log("Poblando select de roles con:", roles);
        selRol.innerHTML = roles.map(r => 
            `<option value="${r.id}" ${isEdit && parseInt(r.id) === parseInt(user.rol_id) ? 'selected' : ''}>${r.nombre}</option>`
        ).join('');
    }

    document.getElementById('modalUsuario').classList.add('active');
}

export function closeUserModal() {
    document.getElementById('modalUsuario').classList.remove('active');
}

export async function deleteUsuario(id) {
    if (!confirm('¿Seguro que desea eliminar este usuario?')) return;
    try {
        await api.auth.deleteUser(id);
        loadUsuarios();
    } catch (error) {
        showAlert('Error', error.message, 'error');
    }
}

// --- Carga masiva de usuarios ---
export async function exportarUsuariosExcel() {
    try {
        mostrarLoading(true, 'Generando archivo Excel...');
        const response = await api.auth.exportUsers();
        if (!response.ok) throw new Error('Error al exportar usuarios');
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `usuarios_${new Date().toISOString().split('T')[0]}.xlsx`;
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

export async function descargarUsuariosPlantilla() {
    try {
        mostrarLoading(true, 'Descargando plantilla...');
        const response = await api.auth.downloadUsersTemplate();
        if (!response.ok) throw new Error('Error al descargar la plantilla');
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `plantilla_usuarios.xlsx`;
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

export async function importarUsuariosExcel(input) {
    if (!input.files || input.files.length === 0) return;
    const file = input.files[0];

    if (!confirm(`¿Desea importar los usuarios desde el archivo "${file.name}"?`)) {
        input.value = '';
        return;
    }

    try {
        mostrarLoading(true, 'Importando usuarios...');
        const res = await api.auth.importUsers(file);
        mostrarLoading(false);

        let msg = res.message || 'Importación finalizada';
        if (res.errors && res.errors.length > 0) {
            msg += '\n\nDetalles:\n' + res.errors.join('\n');
        }
        showAlert('Resultado de importación', msg, res.errors?.length ? 'warning' : 'success');
        loadUsuarios();
    } catch (error) {
        mostrarLoading(false);
        showAlert('Error', error.message, 'error');
    } finally {
        input.value = '';
    }
}

// Inicializar form de usuario
document.getElementById('formUsuario')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const id = document.getElementById('editUserId').value;
    const username = document.getElementById('editUserUsername').value;
    const nombre_completo = document.getElementById('editUserNombreCompleto').value;
    const email = document.getElementById('editUserEmail').value;
    const rol_id = parseInt(document.getElementById('editUserRol').value);
    const acceso = document.getElementById('editUserAcceso').value;
    const activo = parseInt(document.getElementById('editUserActivo').value);
    
    // Obtener valores de checkboxes de colegios
    const colegioContainer = document.getElementById('editUserColegioContainer');
    let colegio_id = '';
    if (colegioContainer) {
        const todosCheck = colegioContainer.querySelector('input[value="todos"]');
        if (todosCheck && todosCheck.checked) {
            // Para el admin (rol_id 1) un colegio_id vacío significa "acceso total".
            // Para los demás roles (director, utp, pie, etc.) un colegio_id vacío
            // significa "ningún colegio" y deja al usuario sin plantillas visibles,
            // así que "Todos los Colegios" se expande a la lista real de colegios.
            if (rol_id === 1) {
                colegio_id = '';
            } else {
                colegio_id = (state.colegios || []).map(c => c.id).join(',');
            }
        } else {
            const checkedBoxes = colegioContainer.querySelectorAll('input[name="colegio_check"]:checked');
            colegio_id = Array.from(checkedBoxes).map(cb => cb.value).join(',');
        }
    }
    
    const password = document.getElementById('editUserPassword').value;

    const data = { username, nombre_completo, email, rol_id, acceso, activo, colegio_id };
    if (password) data.password = password;

    try {
        if (id) {
            await api.auth.updateUser(id, data);
            showAlert('Éxito', 'Usuario actualizado correctamente', 'success');
        } else {
            await api.auth.register(data);
            showAlert('Éxito', 'Usuario creado correctamente', 'success');
        }
        closeUserModal();
        loadUsuarios();
    } catch (error) {
        showAlert('Error', error.message, 'error');
    }
});
