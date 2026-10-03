#!/usr/bin/env python3
"""Configure Warmbly platform mail with the existing Caudals Resend relay.

Does not send email or change the provider. Run as root on caudals-1 after
confirming mail.caudals.com is verified in the existing provider account.
"""
from pathlib import Path
import subprocess

path = Path('/opt/warmbly/.env')
text = path.read_text()
if '\nSMTP_PASSWORD=' in text:
    raise SystemExit('SMTP is already configured; existing credentials preserved')
container = subprocess.check_output([
    'docker', 'ps', '-q', '--filter',
    'label=com.docker.swarm.service.name=caudals-growth_social',
], text=True).strip()
if not container or '\n' in container:
    raise SystemExit('Expected one running growth-social container')
key = subprocess.check_output([
    'docker', 'exec', container, 'sh', '-c',
    'set -a; . /run/secrets/growth_social_env; set +a; printf "%s" "$RESEND_API_KEY"',
], text=True).strip()
if not key.startswith('re_') or '\n' in key:
    raise SystemExit('Resend credential unavailable')
text = '\n'.join(line for line in text.splitlines()
                 if not line.startswith(('MAIL_TRANSPORT=', 'EMAIL_ADDRESS=')))
path.write_text(text + '\nMAIL_TRANSPORT=smtp\nEMAIL_ADDRESS=noreply@mail.caudals.com\n'
                'SMTP_HOST=smtp.resend.com\nSMTP_PORT=587\nSMTP_SECURITY=starttls\n'
                'SMTP_USERNAME=resend\nSMTP_PASSWORD=' + key + '\n')
path.chmod(0o600)
print('Configured existing verified transactional sender; no email sent.')
