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
