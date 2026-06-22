const API_URL = (window.location.port === '8080' || (window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1')) 
    ? '/api' 
    : `${window.location.protocol}//${window.location.hostname}:8002`;

document.addEventListener('DOMContentLoaded', () => {
    if (localStorage.getItem('token')) {
        window.location.href = 'dashboard.html';
        return;
    }

    const loginForm = document.getElementById('loginForm');
    const authMessage = document.getElementById('authMessage');
    const loginSection = document.getElementById('loginSection');
    const forgotPasswordSection = document.getElementById('forgotPasswordSection');
    const toggleForgotPassword = document.getElementById('toggleForgotPassword');
    const backToLogin = document.getElementById('backToLogin');
    const forgotPasswordForm = document.getElementById('forgotPasswordForm');

    // Cambiar a pantalla de recuperación
    if (toggleForgotPassword) {
        toggleForgotPassword.addEventListener('click', (e) => {
            e.preventDefault();
            loginSection.style.display = 'none';
            forgotPasswordSection.style.display = 'block';
            authMessage.textContent = '';
            authMessage.className = 'message';
        });
    }

    // Volver a login
    if (backToLogin) {
        backToLogin.addEventListener('click', (e) => {
            e.preventDefault();
            forgotPasswordSection.style.display = 'none';
            loginSection.style.display = 'block';
            authMessage.textContent = '';
            authMessage.className = 'message';
        });
    }

    // Submit de recuperación de contraseña
    if (forgotPasswordForm) {
        forgotPasswordForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const email = document.getElementById('recoveryEmail').value;
            const submitBtn = forgotPasswordForm.querySelector('button[type="submit"]');

            submitBtn.disabled = true;
            submitBtn.textContent = 'Enviando...';
            authMessage.textContent = '';
            authMessage.className = 'message';

            try {
                const response = await fetch(`${API_URL}/auth/forgot-password`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({ email })
                });

                const data = await response.json();
                if (!response.ok) {
                    throw new Error(data.detail || 'Error al procesar la solicitud');
                }

                authMessage.textContent = data.detail || 'Se ha enviado la contraseña a tu correo electrónico.';
                authMessage.className = 'message success';
                document.getElementById('recoveryEmail').value = '';

                setTimeout(() => {
                    if (forgotPasswordSection.style.display === 'block') {
                        backToLogin.click();
                    }
                }, 4000);
            } catch (error) {
                authMessage.textContent = error.message;
                authMessage.className = 'message error';
            } finally {
                submitBtn.disabled = false;
                submitBtn.textContent = 'Recuperar Contraseña';
            }
        });
    }


    loginForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const username = document.getElementById('username').value;
        const password = document.getElementById('password').value;

        try {
            const formData = new FormData();
            formData.append('username', username);
            formData.append('password', password);

            const response = await fetch(`${API_URL}/auth/login`, {
                method: 'POST',
                body: formData
            });

            if (!response.ok) {
                throw new Error('Usuario o contraseña incorrectos');
            }

            const data = await response.json();
            localStorage.setItem('token', data.access_token);
            localStorage.setItem('username', username);

            // Obtener perfil para determinar acceso
            const profileResponse = await fetch(`${API_URL}/auth/me`, {
                headers: { 'Authorization': `Bearer ${data.access_token}` }
            });
            
            if (profileResponse.ok) {
                const user = await profileResponse.json();
                localStorage.setItem('userAccess', user.acceso);
                
                if (user.acceso === 'todos') {
                    // El selector se mostrará en el dashboard
                    localStorage.removeItem('currentContext');
                } else {
                    localStorage.setItem('currentContext', user.acceso);
                }
            }

            window.location.href = 'dashboard.html';
        } catch (error) {
            authMessage.textContent = error.message;
            authMessage.className = 'message error';
        }
    });
});
