"""Compresión de PDFs para las visitas históricas subidas.

Usa pikepdf (qpdf) para recomprimir los streams y consolidar objetos, lo que
reduce el tamaño de PDFs no optimizados sin riesgo de corromper el archivo.
Si el resultado quedara más grande que el original (PDF ya optimizado), se
conserva el original.
"""
import io
import logging

logger = logging.getLogger(__name__)


def comprimir_pdf(data: bytes) -> bytes:
    """Recibe los bytes de un PDF y devuelve una versión comprimida.

    Nunca lanza: ante cualquier error (PDF inválido para pikepdf, etc.) devuelve
    los bytes originales para no bloquear la subida.
    """
    try:
        import pikepdf

        with pikepdf.open(io.BytesIO(data)) as pdf:
            out = io.BytesIO()
            pdf.save(
                out,
                compress_streams=True,
                recompress_flate=True,
                object_stream_mode=pikepdf.ObjectStreamMode.generate,
            )
            comprimido = out.getvalue()

        # Conservar el más pequeño (algunos PDF ya vienen optimizados).
        if comprimido and len(comprimido) < len(data):
            return comprimido
        return data
    except Exception as e:
        logger.warning(f"[PDF] No se pudo comprimir, se usa el original: {e}")
        return data
