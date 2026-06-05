import os
import json
import urllib.parse
from datetime import datetime

def generate_weekly_report_html(data, latest_drafts, base_url=None):
    """
    data: dict con {
        "GLOBAL": { "CERRADA": x, "BORRADOR": y, "LISTO_PARA_FIRMA": z, "TOTAL": t },
        "SCHOOLS": {
            "Macaya": { "CERRADA": x, "BORRADOR": y, "LISTO_PARA_FIRMA": z, "TOTAL": t },
            "Diego Portales": { "CERRADA": x, "BORRADOR": y, "LISTO_PARA_FIRMA": z, "TOTAL": t }
        }
    }
    latest_drafts: list of dicts with {id, docente, fecha, curso}
    """
    if not base_url:
        base_url = os.getenv("BASE_URL", "http://127.0.0.1:5502/frontend")
    
    global_counts = data.get("GLOBAL", {"CERRADA": 0, "BORRADOR": 0, "LISTO_PARA_FIRMA": 0, "TOTAL": 0})
    schools = data.get("SCHOOLS", {})
    
    # Construcción segura del gráfico Global
    total_evals = global_counts.get("TOTAL", 0)
    chart_config = {
        'type': 'doughnut',
        'data': {
            'labels': ['Cerrados', 'Borradores', 'Por Firmar'],
            'datasets': [{
                'data': [
                    global_counts.get("CERRADA", 0), 
                    global_counts.get("BORRADOR", 0), 
                    global_counts.get("LISTO_PARA_FIRMA", 0)
                ],
                'backgroundColor': ['#10b981', '#f59e0b', '#3b82f6']
            }]
        },
        'options': {
            'plugins': {
                'legend': {'display': False},
                'doughnutlabel': {
                    'labels': [
                        {'text': str(total_evals), 'font': {'size': 20, 'weight': 'bold'}},
                        {'text': 'Total'}
                    ]
                }
            }
        }
    }
    
    chart_json = json.dumps(chart_config)
    chart_url = f"https://quickchart.io/chart?c={urllib.parse.quote(chart_json)}"

    # Bloques de Colegios
    school_html = ""
    for name, s in schools.items():
        is_macaya = "MACAYA" in name.upper()
        main_color = "#064e3b" if is_macaya else "#1e3a8a"
        bg_color = "#f0fdf4" if is_macaya else "#eff6ff"
        border_color = "#dcfce7" if is_macaya else "#dbeafe"
        
        school_html += f"""
        <div style="margin-bottom: 25px; padding: 20px; border: 1px solid {border_color}; background-color: {bg_color}; border-radius: 12px;">
            <h3 style="margin: 0 0 15px 0; color: {main_color}; font-size: 18px; border-bottom: 2px solid {main_color}33; padding-bottom: 5px;">{name}</h3>
            <table border="0" cellpadding="0" cellspacing="0" width="100%">
                <tr>
                    <td width="30%" style="text-align: center;">
                        <div style="color: #64748b; font-size: 11px; text-transform: uppercase;">Cerrados</div>
                        <div style="color: #10b981; font-size: 22px; font-weight: 700;">{s['CERRADA']}</div>
                    </td>
                    <td width="30%" style="text-align: center;">
                        <div style="color: #64748b; font-size: 11px; text-transform: uppercase;">Borradores</div>
                        <div style="color: #f59e0b; font-size: 22px; font-weight: 700;">{s['BORRADOR']}</div>
                    </td>
                    <td width="40%" style="text-align: center; border-left: 1px solid {border_color};">
                        <div style="color: #64748b; font-size: 11px; text-transform: uppercase;">Total Colegio</div>
                        <div style="color: {main_color}; font-size: 22px; font-weight: 800;">{s['TOTAL']}</div>
                    </td>
                </tr>
            </table>
        </div>
        """

    # Generar filas de la tabla de borradores (Global)
    draft_rows = ""
    for d in latest_drafts:
        draft_rows += f"""
        <tr style="border-bottom: 1px solid #e5e7eb;">
            <td style="padding: 12px 0; font-size: 14px; color: #374151;">{d['docente']}</td>
            <td style="padding: 12px 0; font-size: 14px; color: #6b7280;">{d['curso']}</td>
            <td style="padding: 12px 0; font-size: 14px; color: #6b7280;">{d['fecha']}</td>
            <td style="padding: 12px 0; text-align: right;">
                <a href="{base_url}/ver-acta.html?id={d['id']}" style="color: #6366f1; text-decoration: none; font-size: 14px; font-weight: 600;">Ver &rarr;</a>
            </td>
        </tr>
        """

    if not draft_rows:
        draft_rows = '<tr><td colspan="4" style="padding: 20px 0; text-align: center; color: #9ca3af; font-style: italic;">No hay acompañamientos pendientes en borrador.</td></tr>'

    html = f"""
    <!DOCTYPE html>
    <html lang="es">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Resumen Semanal de Acompañamiento Liderazgo</title>
    </head>
    <body style="margin: 0; padding: 0; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #f3f4f6; color: #1f2937;">
        <table align="center" border="0" cellpadding="0" cellspacing="0" width="600" style="border-collapse: collapse; background-color: #ffffff; margin-top: 20px; margin-bottom: 20px; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.1);">
            <!-- Header -->
            <tr>
                <td style="padding: 40px 40px 20px 40px; background: linear-gradient(135deg, #1e1b4b 0%, #312e81 100%);">
                    <h1 style="margin: 0; color: #ffffff; font-size: 24px; font-weight: 700; letter-spacing: -0.025em;">Seguimiento por Colegio</h1>
                    <p style="margin: 8px 0 0 0; color: #c7d2fe; font-size: 16px;">Resumen semanal de gestión pedagógica</p>
                </td>
            </tr>
            
            <!-- Global Pie Chart (Mini) -->
            <tr>
                <td style="padding: 20px 40px 10px 40px; text-align: right;">
                    <table border="0" cellpadding="0" cellspacing="0" width="100%">
                        <tr>
                            <td width="70%" style="vertical-align: middle;">
                                <h2 style="margin: 0; color: #1e1b4b; font-size: 18px;">Distribución Global</h2>
                                <p style="margin: 5px 0 0 0; color: #64748b; font-size: 13px;">Total red: {total_evals} acompañamientos.</p>
                            </td>
                            <td width="30%" style="text-align: center;">
                                <img src="{chart_url}" width="100" alt="Gráfico" style="display: block; margin: 0 auto;">
                            </td>
                        </tr>
                    </table>
                </td>
            </tr>

            <!-- School Specific Sections -->
            <tr>
                <td style="padding: 10px 40px 30px 40px;">
                    {school_html}
                </td>
            </tr>

            <!-- Table Section (Drafts) -->
            <tr>
                <td style="padding: 0 40px 30px 40px;">
                    <h2 style="margin: 0 0 15px 0; color: #111827; font-size: 18px; font-weight: 600;">Últimos Borradores Pendientes (Red)</h2>
                    <table border="0" cellpadding="0" cellspacing="0" width="100%">
                        <thead>
                            <tr style="border-bottom: 2px solid #f3f4f6;">
                                <th align="left" style="padding-bottom: 10px; font-size: 12px; font-weight: 600; color: #9ca3af; text-transform: uppercase;">Docente</th>
                                <th align="left" style="padding-bottom: 10px; font-size: 12px; font-weight: 600; color: #9ca3af; text-transform: uppercase;">Curso</th>
                                <th align="left" style="padding-bottom: 10px; font-size: 12px; font-weight: 600; color: #9ca3af; text-transform: uppercase;">Fecha</th>
                                <th align="right" style="padding-bottom: 10px; font-size: 12px; font-weight: 600; color: #9ca3af; text-transform: uppercase;">Acción</th>
                            </tr>
                        </thead>
                        <tbody>
                            {draft_rows}
                        </tbody>
                    </table>
                    <div style="margin-top: 25px; text-align: center;">
                        <a href="{base_url}/reporte-semanal.html" style="background-color: #1e1b4b; color: #ffffff; padding: 12px 24px; border-radius: 6px; text-decoration: none; font-weight: 600; font-size: 15px; display: inline-block;">Ver Reporte Interactivo</a>
                    </div>
                </td>
            </tr>

            <!-- Footer -->
            <tr>
                <td style="padding: 30px 40px; background-color: #f9fafb; border-top: 1px solid #f3f4f6; text-align: center;">
                    <p style="margin: 0; color: #9ca3af; font-size: 12px;">Este es un mensaje generado automáticamente.</p>
                    <p style="margin: 5px 0 0 0; color: #9ca3af; font-size: 12px;">Equipo de Innovación Tecnológica</p>
                    <p style="margin: 5px 0 0 0; color: #9ca3af; font-size: 12px;">&copy; 2026 Colegio Diego Portales / Macaya.</p>
                </td>
            </tr>
        </table>
    </body>
    </html>
    """
    return html
