import { api } from '../api.js';
import { mostrarLoading, showAlert } from '../utils.js';

export async function submitChangePassword(event) {
    if (event) event.preventDefault();
    
    const newPassword = document.getElementById('newPasswordInput').value;
    const confirmPassword = document.getElementById('confirmPasswordInput').value;
    
    if (!newPassword || !confirmPassword) {
        showAlert('Error', 'Por favor complete todos los campos.', 'error');
        return;
    }
    
    if (newPassword.length < 4) {
        showAlert('Error', 'La contraseña debe tener al menos 4 caracteres.', 'error');
        return;
    }
    
    if (newPassword !== confirmPassword) {
        showAlert('Error', 'Las contraseñas no coinciden. Por favor verifique.', 'error');
        return;
    }
    
    try {
        mostrarLoading(true, 'Actualizando contraseña y enviando correo...');
        const res = await api.auth.changePassword(newPassword);
        mostrarLoading(false);
        
        document.getElementById('formCambiarContrasena').reset();
        
        let msg = 'Tu contraseña ha sido actualizada con éxito.';
        if (res.email_sent) {
            msg += ' Además, te hemos enviado un correo de confirmación con tu nueva contraseña.';
        } else {
            msg += ' Sin embargo, hubo un problema al enviar el correo. Por favor verifique su configuración SMTP o intente de nuevo.';
        }
        
        showAlert('Éxito', msg, 'success');
    } catch (error) {
        mostrarLoading(false);
        showAlert('Error', error.message || 'No se pudo actualizar la contraseña.', 'error');
    }
}
