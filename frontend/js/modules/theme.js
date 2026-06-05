/**
 * Theming por dominio de correo.
 * - @colegiomacaya.cl        -> verde oscuro con acentos cálidos
 * - @colegiodiegoportales.cl -> azul oscuro con acentos cálidos
 * - cualquier otro            -> tema por defecto (definido en variables.css)
 */

const THEMES = {
    // Verde oscuro + cálidos
    macaya: {
        '--primary':       '#14532d',
        '--primary-light': '#1d7a44',
        '--primary-dark':  '#0a3b1f',
        '--success':       '#16a34a',
        '--warning':       '#ea8c0c',
        '--danger':        '#dc2626',
        '--accent':        '#e0913a', // ámbar/terracota cálido
        '--accent-soft':   '#fdf3e3',
        '--bg':            '#f7f4ee', // crema cálido
        '--shadow':        '0 4px 6px -1px rgba(20, 83, 45, 0.12), 0 2px 4px -1px rgba(20, 83, 45, 0.08)'
    },
    // Azul oscuro + cálidos
    portales: {
        '--primary':       '#12294d',
        '--primary-light': '#244e87',
        '--primary-dark':  '#0a1c38',
        '--success':       '#10b981',
        '--warning':       '#ea8c0c',
        '--danger':        '#dc2626',
        '--accent':        '#e6a23c', // dorado cálido
        '--accent-soft':   '#fcf4e6',
        '--bg':            '#f6f3ee', // arena cálida
        '--shadow':        '0 4px 6px -1px rgba(18, 41, 77, 0.12), 0 2px 4px -1px rgba(18, 41, 77, 0.08)'
    }
};

// Lista de propiedades que cualquier tema puede tocar (para poder limpiarlas al volver al default)
const MANAGED_PROPS = [
    '--primary', '--primary-light', '--primary-dark',
    '--success', '--warning', '--danger',
    '--accent', '--accent-soft', '--bg', '--shadow'
];

/** Devuelve la clave de tema según el email, o null si no aplica. */
function themeKeyForEmail(email) {
    const e = (email || '').toLowerCase();
    if (e.includes('@colegiomacaya.cl')) return 'macaya';
    if (e.includes('@colegiodiegoportales.cl')) return 'portales';
    return null;
}

/** Aplica una clave de tema (o la limpia si es null/desconocida). */
function applyThemeKey(key) {
    const root = document.documentElement;
    const palette = THEMES[key];

    if (!palette) {
        // Volver al tema por defecto de variables.css
        MANAGED_PROPS.forEach(prop => root.style.removeProperty(prop));
        root.removeAttribute('data-theme');
        return;
    }

    Object.entries(palette).forEach(([prop, value]) => {
        root.style.setProperty(prop, value);
    });
    root.setAttribute('data-theme', key);
}

/**
 * Aplica el tema correspondiente al email del usuario y lo recuerda
 * en localStorage para evitar el "flash" en la siguiente carga.
 */
export function applyThemeForEmail(email) {
    const key = themeKeyForEmail(email);
    if (key) {
        localStorage.setItem('uiTheme', key);
    } else {
        localStorage.removeItem('uiTheme');
    }
    applyThemeKey(key);
}

/** Aplica de inmediato el último tema conocido (antes de pedir /auth/me). */
export function initTheme() {
    applyThemeKey(localStorage.getItem('uiTheme'));
}
