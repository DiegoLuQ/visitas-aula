/**
 * Global Application State
 */

export const state = {
    currentUser: null,
    dimensiones: [],
    niveles: [],
    cursos: [],
    colegios: [],
    asignaturas: [],
    docentes: [],
    roles: [],
    
    // SlimeSelect instances
    slimColegio: null,
    slimDocente: null,
    slimObservador: null,
    slimConfig: null,
    
    // PDF related
    _pdfBlobUrl: null,
    currentEvalId: null,
    
    // Platform context
    currentContext: localStorage.getItem('currentContext') || null
};

// Functions to update state objects while keeping references (if needed)
export function setState(key, value) {
    state[key] = value;
}
