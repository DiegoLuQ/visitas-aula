import { api } from '../api.js';
import { mostrarLoading, showAlert } from '../utils.js';

/**
 * Visor de PDF en el frontend (render con PDF.js de Mozilla).
 *
 * - El backend solo entrega el archivo (protegido por token); el render se hace
 *   en el navegador, dibujando cada página en un <canvas>.
 * - Versión de PDF.js fija (pinned) para garantizar compatibilidad.
 */
const PDFJS_VERSION = '3.11.174';
const PDFJS_LIB = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${PDFJS_VERSION}/pdf.min.js`;
const PDFJS_WORKER = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${PDFJS_VERSION}/pdf.worker.min.js`;

let _pdfjsPromise = null;

/** Carga PDF.js una sola vez (desde CDN). */
function cargarPdfJs() {
    if (window.pdfjsLib) return Promise.resolve(window.pdfjsLib);
    if (_pdfjsPromise) return _pdfjsPromise;
    _pdfjsPromise = new Promise((resolve, reject) => {
        const s = document.createElement('script');
        s.src = PDFJS_LIB;
        s.onload = () => {
            if (window.pdfjsLib) {
                window.pdfjsLib.GlobalWorkerOptions.workerSrc = PDFJS_WORKER;
                resolve(window.pdfjsLib);
            } else {
                reject(new Error('PDF.js no se inicializó correctamente'));
            }
        };
        s.onerror = () => reject(new Error('No se pudo cargar el visor de PDF (sin conexión a CDN)'));
        document.head.appendChild(s);
    });
    return _pdfjsPromise;
}

/** Descarga el PDF protegido como ArrayBuffer (con el token de sesión). */
async function fetchPdfBuffer(evaluacionId) {
    const resp = await fetch(api.evaluaciones.pdfVisitaUrl(evaluacionId), {
        headers: { 'Authorization': `Bearer ${api.getToken()}` }
    });
    if (!resp.ok) {
        const err = await resp.json().catch(() => ({ detail: 'No se pudo obtener el PDF' }));
        throw new Error(err.detail || 'No se pudo obtener el PDF');
    }
    return resp.arrayBuffer();
}

/** Dispara la descarga de un Blob en el navegador. */
function descargarBlob(blob, nombre) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = nombre || 'visita.pdf';
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/**
 * Descarga directa del PDF (sin abrir el visor).
 */
export async function descargarPdfVisita(evaluacionId, nombre = '') {
    try {
        mostrarLoading(true, 'Descargando PDF...');
        const buffer = await fetchPdfBuffer(evaluacionId);
        mostrarLoading(false);
        descargarBlob(new Blob([buffer], { type: 'application/pdf' }), nombre || `visita_${evaluacionId}.pdf`);
    } catch (error) {
        mostrarLoading(false);
        showAlert('Error', error.message, 'error');
    }
}

/**
 * Abre el visor: descarga el PDF, lo renderiza con PDF.js y ofrece el botón
 * de descarga. Si PDF.js no se puede cargar, ofrece descargar el archivo.
 */
export async function openPdfViewer(evaluacionId, titulo = 'Documento de visita', nombreArchivo = '') {
    let buffer;
    try {
        mostrarLoading(true, 'Cargando documento...');
        buffer = await fetchPdfBuffer(evaluacionId);
    } catch (error) {
        mostrarLoading(false);
        showAlert('Error', error.message, 'error');
        return;
    }

    // El buffer se "consume" al renderizar con PDF.js, por eso guardamos una copia
    // independiente para el botón de descarga.
    const blobDescarga = new Blob([buffer.slice(0)], { type: 'application/pdf' });
    const nombre = nombreArchivo || `visita_${evaluacionId}.pdf`;

    let pdfjsLib;
    try {
        pdfjsLib = await cargarPdfJs();
    } catch (error) {
        mostrarLoading(false);
        // Fallback: no se pudo cargar el visor → ofrecer descarga directa.
        showAlert('Visor no disponible', `${error.message}. Se descargará el archivo en su lugar.`, 'warning',
            () => descargarBlob(blobDescarga, nombre));
        return;
    }

    const overlay = construirOverlay(titulo, blobDescarga, nombre);
    document.body.appendChild(overlay);
    const pagesContainer = overlay.querySelector('.pdfv-pages');

    try {
        const pdf = await pdfjsLib.getDocument({ data: buffer }).promise;
        mostrarLoading(false);

        const anchoBase = pagesContainer.clientWidth || 800;
        for (let i = 1; i <= pdf.numPages; i++) {
            const page = await pdf.getPage(i);
            const viewportBase = page.getViewport({ scale: 1 });
            const scale = Math.min((anchoBase - 24) / viewportBase.width, 2.0);
            const viewport = page.getViewport({ scale });

            const canvas = document.createElement('canvas');
            canvas.className = 'pdfv-canvas';
            canvas.width = viewport.width;
            canvas.height = viewport.height;
            pagesContainer.appendChild(canvas);

            await page.render({ canvasContext: canvas.getContext('2d'), viewport }).promise;
        }
    } catch (error) {
        mostrarLoading(false);
        pagesContainer.innerHTML = `<div style="color:#dc2626; text-align:center; padding:40px;">
            No se pudo renderizar el PDF: ${error.message}</div>`;
    }
}

