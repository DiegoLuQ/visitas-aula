import { api } from '../api.js';
import { state, setState } from '../state.js';
import { mostrarLoading, showAlert } from '../utils.js';
import { showModal, closeModal } from './ui.js';

export async function loadDocentes() {
    const tbody = document.getElementById('docentesBody');
    if (!tbody) return;
    tbody.innerHTML = '<tr><td colspan="6">Cargando...</td></tr>';

    const filterColegio = document.getElementById('filterColegioDocentes')?.value;
    const filterNombre = document.getElementById('filterNombreDocentes')?.value?.toLowerCase();

    try {
        let data = await api.docentes.getAll();
        
        // Aplicar filtros locales
        if (filterColegio) {
            data = data.filter(d => d.colegio_id === parseInt(filterColegio));
        }
        if (filterNombre) {
            data = data.filter(d => 
                (d.nombre || '').toLowerCase().includes(filterNombre) || 
                (d.rut || '').toLowerCase().includes(filterNombre)
            );
        }

        if (data.length === 0) {
            tbody.innerHTML = '<tr><td colspan="6" class="text-center">No hay docentes registrados</td></tr>';
            return;
        }

        tbody.innerHTML = data.map(d => `
            <tr>
                <td style="display:none;">${d.id}</td>
                <td>${d.nombre}</td>
                <td>${d.rut}</td>
                <td>${d.email || '-'}</td>
                <td>${d.colegio?.nombre || '-'}</td>
                <td>
                    <div class="actions">
                        ${!d.has_totp ? `
                            <button class="btn btn-primary btn-sm" onclick="window.app.setupTOTP(${d.id})" title="Configurar Firma Digital">
                                <i class="fas fa-key"></i>
                            </button>
                        ` : '<span style="color: #10b981; font-size: 1.2rem; width: 32px; height: 32px; display: inline-flex; align-items: center; justify-content: center;" title="Firma Activa"><i class="fas fa-check-circle"></i></span>'}
                        <button class="btn btn-warning btn-sm" onclick="window.app.editDocente(${d.id})" title="Editar">
                            <i class="fas fa-edit"></i>
                        </button>
                        <button class="btn btn-danger btn-sm" onclick="window.app.deleteDocente(${d.id})" title="Eliminar">
                            <i class="fas fa-trash"></i>
                        </button>
                    </div>
                </td>
            </tr>
        `).join('');
        
        setState('docentes', data);
    } catch (error) {
        tbody.innerHTML = `<tr><td colspan="6" class="text-center">Error: ${error.message}</td></tr>`;
    }
}

export async function loadColegiosForFilter() {
    const select = document.getElementById('filterColegioDocentes');
    if (!select) return;

    select.innerHTML = '<option value="">Todos los colegios</option>';

    try {
        const colegios = await api.colegios.getAll();
        setState('colegios', colegios);
        colegios.forEach(c => {
            select.innerHTML += `<option value="${c.id}">${c.nombre}</option>`;
        });
    } catch (error) {
        console.error('Error cargando filtros de colegio:', error);
    }
}

export async function saveDocente(id) {
    const nombre = document.getElementById('modalNombre').value;
    const rut = document.getElementById('modalRut').value;
    const email = document.getElementById('modalEmail').value;
    const colegio_id = parseInt(document.getElementById('modalColegio').value);

    // Validación de campos obligatorios
    if (!nombre || !rut || !email || !colegio_id) { 
        showAlert('Campos requeridos', 'Por favor complete todos los campos obligatorios (*)', 'warning'); 
        return; 
    }

    // Validación de formato RUT: 12345678-9
    const rutRegex = /^[0-9]+-[0-9kK]{1}$/;
    if (!rutRegex.test(rut)) {
        showAlert('Formato RUT inválido', 'El RUT debe tener el formato 12345678-9 (sin puntos y con guión)', 'warning');
        return;
    }

    try {
        if (id && id !== 'null') {
            await api.docentes.update(id, { nombre, rut, email, colegio_id });
        } else {
            await api.docentes.create({ nombre, rut, email, colegio_id });
        }
        closeModal();
        loadDocentes();
    } catch (error) {
        showAlert('Error', 'No se pudo guardar el docente: ' + error.message, 'error');
    }
}

export function editDocente(id) {
    const d = state.docentes.find(doc => doc.id === id);
    if (d) showModal('docente', d);
}

export async function deleteDocente(id) {
    if (!confirm('¿Está seguro de eliminar este docente?')) return;
    try {
        await api.docentes.delete(id);
        loadDocentes();
    } catch (error) {
        console.error('Error al eliminar docente:', error);
        showAlert('No se puede eliminar', error.message, 'warning');
    }
}

