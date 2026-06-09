/**
 * Control de acceso por rol (visibilidad del sidebar + guardas de navegación).
 *
 * Los nombres de rol coinciden con auth_roles:
 *   admin, director, liderazgo, orien_conv, utp, pie, inspectoria, usuario
 *
 * Nota de seguridad: esto controla la UI. Los endpoints sensibles
 * (colegios, usuarios, destinatarios de correo, respaldos, sistema)
 * ya están protegidos en el backend con require_admin.
 */

// Páginas que pertenecen a cada plataforma (para mostrar/ocultar los menús)
export const LIDERAZGO_PAGES = ['inicio', 'evaluaciones', 'nueva-evaluacion'];
export const VISITA_PAGES = ['visitas-dashboard', 'visitas-nueva', 'visitas-historial'];

// Configuración de acceso por rol (clave en minúsculas)
const ROLE_CONFIG = {
    admin: {
        platforms: ['liderazgo', 'visita'],
        pages: 'ALL'
    },
    director: {
        platforms: ['visita'],
        pages: [
            'visitas-dashboard', 'visitas-nueva', 'visitas-historial',
            'docentes', 'asignaturas', 'plantilla', 'reportes', 'metas'
        ]
    },
    liderazgo: {
        platforms: ['liderazgo'],
        pages: [
            'inicio', 'evaluaciones', 'nueva-evaluacion',
            'colegios', 'docentes', 'asignaturas', 'reportes'
        ]
    },
    orien_conv: {
        platforms: ['liderazgo', 'visita'],
        pages: [
            'inicio', 'evaluaciones', 'nueva-evaluacion',
            'visitas-dashboard', 'visitas-nueva', 'visitas-historial',
            'docentes', 'cursos', 'asignaturas'
        ]
    },
    usuario: {
        platforms: ['liderazgo'],
        pages: ['inicio', 'evaluaciones', 'nueva-evaluacion']
    }
};
// utp, pie e inspectoria tienen el mismo acceso a módulos que orien_conv
ROLE_CONFIG.utp = ROLE_CONFIG.orien_conv;
ROLE_CONFIG.pie = ROLE_CONFIG.orien_conv;
ROLE_CONFIG.inspectoria = ROLE_CONFIG.orien_conv;

// Páginas restringidas a ciertas plataformas (independiente del rol).
// 'plantilla' solo está disponible en la plataforma de visitas.
const PAGE_PLATFORMS = {
    plantilla: ['visita']
};

/** Devuelve la config del rol (o la de 'usuario' por defecto). */
export function getRoleConfig(roleName) {
    const key = (roleName || '').toLowerCase();
    return ROLE_CONFIG[key] || ROLE_CONFIG.usuario;
}

/** ¿El rol puede acceder a la página indicada? */
export function canAccessPage(cfg, page) {
    if (!cfg) return false;
    if (cfg.pages === 'ALL') return true;
    return cfg.pages.includes(page);
}

/** ¿La página está disponible en el contexto/plataforma actual? */
export function pageAllowedInContext(page, context) {
    const allowed = PAGE_PLATFORMS[page];
    if (!allowed) return true;
    return allowed.includes(context);
}

/** Visibilidad efectiva: combina permiso de rol y restricción de plataforma. */
export function isPageVisible(cfg, page, context) {
    return canAccessPage(cfg, page) && pageAllowedInContext(page, context);
}

/** Página por defecto del rol según el contexto/plataforma actual. */
export function defaultPageFor(cfg, context) {
    if (cfg.pages === 'ALL') {
        return context === 'visita' ? 'visitas-dashboard' : 'inicio';
    }
    const platformPages = context === 'visita' ? VISITA_PAGES : LIDERAZGO_PAGES;
    const first = cfg.pages.find(p => platformPages.includes(p));
    return first || cfg.pages[0] || 'inicio';
}

/**
 * Resuelve el contexto (plataforma) válido para el rol.
 * Si el contexto guardado no aplica al rol, usa la primera plataforma permitida.
 */
export function resolveContext(cfg, currentContext) {
    if (currentContext && cfg.platforms.includes(currentContext)) {
        return currentContext;
    }
    return cfg.platforms[0] || 'liderazgo';
}

/** Aplica la visibilidad de ítems y grupos del sidebar para el rol/contexto. */
export function applyNavPermissions(cfg, context) {
    // 1. Ítems individuales
    document.querySelectorAll('.nav-item[data-page]').forEach(item => {
        const page = item.getAttribute('data-page');
        item.style.display = isPageVisible(cfg, page, context) ? '' : 'none';
    });

    // 2. Menús de plataforma (dependen del contexto activo)
    const liderazgoMenu = document.getElementById('liderazgoMenu');
    const visitasMenu = document.getElementById('visitasMenu');
    const hasLiderazgo = LIDERAZGO_PAGES.some(p => canAccessPage(cfg, p));
    const hasVisita = VISITA_PAGES.some(p => canAccessPage(cfg, p));

    if (liderazgoMenu) {
        liderazgoMenu.style.display = (context === 'liderazgo' && hasLiderazgo) ? 'block' : 'none';
    }
    if (visitasMenu) {
        visitasMenu.style.display = (context === 'visita' && hasVisita) ? 'block' : 'none';
    }

    // 3. Menú de administración: visible si algún ítem suyo está permitido
    const adminMenu = document.getElementById('adminMenu');
    if (adminMenu) {
        const anyVisible = Array.from(adminMenu.querySelectorAll('.nav-item[data-page]'))
            .some(i => isPageVisible(cfg, i.getAttribute('data-page'), context));
        adminMenu.style.display = anyVisible ? 'block' : 'none';
    }

    // 4. Menú de configuración (correos / respaldos): solo si está permitido
    const backupMenu = document.getElementById('backupMenu');
    if (backupMenu) {
        const anyVisible = Array.from(backupMenu.querySelectorAll('.nav-item[data-page]'))
            .some(i => isPageVisible(cfg, i.getAttribute('data-page'), context));
        backupMenu.style.display = anyVisible ? 'block' : 'none';
    }
}