/** Construye el overlay del visor con header (título, descargar, cerrar). */
function construirOverlay(titulo, blobDescarga, nombre) {
    const overlay = document.createElement('div');
    overlay.className = 'pdfv-overlay';
    overlay.innerHTML = `
        <div class="pdfv-modal">
            <div class="pdfv-header">
                <div class="pdfv-title"><i class="fas fa-file-pdf"></i> ${titulo}</div>
                <div class="pdfv-actions">
                    <button class="pdfv-btn pdfv-download" type="button" title="Descargar PDF">
                        <i class="fas fa-download"></i> Descargar
                    </button>
                    <button class="pdfv-btn pdfv-close" type="button" title="Cerrar">
                        <i class="fas fa-times"></i>
                    </button>
                </div>
            </div>
            <div class="pdfv-pages"></div>
        </div>`;

    const cerrar = () => overlay.remove();
    overlay.querySelector('.pdfv-close').addEventListener('click', cerrar);
    overlay.addEventListener('click', (e) => { if (e.target === overlay) cerrar(); });
    overlay.querySelector('.pdfv-download').addEventListener('click',
        () => descargarBlob(blobDescarga, nombre));

    inyectarEstilos();
    return overlay;
}

/** Estilos del visor (se inyectan una sola vez). */
function inyectarEstilos() {
    if (document.getElementById('pdfv-styles')) return;
    const style = document.createElement('style');
    style.id = 'pdfv-styles';
    style.textContent = `
        .pdfv-overlay { position: fixed; inset: 0; z-index: 10000; background: rgba(15,23,42,0.7);
            backdrop-filter: blur(4px); display: flex; align-items: center; justify-content: center; padding: 16px; }
        .pdfv-modal { background: #f1f5f9; width: 100%; max-width: 920px; height: 92vh; border-radius: 20px;
            overflow: hidden; display: flex; flex-direction: column; box-shadow: 0 20px 60px rgba(0,0,0,0.4); }
        .pdfv-header { display: flex; align-items: center; justify-content: space-between; gap: 12px;
            background: #0f172a; color: #fff; padding: 14px 18px; flex: 0 0 auto; }
        .pdfv-title { font-weight: 800; font-size: 0.95rem; display: flex; align-items: center; gap: 10px;
            min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .pdfv-actions { display: flex; gap: 8px; flex: 0 0 auto; }
        .pdfv-btn { border: none; cursor: pointer; border-radius: 10px; font-weight: 700; font-size: 0.8rem;
            padding: 8px 12px; display: inline-flex; align-items: center; gap: 6px; transition: all .15s; }
        .pdfv-download { background: #4f46e5; color: #fff; }
        .pdfv-download:hover { background: #4338ca; }
        .pdfv-close { background: rgba(255,255,255,0.12); color: #fff; }
        .pdfv-close:hover { background: rgba(255,255,255,0.25); }
        .pdfv-pages { flex: 1 1 auto; overflow-y: auto; padding: 16px; display: flex; flex-direction: column;
            align-items: center; gap: 16px; }
        .pdfv-canvas { max-width: 100%; box-shadow: 0 4px 14px rgba(0,0,0,0.15); border-radius: 4px; background: #fff; }
    `;
    document.head.appendChild(style);
}
