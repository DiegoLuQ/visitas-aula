import smtplib
import os
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from email.mime.application import MIMEApplication
from dotenv import load_dotenv

load_dotenv()

SMTP_SERVER = os.getenv("SMTP_SERVER", "smtp.gmail.com")
SMTP_PORT = int(os.getenv("SMTP_PORT", "465"))
SENDER_EMAIL = os.getenv("SENDER_EMAIL")
SENDER_PASSWORD = os.getenv("SENDER_PASSWORD")

# Credenciales específicas por colegio
DP_EMAIL = os.getenv("DP_SENDER_EMAIL")
DP_PASS = os.getenv("DP_SENDER_PASSWORD")
MC_EMAIL = os.getenv("MC_SENDER_EMAIL")
MC_PASS = os.getenv("MC_SENDER_PASSWORD")

def send_evaluation_email(to_emails, subject, body, body_html=None, pdf_content=None, pdf_filename="acompanamiento.pdf", bcc_emails=None, cc_emails=None, school_type=None):
    """
    to_emails: list of strings
    cc_emails: list of strings (optional)
    bcc_emails: list of strings (optional)
    pdf_content: bytes
    school_type: "DP" o "MC" (opcional)
    """
    # Selección de credenciales
    current_sender = SENDER_EMAIL
    current_pass = SENDER_PASSWORD
    
    if school_type == "DP" and DP_EMAIL and DP_PASS:
        current_sender = DP_EMAIL
        current_pass = DP_PASS
    elif school_type == "MC" and MC_EMAIL and MC_PASS:
        current_sender = MC_EMAIL
        current_pass = MC_PASS

    if not current_sender or not current_pass:
        print(f"Error: SMTP credentials not configured for {school_type or 'default'}.")
        return False

    msg = MIMEMultipart('mixed')
    msg['From'] = current_sender
    msg['To'] = ", ".join(to_emails)
    
    if cc_emails:
        msg['Cc'] = ", ".join(cc_emails)
        
    msg['Subject'] = subject

    # Crear el contenedor alternative para texto y html
    alternative = MIMEMultipart('alternative')
    alternative.attach(MIMEText(body, 'plain'))
    if body_html:
        alternative.attach(MIMEText(body_html, 'html'))
    
    msg.attach(alternative)

    if pdf_content:
        part = MIMEApplication(pdf_content, Name=pdf_filename)
        part['Content-Disposition'] = f'attachment; filename="{pdf_filename}"'
        msg.attach(part)

    try:
        # Usamos SMTP_SSL para el puerto 465
        with smtplib.SMTP_SSL(SMTP_SERVER, SMTP_PORT) as server:
            server.login(current_sender, current_pass)
            # Para BCC y CC, enviamos a la suma de todos los destinatarios, 
            # pero el header 'To' y 'Cc' solo contienen los especificados.
            all_recipients = to_emails + (cc_emails if cc_emails else []) + (bcc_emails if bcc_emails else [])
            server.sendmail(current_sender, all_recipients, msg.as_string())
        return True
    except Exception as e:
        print(f"Error sending email: {e}")
        return False
