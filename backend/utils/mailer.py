import smtplib
import os
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from email.mime.base import MIMEBase
from email import encoders
from dotenv import load_dotenv

load_dotenv()

SMTP_SERVER = os.getenv("SMTP_SERVER", "smtp.gmail.com")
SMTP_PORT = int(os.getenv("SMTP_PORT", "465"))
# Usar las mismas variables que utils/email.py para consistencia
SMTP_USER = os.getenv("SENDER_EMAIL")
SMTP_PASSWORD = os.getenv("SENDER_PASSWORD")
BACKUP_RECIPIENT = os.getenv("REPORT_TO_EMAIL")

def send_email_with_attachment(subject, body, filename, content, recipient=None, bcc_recipients=None):
    if not SMTP_USER or not SMTP_PASSWORD:
        print("Error: SMTP credentials (SENDER_EMAIL/SENDER_PASSWORD) not set in .env")
        return False

    to_emails = []
    if recipient:
        if isinstance(recipient, list):
            to_emails = recipient
        else:
            to_emails = [recipient]
    elif BACKUP_RECIPIENT:
        to_emails = [BACKUP_RECIPIENT]

    if not to_emails and not bcc_recipients:
        print("Error: No recipient specified for email")
        return False

    try:
        # Create message
        msg = MIMEMultipart()
        msg['From'] = SMTP_USER
        if to_emails:
            msg['To'] = ", ".join(to_emails)
        msg['Subject'] = subject

        msg.attach(MIMEText(body, 'plain'))

        # Add attachment
        part = MIMEBase('application', 'octet-stream')
        part.set_payload(content.encode('utf-8') if isinstance(content, str) else content)
        encoders.encode_base64(part)
        part.add_header('Content-Disposition', f"attachment; filename= {filename}")
        msg.attach(part)

        # Send email using SSL for port 465
        server = smtplib.SMTP_SSL(SMTP_SERVER, SMTP_PORT)
        server.login(SMTP_USER, SMTP_PASSWORD)
        
        all_recipients = to_emails + (bcc_recipients if bcc_recipients else [])
        text = msg.as_string()
        server.sendmail(SMTP_USER, all_recipients, text)
        server.quit()
        
        print(f"Email enviado correctamente a {to_emails} (BCC: {len(bcc_recipients) if bcc_recipients else 0} extras)")
        return True
    except Exception as e:
        print(f"Error al enviar email: {str(e)}")
        return False
