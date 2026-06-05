import { state } from '../state.js';
import { showModal, closeModal } from './ui.js';
import { navigateTo } from '../navigation.js';

export function showPlatformSelector() {
    const modalBody = document.getElementById('modalBody');
    const modalTitle = document.getElementById('modalTitle');
    
    modalTitle.textContent = 'Seleccionar Plataforma';
    
    modalBody.innerHTML = `
        <div class="platform-selector-container" style="display: grid; grid-template-columns: 1fr 1fr; gap: 20px; padding: 20px;">
            <div class="platform-card" onclick="window.app.selectPlatform('liderazgo')" style="cursor: pointer; padding: 30px; border: 2px solid #e2e8f0; border-radius: 15px; text-align: center; transition: all 0.3s ease;">
                <div style="font-size: 3rem; margin-bottom: 15px;">📊</div>
                <h3 style="margin-bottom: 10px; color: #002b5e;">Liderazgo</h3>
                <p style="font-size: 0.9rem; color: #64748b;">Acompañamiento y seguimiento pedagógico estándar.</p>
            </div>
            <div class="platform-card" onclick="window.app.selectPlatform('visita')" style="cursor: pointer; padding: 30px; border: 2px solid #e2e8f0; border-radius: 15px; text-align: center; transition: all 0.3s ease;">
                <div style="font-size: 3rem; margin-bottom: 15px;">🏫</div>
                <h3 style="margin-bottom: 10px; color: #002b5e;">Visitas a Aula</h3>
                <p style="font-size: 0.9rem; color: #64748b;">Módulo directivo para observación y retroalimentación en aula.</p>
            </div>
        </div>
        <style>
            .platform-card:hover {
                border-color: #002b5e;
                background-color: #f8fafc;
                transform: translateY(-5px);
                box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.1);
            }
        </style>
    `;
    
    document.getElementById('modalOverlay').classList.add('active');
}

export function selectPlatform(context) {
    localStorage.setItem('currentContext', context);
    state.currentContext = context;
    
    // Forzar ir al dashboard de la plataforma seleccionada
    const targetPage = (context === 'visita') ? 'visitas-dashboard' : 'inicio';
    localStorage.setItem('lastPage', targetPage);
    
    closeModal();
    window.location.reload();
}

export function togglePlatform() {
    const current = state.currentContext || 'liderazgo';
    const next = (current === 'visita') ? 'liderazgo' : 'visita';
    selectPlatform(next);
}

export function updateContextUI() {
    const context = state.currentContext || 'liderazgo';
    const headerTitle = document.querySelector('.sidebar-header h2');
    const headerSub = document.querySelector('.sidebar-header p');
    
    if (context === 'visita') {
        if (headerTitle) headerTitle.textContent = 'Visitas';
        if (headerSub) headerSub.textContent = 'Módulo Directivo';
        document.body.classList.add('visitas-theme');
    } else {
        if (headerTitle) headerTitle.textContent = 'Liderazgo';
        if (headerSub) headerSub.textContent = 'Acompañamiento';
        document.body.classList.remove('visitas-theme');
    }
}