export async function exportarDocentesExcel() {
    try {
        mostrarLoading(true, 'Generando archivo Excel...');
        const response = await api.docentes.exportExcel();
        if (!response.ok) throw new Error('Error al exportar docentes');
        
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `docentes_${new Date().toISOString().split('T')[0]}.xlsx`;
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

export async function descargarDocentesPlantilla() {
    try {
        mostrarLoading(true, 'Descargando plantilla...');
        const response = await api.docentes.downloadTemplate();
        if (!response.ok) throw new Error('Error al descargar plantilla');
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `plantilla_docentes.xlsx`;
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

export async function importarDocentesExcel(input) {
    if (!input.files || input.files.length === 0) return;
    const file = input.files[0];
    
    if (!confirm(`¿Desea importar los docentes desde el archivo "${file.name}"?`)) {
        input.value = '';
        return;
    }

    try {
        mostrarLoading(true, 'Importando docentes...');
        const res = await api.docentes.importExcel(file);
        mostrarLoading(false);
        
        let msg = res.message;
        if (res.errors && res.errors.length > 0) {
            msg += '\n\nErrores encontrados:\n' + res.errors.join('\n');
        }
        showAlert('Resultado de importación', msg, res.errors?.length ? 'warning' : 'success');
        
        loadDocentes(); 
    } catch (error) {
        mostrarLoading(false);
        showAlert('Error', error.message, 'error');
    } finally {
        input.value = '';
    }
}

// FIRMA DIGITAL (TOTP)
export async function setupTOTP(docenteId) {
    if (!docenteId) {
        showAlert('Error', 'ID de docente no válido.', 'warning');
        return;
    }

    try {
        mostrarLoading(true, 'Generando clave de firma...');
        
        // 1. Obtener datos del docente (si no están en el estado, los buscamos de la API)
        let d = state.docentes.find(doc => doc.id === parseInt(docenteId));
        if (!d) {
            console.log('Docente no encontrado en estado, cargando de la API...');
            d = await api.docentes.get(docenteId);
        }

        if (!d) {
            throw new Error('No se pudo encontrar la información del docente.');
        }

        console.log('Setting up TOTP for docente:', d.nombre);
        
        // 2. Generar el secreto en el backend
        const res = await api.totp.setup(docenteId);
        mostrarLoading(false);

        // 3. Llenar el modal con la información
        document.getElementById('totpDocenteNombre').textContent = d.nombre;
        document.getElementById('totpDocenteRut').textContent = `RUT: ${d.rut}`;
        document.getElementById('qrcodeContainer').innerHTML = '';
        document.getElementById('totpVerifyCode').value = '';

        // Generar QR
        console.log('Generating QR Code...');
        new QRCode(document.getElementById('qrcodeContainer'), {
            text: res.provisioning_uri,
            width: 200,
            height: 200
        });

        console.log('Opening modal...');
        document.getElementById('modalTotpOverlay').classList.add('active');

        // Configurar botón de confirmación
        const btn = document.getElementById('btnConfirmTotp');
        btn.onclick = () => confirmTOTP(docenteId, res.secret);

    } catch (error) {
        console.error('Error in setupTOTP:', error);
        mostrarLoading(false);
        showAlert('Error', error.message, 'error');
    }
}

export async function confirmTOTP(docenteId, secret) {
    const code = document.getElementById('totpVerifyCode').value;
    if (!code || code.length !== 6) {
        showAlert('Código inválido', 'Ingrese el código de 6 dígitos de su app', 'warning');
        return;
    }

    try {
        mostrarLoading(true, 'Vinculando autenticador...');
        await api.totp.confirm(docenteId, { secret, code });
        mostrarLoading(false);
        
        closeModalTotp();
        showAlert('¡Éxito!', 'La firma digital ha sido vinculada correctamente.', 'success');

        // Intentar actualizar botones si estamos en el formulario de evaluación
        const btnAsignar = document.getElementById('btnAsignarFirma');
        const btnFirmar = document.getElementById('btnFirmarBorrador');
        if (btnAsignar && btnFirmar) {
            btnAsignar.style.display = 'none';
            btnFirmar.style.display = 'inline-block';
            
            const evalId = state.currentEvalId;
            console.log('DEBUG: Updating btnFirmar with evalId:', evalId);
            if (evalId) {
                btnFirmar.dataset.evalId = evalId;
            }
        }
    } catch (error) {
        mostrarLoading(false);
        showAlert('Error de vinculación', error.message, 'error');
    }
}

export function closeModalTotp() {
    document.getElementById('modalTotpOverlay').classList.remove('active');
}
