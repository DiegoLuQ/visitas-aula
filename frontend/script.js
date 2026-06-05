const API_URL = (window.location.port === '8080' || (window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1'))
    ? '/api'
    : `${window.location.protocol}//${window.location.hostname}:8002`;

const rubricData = [
    {
        dim: "Dimensión 1: Comunicación",
        items: [
            { title: "1. Expresión verbal", desc: "El docente comunica indicaciones, orientaciones y expectativas de aprendizaje de manera clara hacia el grupo." },
            { title: "2. Expresión corporal / comunicación no verbal", desc: "El docente utiliza postura, desplazamiento, contacto visual y tono de voz para posicionarse frente al grupo y sostener la atención de los estudiantes." },
            { title: "3. Claridad en las instrucciones", desc: "Las indicaciones entregadas por el docente son comprendidas por los estudiantes, facilitando la participación y el desarrollo de las actividades." }
        ]
    },
    {
        dim: "Dimensión 2: Presencia de Liderazgo",
        items: [
            { title: "4. Presencia frente al grupo", desc: "El docente logra posicionarse como referente frente al curso, generando orientación y conducción del proceso de aprendizaje." },
            { title: "5. Seguridad y confianza", desc: "El docente transmite seguridad, dominio y claridad en la conducción del grupo." },
            { title: "6. Confiabilidad", desc: "El docente transmite consistencia y responsabilidad en su actuar frente a los estudiantes." }
        ]
    },
    {
        dim: "Dimensión 3: Organización",
        items: [
            { title: "7. Organización del trabajo del grupo", desc: "El docente organiza adecuadamente el desarrollo de la actividad en el aula, favoreciendo el logro de los objetivos de aprendizaje." },
            { title: "8. Manejo del tiempo del grupo", desc: "El docente mantiene un ritmo de trabajo adecuado durante la clase, optimizando el tiempo disponible para el aprendizaje." },
            { title: "9. Claridad en la conducción de la actividad", desc: "El docente orienta adecuadamente el desarrollo del trabajo en el aula, guiando a los estudiantes durante la actividad." }
        ]
    },
    {
        dim: "Dimensión 4: Conducción del Grupo",
        items: [
            { title: "10. Conducción del grupo curso", desc: "El docente dirige adecuadamente la dinámica del grupo durante la clase, facilitando la participación y el trabajo colaborativo." },
            { title: "11. Gestión del clima del grupo", desc: "El docente promueve un ambiente de respeto, seguridad y disposición al aprendizaje." },
            { title: "12. Manejo de situaciones dentro del aula", desc: "El docente responde adecuadamente frente a interrupciones o situaciones del grupo, manteniendo el foco en el aprendizaje." }
        ]
    },
    {
        dim: "Dimensión 5: Coherencia y Consecuencia",
        items: [
            { title: "13. Coherencia entre discurso y acción", desc: "El docente actúa de manera coherente con lo que comunica al grupo." },
            { title: "14. Consecuencia en la conducción del grupo", desc: "El docente mantiene consistencia en las normas o indicaciones que entrega." },
            { title: "15. Responsabilidad frente al grupo", desc: "El docente demuestra compromiso y responsabilidad en la conducción de la clase." }
        ]
    }
];

document.addEventListener('DOMContentLoaded', () => {
    if (!localStorage.getItem('token')) {
        window.location.href = 'login.html';
        return;
    }

    const username = localStorage.getItem('username');
    document.getElementById('userDisplay').textContent = username;

    const tbody = document.getElementById('rubricBody');
    let indCount = 1;

    rubricData.forEach(d => {
        tbody.innerHTML += `<tr><td colspan="2" class="dimension-row">${d.dim}</td></tr>`;
        d.items.forEach(item => {
            let radios = '';
            for (let i = 1; i <= 5; i++) {
                radios += `<input type="radio" name="ind${indCount}" value="${i}" class="calc-radio" required>`;
            }
            tbody.innerHTML += `
                <tr>
                    <td>
                        <span class="indicator-title">${item.title}</span>
                        <span class="indicator-desc">${item.desc}</span>
                    </td>
                    <td style="vertical-align: top; padding-top: 15px;">
                        <div class="radio-group">${radios}</div>
                    </td>
                </tr>`;
            indCount++;
        });
    });

    const radioButtons = document.querySelectorAll('.calc-radio');
    radioButtons.forEach(radio => {
        radio.addEventListener('change', calcularPromedio);
    });

    function calcularPromedio() {
        let suma = 0;
        let contestados = 0;

        for (let i = 1; i <= 15; i++) {
            let seleccionado = document.querySelector(`input[name="ind${i}"]:checked`);
            if (seleccionado) {
                suma += parseInt(seleccionado.value);
                contestados++;
            }
        }

        if (contestados > 0) {
            let promedio = (suma / contestados).toFixed(2);
            document.getElementById('promedioDisplay').innerText = promedio;
        }
    }

    const form = document.getElementById('evaluationForm');

    form.addEventListener('submit', async function (e) {
        e.preventDefault();

        if (!confirm('¿Estás seguro de guardar esta evaluación?')) return;

        let apoyosSugeridos = [];
        document.querySelectorAll('.tipoApoyo:checked').forEach(chk => apoyosSugeridos.push(chk.value));

        let funcGrupo = document.querySelector('input[name="funcGrupo"]:checked');
        let orientacion = document.querySelector('input[name="orientacion"]:checked');
        let nivelApoyo = document.querySelector('input[name="nivelApoyo"]:checked');

        const evaluacion = {
            docente: document.getElementById('docente').value,
            curso: document.getElementById('curso').value,
            asignatura: document.getElementById('asignatura').value,
            fecha: document.getElementById('fecha').value,
            observador: document.getElementById('observador').value,
            duracion: document.getElementById('duracion').value,
            ind1: parseInt(document.querySelector('input[name="ind1"]:checked')?.value || 0),
            ind2: parseInt(document.querySelector('input[name="ind2"]:checked')?.value || 0),
            ind3: parseInt(document.querySelector('input[name="ind3"]:checked')?.value || 0),
            ind4: parseInt(document.querySelector('input[name="ind4"]:checked')?.value || 0),
            ind5: parseInt(document.querySelector('input[name="ind5"]:checked')?.value || 0),
            ind6: parseInt(document.querySelector('input[name="ind6"]:checked')?.value || 0),
            ind7: parseInt(document.querySelector('input[name="ind7"]:checked')?.value || 0),
            ind8: parseInt(document.querySelector('input[name="ind8"]:checked')?.value || 0),
            ind9: parseInt(document.querySelector('input[name="ind9"]:checked')?.value || 0),
            ind10: parseInt(document.querySelector('input[name="ind10"]:checked')?.value || 0),
            ind11: parseInt(document.querySelector('input[name="ind11"]:checked')?.value || 0),
            ind12: parseInt(document.querySelector('input[name="ind12"]:checked')?.value || 0),
            ind13: parseInt(document.querySelector('input[name="ind13"]:checked')?.value || 0),
            ind14: parseInt(document.querySelector('input[name="ind14"]:checked')?.value || 0),
            ind15: parseInt(document.querySelector('input[name="ind15"]:checked')?.value || 0),
            promedio: parseFloat(document.getElementById('promedioDisplay').innerText) || 0,
            func_grupo: funcGrupo ? funcGrupo.value : '',
            fortalezas: document.getElementById('fortalezas').value,
            aspectos: document.getElementById('aspectos').value,
            orientacion: orientacion ? orientacion.value : '',
            nivel_apoyo: nivelApoyo ? nivelApoyo.value : '',
            apoyos: apoyosSugeridos.join(", "),
            comentarios: document.getElementById('comentarios').value
        };

        try {
            const token = localStorage.getItem('token');
            const response = await fetch(`${API_URL}/evaluaciones/`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify(evaluacion)
            });

            if (!response.ok) {
                throw new Error('Error al guardar la evaluación');
            }

            alert("¡Evaluación guardada exitosamente!");
            form.reset();
            document.getElementById('promedioDisplay').innerText = "_____";
        } catch (error) {
            alert("Error: " + error.message);
        }
    });

    const btnVerRegistros = document.getElementById('btnVerRegistros');
    const btnOcultarRegistros = document.getElementById('btnOcultarRegistros');
    const databaseView = document.getElementById('databaseView');
    const recordsList = document.getElementById('recordsList');
    const btnExportarExcel = document.getElementById('btnExportarExcel');

    btnVerRegistros.addEventListener('click', async () => {
        databaseView.style.display = 'block';
        recordsList.innerHTML = '<p>Cargando...</p>';

        try {
            const token = localStorage.getItem('token');
            const response = await fetch(`${API_URL}/evaluaciones/`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });

            if (!response.ok) throw new Error('Error al cargar');

            const registros = await response.json();

            if (registros.length === 0) {
                recordsList.innerHTML = "<p>No hay evaluaciones guardadas aún.</p>";
                return;
            }

            recordsList.innerHTML = '';
            registros.forEach(reg => {
                const fecha = new Date(reg.fecha).toLocaleDateString('es-ES');
                const fechaGuardado = new Date(reg.fecha_guardado).toLocaleString('es-ES');
                recordsList.innerHTML += `
                    <div class="record-card">
                        <div class="record-header">
                            <strong>Docente:</strong> ${reg.docente} | <strong>Curso:</strong> ${reg.curso}
                        </div>
                        <div class="record-body">
                            <span><strong>Asignatura:</strong> ${reg.asignatura}</span>
                            <span><strong>Fecha:</strong> ${fecha}</span>
                            <span><strong>Promedio:</strong> <span class="promedio-badge">${reg.promedio}</span></span>
                        </div>
                        <div class="record-body">
                            <span><strong>Funcionamiento Grupo:</strong> ${reg.func_grupo}</span>
                            <span><strong>Orientación:</strong> ${reg.orientacion}</span>
                            <span><strong>Nivel Apoyo:</strong> ${reg.nivel_apoyo}</span>
                        </div>
                        ${reg.fortalezas ? `<div class="record-detail"><strong>Fortalezas:</strong> ${reg.fortalezas}</div>` : ''}
                        ${reg.aspectos ? `<div class="record-detail"><strong>Aspectos a Fortalecer:</strong> ${reg.aspectos}</div>` : ''}
                        <div class="record-footer">
                            <em>Guardado: ${fechaGuardado}</em>
                            <button class="btn-delete" onclick="eliminarEvaluacion(${reg.id})">Eliminar</button>
                        </div>
                    </div>
                `;
            });
            databaseView.scrollIntoView({ behavior: 'smooth' });
        } catch (error) {
            recordsList.innerHTML = `<p class="error">Error: ${error.message}</p>`;
        }
    });

    btnOcultarRegistros.addEventListener('click', () => {
        databaseView.style.display = 'none';
        window.scrollTo({ top: 0, behavior: 'smooth' });
    });

    btnExportarExcel.addEventListener('click', async () => {
        try {
            const token = localStorage.getItem('token');
            const response = await fetch(`${API_URL}/evaluaciones/export/excel`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });

            if (!response.ok) throw new Error('Error al exportar');

            const blob = await response.blob();
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `evaluaciones_liderazgo_${new Date().toISOString().slice(0,10)}.xlsx`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            window.URL.revokeObjectURL(url);
        } catch (error) {
            alert("Error al exportar: " + error.message);
        }
    });

    document.getElementById('btnLogout').addEventListener('click', () => {
        localStorage.removeItem('token');
        localStorage.removeItem('username');
        window.location.href = 'login.html';
    });
});

async function eliminarEvaluacion(id) {
    if (!confirm('¿Estás seguro de eliminar esta evaluación?')) return;

    try {
        const token = localStorage.getItem('token');
        const response = await fetch(`${API_URL}/evaluaciones/${id}`, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${token}` }
        });

        if (!response.ok) throw new Error('Error al eliminar');

        alert('Evaluación eliminada');
        document.getElementById('btnVerRegistros').click();
    } catch (error) {
        alert('Error: ' + error.message);
    }
}
