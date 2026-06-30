const API_URL = (window.location.port === '8080' || (window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1')) 
    ? '/api' 
    : `${window.location.protocol}//${window.location.hostname}:8002`;

export const api = {
    baseUrl: API_URL,
    getToken: () => localStorage.getItem('token'),
    getUsername: () => localStorage.getItem('username'),
    getUserRole: () => localStorage.getItem('userRole') || '3',

    headers: () => ({
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${api.getToken()}`
    }),

    checkAuth: () => {
        if (!api.getToken()) {
            window.location.href = 'login.html';
            return false;
        }
        return true;
    },

    requireRole: (roles) => {
        if (!roles.includes(api.getUserRole())) {
            alert('No tienes permisos para acceder a esta sección');
            window.location.href = 'dashboard.html';
            return false;
        }
        return true;
    },

    async request(method, endpoint, data = null) {
        const options = {
            method,
            headers: api.headers()
        };
        if (data) {
            options.body = JSON.stringify(data);
        }

        const response = await fetch(`${API_URL}${endpoint}`, options);
        
        if (response.status === 401) {
            localStorage.clear();
            window.location.href = 'login.html';
            throw new Error('Sesión expirada');
        }

        if (!response.ok) {
            const error = await response.json().catch(() => ({ detail: 'Error en el servidor' }));
            let message = error.detail || 'Error en la petición';
            if (Array.isArray(message)) {
                message = message.map(err => `${err.msg} (${err.loc.join(' > ')})`).join(', ');
            } else if (typeof message === 'object') {
                message = JSON.stringify(message);
            }
            throw new Error(message);
        }

        if (response.headers.get('content-type')?.includes('application/vnd.openxmlformats')) {
            return response.blob();
        }

        return response.json();
    },

    async get(endpoint) {
        return api.request('GET', endpoint);
    },

    async post(endpoint, data) {
        return api.request('POST', endpoint, data);
    },

    async put(endpoint, data) {
        return api.request('PUT', endpoint, data);
    },

    async delete(endpoint) {
        return api.request('DELETE', endpoint);
    },

    auth: {
        async login(username, password) {
            const formData = new FormData();
            formData.append('username', username);
            formData.append('password', password);

            const response = await fetch(`${API_URL}/auth/login`, {
                method: 'POST',
                body: formData
            });

            if (!response.ok) {
                const error = await response.json().catch(() => ({ detail: 'Error' }));
                throw new Error(error.detail || 'Error al iniciar sesión');
            }

            return response.json();
        },

        async register(usernameOrData, email, password) {
            if (typeof usernameOrData === 'object') {
                return api.post('/auth/register', usernameOrData);
            }
            return api.post('/auth/register', { username: usernameOrData, email, password });
        },

        async getMe() {
            return api.get('/auth/me');
        },

        async changePassword(newPassword) {
            return api.post('/auth/change-password', { new_password: newPassword });
        },

        async getUsers() {
            return api.get('/auth/users');
        },

        async updateUser(id, data) {
            return api.put(`/auth/users/${id}`, data);
        },
        async deleteUser(id) {
            return api.delete(`/auth/users/${id}`);
        },
        async listRoles() {
            return api.get('/auth/roles');
        },
        exportUsers() {
            return fetch(`${API_URL}/auth/users/export/excel`, {
                headers: { 'Authorization': `Bearer ${api.getToken()}` }
            });
        },
        downloadUsersTemplate() {
            return fetch(`${API_URL}/auth/users/export/template`, {
                headers: { 'Authorization': `Bearer ${api.getToken()}` }
            });
        },
        importUsers(file) {
            const formData = new FormData();
            formData.append('file', file);
            return fetch(`${API_URL}/auth/users/import/excel`, {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${api.getToken()}` },
                body: formData
            }).then(res => res.json());
        },
        logout() {
            localStorage.removeItem('token');
            localStorage.removeItem('username');
            localStorage.removeItem('userRole');
        }
    },

    colegios: {
        getAll() { return api.get('/colegios/'); },
        get(id) { return api.get(`/colegios/${id}`); },
        create(data) { return api.post('/colegios/', data); },
        update(id, data) { return api.put(`/colegios/${id}`, data); },
        delete(id) { return api.delete(`/colegios/${id}`); }
    },

    niveles: {
        getAll() { return api.get('/niveles/'); }
    },

    metas: {
        getAll(params = {}) {
            const q = new URLSearchParams(params).toString();
            return api.get(`/metas/${q ? '?' + q : ''}`);
        },
        getUsuarios() { return api.get('/metas/usuarios'); },
        create(data) { return api.post('/metas/', data); },
        update(id, data) { return api.put(`/metas/${id}`, data); },
        delete(id) { return api.delete(`/metas/${id}`); },
        exportExcel() {
            return fetch(`${API_URL}/metas/export/excel`, {
                headers: { 'Authorization': `Bearer ${api.getToken()}` }
            });
        },
        downloadTemplate() {
            return fetch(`${API_URL}/metas/export/template`, {
                headers: { 'Authorization': `Bearer ${api.getToken()}` }
            });
        },
        importExcel(file) {
            const formData = new FormData();
            formData.append('file', file);
            return fetch(`${API_URL}/metas/import/excel`, {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${api.getToken()}` },
                body: formData
            }).then(res => res.json());
        }
    },

    cursos: {
        getAll() { return api.get('/cursos/'); },
        create(data) { return api.post('/cursos/', data); },
        delete(id) { return api.delete(`/cursos/${id}`); }
    },

    asignaturas: {
        getAll() { return api.get('/asignaturas/'); },
        get(id) { return api.get(`/asignaturas/${id}`); },
        create(data) { return api.post('/asignaturas/', data); },
        update(id, data) { return api.put(`/asignaturas/${id}`, data); },
        delete(id) { return api.delete(`/asignaturas/${id}`); }
    },

    docentes: {
        getAll(colegioId = null) {
            const endpoint = colegioId ? `/docentes/?colegio_id=${colegioId}` : '/docentes/';
            return api.get(endpoint);
        },
        get(id) { return api.get(`/docentes/${id}`); },
        getTiposFuncionario() { return api.get('/docentes/tipos-funcionario'); },
        create(data) { return api.post('/docentes/', data); },
        update(id, data) { return api.put(`/docentes/${id}`, data); },
        delete(id) { return api.delete(`/docentes/${id}`); },
        exportExcel() {
            return fetch(`${API_URL}/docentes/export/excel`, {
                headers: { 'Authorization': `Bearer ${api.getToken()}` }
            });
        },
        downloadTemplate() {
            return fetch(`${API_URL}/docentes/export/template`, {
                headers: { 'Authorization': `Bearer ${api.getToken()}` }
            });
        },
        importExcel(file) {
            const formData = new FormData();
            formData.append('file', file);
            return fetch(`${API_URL}/docentes/import/excel`, {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${api.getToken()}` },
                body: formData
            }).then(res => res.json());
        }
    },


    dimensiones: {
        getAll() { return api.get('/dimensiones/'); },
        getSubdimensiones() { return api.get('/dimensiones/subdimensiones'); },
        create(data) { return api.post('/dimensiones/', data); },
        update(id, data) { return api.put(`/dimensiones/${id}`, data); },
        delete(id) { return api.delete(`/dimensiones/${id}`); },
        reorder(ids) { return api.put('/dimensiones/reorder', { ids }); },
        createIndicador(dimensionId, data) { return api.post(`/dimensiones/${dimensionId}/subdimensiones/`, data); },
        updateIndicador(id, data) { return api.put(`/dimensiones/subdimensiones/${id}`, data); },
        deleteIndicador(id) { return api.delete(`/dimensiones/subdimensiones/${id}`); },
        reorderIndicadores(ids) { return api.put('/dimensiones/subdimensiones/reorder', { ids }); },
        exportExcel() {
            return fetch(`${API_URL}/dimensiones/export/excel`, {
                headers: { 'Authorization': `Bearer ${api.getToken()}` }
            });
        }
    },

    evaluaciones: {
        getAll() { return api.get('/evaluaciones/'); },
        get(id) { return api.get(`/evaluaciones/${id}`); },
        getStats: (params = {}) => {
            const query = new URLSearchParams(params).toString();
            return api.request('GET', `/evaluaciones/stats?${query}`);
        },
        getTalentMap: (params = {}) => {
            const query = new URLSearchParams(params).toString();
            return api.request('GET', `/evaluaciones/talent-map?${query}`);
        },
        getVisitasPorRol: (params = {}) => {
            const query = new URLSearchParams(params).toString();
            return api.request('GET', `/evaluaciones/stats/visitas-por-rol?${query}`);
        },
        getDashboardStats(colegioId = null, plantillaId = null) { 
            let endpoint = '/evaluaciones/stats/dashboard';
            const params = new URLSearchParams();
            if (colegioId) params.append('colegio_id', colegioId);
            if (plantillaId) params.append('plantilla_id', plantillaId);
            if (params.toString()) endpoint += `?${params.toString()}`;
            return api.get(endpoint); 
        },
        getById: (id) => api.request('GET', `/evaluaciones/${id}`),
        create(data) { return api.post('/evaluaciones/', data); },
        update(id, data) { return api.put(`/evaluaciones/${id}`, data); },
        delete(id) { return api.delete(`/evaluaciones/${id}`); },
        exportExcel() {
            return fetch(`${API_URL}/evaluaciones/export/excel`, {
                headers: { 'Authorization': `Bearer ${api.getToken()}` }
            });
        },
        async uploadVisita(formData) {
            const response = await fetch(`${API_URL}/evaluaciones/upload-visita`, {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${api.getToken()}` },
                body: formData
            });
            if (!response.ok) {
                const error = await response.json().catch(() => ({ detail: 'Error al subir la visita' }));
                let message = error.detail || 'Error al subir la visita';
                if (Array.isArray(message)) {
                    message = message.map(err => `${err.msg} (${err.loc.join(' > ')})`).join(', ');
                }
                throw new Error(message);
            }
            return response.json();
        },
        pdfVisitaUrl(id) { return `${API_URL}/evaluaciones/${id}/pdf-visita`; },
        prepareSign(id) { return api.post(`/evaluaciones/${id}/prepare-sign`); },
        getSignToken(id) { return api.get(`/evaluaciones/${id}/sign-token`); },
        publicSign(data) { return api.post('/evaluaciones/public-sign', data); },
        requestRemoteSign(id) { return api.post(`/evaluaciones/${id}/request-remote-sign`); },
        publicSignRemote(data) { return api.post('/evaluaciones/public-sign-remote', data); },
        finalize(id) { return api.post(`/evaluaciones/${id}/finalize`); },
        sendEmail(id, target = 'all') {
            return api.post(`/evaluaciones/${id}/send-email?target=${target}`, {});
        }
    },
    totp: {
        setup(docenteId) { return api.get(`/totp/setup/${docenteId}`); },
        confirm(docenteId, data) { return api.post(`/totp/confirm/${docenteId}`, data); },
        getStatus(docenteId) { return api.get(`/totp/status/${docenteId}`); }
    },
    config: {
        getInfo: () => fetch(`${API_URL}/config/info`, { headers: api.headers() }).then(r => r.json()),
        backup: {
            sql() {
                return fetch(`${API_URL}/config/backup/sql`, {
                    headers: { 'Authorization': `Bearer ${api.getToken()}` }
                });
            },
            email() {
                return api.post('/config/backup/email');
            }
        },
        getEmailRecipients() { return api.get('/config/email-recipients'); },
        createEmailRecipient(data) { return api.post('/config/email-recipients', data); },
        updateEmailRecipient(id, data) { return api.put(`/config/email-recipients/${id}`, data); },
        deleteEmailRecipient(id) { return api.delete(`/config/email-recipients/${id}`); },
        getWeeklyStats() { return api.get('/config/weekly-stats'); },
        testReportEmail(email) { return api.post('/config/test-report-email', { email }); },
        executeScheduledReport() { return api.post('/config/execute-report'); },
        executeScheduledBackup() { return api.post('/config/execute-backup'); },
        getReportHistory() { return api.get('/config/report-history'); }
    },
    plantillas: {
        getAll() { return api.get('/eval_plantillas/'); },
        get(id) { return api.get(`/eval_plantillas/${id}`); },
        getDimensiones(id) { return api.get(`/eval_plantillas/${id}/dimensiones`); },
        create(data) { return api.post('/eval_plantillas/', data); },
        update(id, data) { return api.put(`/eval_plantillas/${id}`, data); },
        delete(id) { return api.delete(`/eval_plantillas/${id}`); },
        duplicate(id, data = {}) { return api.post(`/eval_plantillas/${id}/duplicar`, data); },
        exportEstructura(id) {
            return fetch(`${API_URL}/eval_plantillas/${id}/export/excel`, {
                headers: { 'Authorization': `Bearer ${api.getToken()}` }
            });
        },
        importExcel(formData) {
            return fetch(`${API_URL}/eval_plantillas/import/excel`, {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${api.getToken()}` },
                body: formData
            });
        }
    }
};


