import { api } from './api.js';
import { state, setState } from './state.js';
import { getRoleName, capitalize } from './utils.js';
import { applyThemeForEmail } from './modules/theme.js';
import { getRoleConfig, resolveContext, applyNavPermissions, defaultPageFor, isPageVisible } from './modules/permissions.js';

export async function loadUserInfo() {
    try {
        const user = await api.auth.getMe();
        console.log('User info fetched:', user);
        setState('currentUser', user);

        // Aplicar tema de la plataforma según el dominio del correo del usuario
        applyThemeForEmail(user.email);

        const rolId = parseInt(user.rol_id);
        const displayName = user.nombre_completo || user.username;
        document.getElementById('userDisplay').textContent = displayName;
        const userAvatar = document.getElementById('userAvatar');
        if (userAvatar && displayName) {
            userAvatar.textContent = displayName.charAt(0).toUpperCase();
        }
        document.getElementById('roleDisplay').textContent = user.rol?.nombre
            ? capitalize(user.rol.nombre)
            : getRoleName(rolId);
        localStorage.setItem('userRole', rolId);
        localStorage.setItem('userAccess', user.acceso);

        // ===== Control de acceso por rol =====
        const roleName = (rolId === 1) ? 'admin' : (user.rol?.nombre || '');
        const cfg = getRoleConfig(roleName);

        // Resolver el contexto (plataforma) válido para el rol
        const context = resolveContext(cfg, state.currentContext);
        if (context !== state.currentContext) {
            setState('currentContext', context);
            localStorage.setItem('currentContext', context);
        }

        // Guardar permisos para la guarda de navegación
        setState('rolePermissions', cfg);
        setState('defaultPage', defaultPageFor(cfg, context));

        // Aplicar visibilidad del sidebar
        applyNavPermissions(cfg, context);

        // Botón de cambio de plataforma: solo si el rol tiene más de una
        const btnSwitch = document.getElementById('btnSwitchPlatform');
        if (btnSwitch) {
            btnSwitch.style.display = (cfg.platforms.length > 1) ? 'flex' : 'none';
        }
    } catch (error) {
        console.error('Error cargando usuario:', error);
        logout();
    }
}

export function logout() {
    api.auth.logout();
    window.location.href = 'login.html';
}

export function setupNavigation() {
    document.querySelectorAll('.nav-item[data-page]').forEach(item => {
        item.addEventListener('click', (e) => {
            e.preventDefault();
            const page = item.dataset.page;
            navigateTo(page);

            // Cerrar sidebar en móvil/tablet tras navegar
            if (window.innerWidth <= 1024) {
                const sidebar = document.querySelector('.sidebar');
                const overlay = document.getElementById('sidebarOverlay');
                const mobileBtn = document.getElementById('mobileMenuBtn');
                
                sidebar?.classList.remove('active');
                overlay?.classList.remove('active');
                mobileBtn?.classList.remove('active');
            }
        });
    });

    const btnSwitch = document.getElementById('btnSwitchPlatform');
    if (btnSwitch) {
        btnSwitch.addEventListener('click', () => {
            if (window.app && window.app.togglePlatform) {
                window.app.togglePlatform();
            }
        });
    }

    setupSidebarToggle();
}

function setupSidebarToggle() {
    const sidebar = document.querySelector('.sidebar');
    const toggleBtn = document.getElementById('sidebarToggle');
    const mobileBtn = document.getElementById('mobileMenuBtn');
    const overlay = document.getElementById('sidebarOverlay');

    // Tooltip nativo: muestra el nombre al pasar el cursor cuando el sidebar está colapsado
    const syncNavTitles = () => {
        const collapsed = sidebar?.classList.contains('collapsed');
        document.querySelectorAll('.nav-item').forEach(item => {
            const text = item.querySelector('.nav-text')?.textContent?.trim();
            if (collapsed && text) {
                item.setAttribute('title', text);
            } else {
                item.removeAttribute('title');
            }
        });
    };

    // Desktop Toggle (Collapse)
    toggleBtn?.addEventListener('click', () => {
        sidebar?.classList.toggle('collapsed');
        // Opcional: Guardar estado en localStorage
        localStorage.setItem('sidebarCollapsed', sidebar?.classList.contains('collapsed'));
        syncNavTitles();
    });

    // Mobile Toggle (Slide-in)
    mobileBtn?.addEventListener('click', () => {
        sidebar?.classList.toggle('active');
        overlay?.classList.toggle('active');
        mobileBtn?.classList.toggle('active');
    });

    // Close on overlay click
    overlay?.addEventListener('click', () => {
        sidebar?.classList.remove('active');
        overlay?.classList.remove('active');
        mobileBtn?.classList.remove('active');
    });

    // Restaurar estado de colapso solo en escritorio (en móvil/tablet el sidebar es off-canvas)
    if (window.innerWidth > 1024 && localStorage.getItem('sidebarCollapsed') === 'true') {
        sidebar?.classList.add('collapsed');
    }

    syncNavTitles();
}

export async function navigateTo(page, skipEvent = false) {
    // Guarda de acceso: si el rol no puede ver esta página (o no aplica a la plataforma actual), redirigir
    const cfg = state.rolePermissions;
    if (cfg && !isPageVisible(cfg, page, state.currentContext)) {
        const fallback = state.defaultPage || 'inicio';
        if (fallback !== page) {
            console.warn(`Acceso denegado a "${page}" para el rol/plataforma actual. Redirigiendo a "${fallback}".`);
            return navigateTo(fallback, skipEvent);
        }
    }

    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));

    document.querySelectorAll(`.nav-item[data-page="${page}"]`).forEach(n => n.classList.add('active'));

    const pageId = `page${capitalize(page)}`;
    const pageEl = document.getElementById(pageId);
    if (pageEl) pageEl.classList.add('active');

    // Trigger module loaders (will be imported later)
    if (!skipEvent) {
        window.dispatchEvent(new CustomEvent('page-navigation', { detail: { page } }));
    }
}
