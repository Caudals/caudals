#!/usr/bin/env python3
"""Generate the private Warmbly Swarm deployment from installer configuration.

Run as root on caudals-1. Configuration and encryption material stay in
/opt/warmbly; generated manifests contain only public configuration and
references to Docker secrets. No existing platform service is modified.
"""
import json
import hashlib
import os
from pathlib import Path
import shlex
import subprocess

ROOT = Path('/opt/warmbly')
os.umask(0o077)
settings = {}
for line in (ROOT / '.env').read_text().splitlines():
    if line and not line.startswith('#') and '=' in line:
        key, value = line.split('=', 1)
        settings[key] = value
settings.update({
    'GEODB_PATH': '/app/data/GeoLite2-City.mmdb',
    'AUTH_LOGIN_CODE': 'off',
    'UPDATER_URL': 'http://updater:8095',
    'EMAIL_BRAND_NAME': 'Caudals',
    'EMAIL_NAME': 'Caudals',
    'EMAIL_DOMAIN': 'out.caudals.com',
    'EMAIL_BRAND_WEBSITE_URL': 'https://caudals.com',
    'TRUSTED_PROXIES': '10.0.0.0/8',
    'TRACKING_TRUSTED_PROXIES': '10.0.0.0/8',
    'BLOB_PUBLIC_BASE_URL': settings['API_PUBLIC_URL'].rstrip('/') + '/public',
})
manifest = json.loads((ROOT / 'images.json').read_text())
if manifest['tag'] != settings['WARMBLY_TAG']:
    raise SystemExit('Release manifest does not match configured tag')

secret_keys = {
    'PRIMARY_DB', 'POSTGRES_PASSWORD', 'CREDENTIALS_ENCRYPTION_KEY',
    'KMS_LOCAL_MASTER_KEY', 'AUTH_SECRET', 'INTERNAL_API_TOKEN',
    'SECRET_KEY_BASE', 'UPDATER_TOKEN',
    'SMTP_PASSWORD',
}
private = {k: v for k, v in settings.items() if k in secret_keys}
public = {k: v for k, v in settings.items()
          if k not in secret_keys and not k.startswith('WARMBLY_')}
if 'WARMBLY_SETTINGS_BOOTSTRAP' in settings:
    public['WARMBLY_SETTINGS_BOOTSTRAP'] = settings['WARMBLY_SETTINGS_BOOTSTRAP']
public.pop('PUBLIC_HOST', None)
secrets = {}

def make_secret(role, values):
    body = ''.join(k + '=' + shlex.quote(v) + '\n' for k, v in values.items())
    name = 'caudals_warmbly_' + role + '_env_' + hashlib.sha256(body.encode()).hexdigest()[:12]
    path = ROOT / (role + '.secret.env')
    path.write_text(body)
    path.chmod(0o600)
    existing = subprocess.run(['docker', 'secret', 'inspect', name],
                              stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    if existing.returncode:
        subprocess.run(['docker', 'secret', 'create', name, str(path)],
                       check=True, stdout=subprocess.DEVNULL)
    secrets[role] = {'external': True, 'name': name}
    return [{'source': role, 'target': 'runtime_env', 'uid': '1000',
             'gid': '1000', 'mode': 0o400}]

services = {}
def app(role, memory, command, values=None, env=None, mounts=None, proxy=False):
    service = {
        'image': manifest['registry'] + '/' + role + '@' + manifest['images'][role],
        'environment': env or {},
        'networks': {'private': {'aliases': [role]}},
        'deploy': {
            'replicas': 1,
            'placement': {'constraints': ['node.role == manager']},
            'restart_policy': {'condition': 'any', 'delay': '10s'},
            'update_config': {'order': 'stop-first', 'failure_action': 'rollback'},
            'resources': {'limits': {'memory': memory}},
        },
        'stop_grace_period': '60s',
        'logging': {'driver': 'json-file', 'options': {'max-size': '10m', 'max-file': '3'}},
    }
    if values:
        service['secrets'] = make_secret(role, values)
        service['entrypoint'] = ['/bin/sh', '-c']
        service['command'] = ['set -a; . /run/secrets/runtime_env; set +a; exec ' + command]
        service['environment']['WARMBLY_RUNTIME_ENV_FILE'] = '/run/secrets/runtime_env'
    if mounts:
        service['volumes'] = mounts
    if proxy:
        service['networks']['dokploy-network'] = {'aliases': ['caudals-warmbly-' + role]}
    services[role] = service
    return service

compose_file = ROOT / 'docker-compose.yml'
if not compose_file.exists():
    out = subprocess.check_output(['bash', str(ROOT / 'install.sh'), '--dir', str(ROOT), '--dry-run'], text=True)
    marker = f"── {compose_file} (mode 0644)"
    if marker in out:
        compose_content = out.split(marker)[1].strip()
        lines = [l[2:] if l.startswith('  ') else l for l in compose_content.splitlines()]
        clean_lines = []
        for l in lines:
            if l.startswith('╭') or l.startswith('│') or l.startswith('╰'):
                break
            clean_lines.append(l)
        compose_file.write_text(chr(10).join(clean_lines) + chr(10))
        compose_file.chmod(0o644)

blobs = str(ROOT / 'data/blobs') + ':/data/blobs'
for directory in ('postgres', 'redis', 'nats', 'blobs', 'worker', 'updater'):
    path = ROOT / 'data' / directory
    path.mkdir(parents=True, exist_ok=True)
    if directory in ('blobs', 'worker'):
        os.chown(path, 1000, 1000)

server_private = {k: v for k, v in private.items()
                  if k not in ('POSTGRES_PASSWORD',)}
app('backend', '384M', '/app/backend', server_private,
    {**public, 'API_HOST': '0.0.0.0:8080', 'GIN_MODE': 'release'}, [blobs], True)
app('consumer', '256M', '/app/consumer', server_private, public, [blobs])
worker_private = {k: v for k, v in server_private.items()
                  if k in ('CREDENTIALS_ENCRYPTION_KEY', 'KMS_LOCAL_MASTER_KEY', 'INTERNAL_API_TOKEN')}
worker_private['ENCRYPTED_KEYS_WORKER_TOKEN'] = private['INTERNAL_API_TOKEN']
app('worker', '256M', '/app/worker', worker_private,
    {**public, 'ENCRYPTED_KEYS_PROVIDER': 'http',
     'ENCRYPTED_KEYS_BACKEND_URL': 'http://backend:8080',
     'WORKER_STATE_DIR': '/data/state', 'MAIL_TLS_INSECURE': 'false'},
    [blobs, str(ROOT / 'data/worker') + ':/data/state'])
app('web', '64M', '', env={'WARMBLY_API_URL': settings['API_PUBLIC_URL'],
    'WARMBLY_APP_URL': settings['APP_URL']}, proxy=True)
app('admin', '64M', '', env={'WARMBLY_API_URL': settings['API_PUBLIC_URL'],
    'WARMBLY_DASHBOARD_URL': settings['APP_URL'], 'WARMBLY_ENV_LABEL': 'production'}, proxy=True)
app('tracking', '128M', '/app/tracking', {'INTERNAL_API_TOKEN': private['INTERNAL_API_TOKEN']},
    {**public, 'TRACKING_HOST': '0.0.0.0', 'TRACKING_PORT': '3000',
     'BACKEND_INTERNAL_URL': 'http://backend:8080'}, proxy=True)
app('forms', '96M', '/app/forms', {'INTERNAL_API_TOKEN': private['INTERNAL_API_TOKEN']},
    {**public, 'GIN_MODE': 'release', 'FORMS_PORT': '8090',
     'BACKEND_INTERNAL_URL': 'http://backend:8080'}, proxy=True)
app('realtime', '384M', '/app/bin/realtime start',
    {'DATABASE_URL': private['PRIMARY_DB'], 'JWT_SECRET': private['AUTH_SECRET'],
     'SECRET_KEY_BASE': private['SECRET_KEY_BASE']},
    {'PORT': '4000', 'DATABASE_SSL': 'false', 'REDIS_URL': settings['REDIS'],
     'PHX_HOST': 'out.caudals.com', 'CHECK_ORIGIN_HOSTS': settings['CHECK_ORIGIN_HOSTS'],
     'PUBSUB_ENABLED': 'false', 'ERL_FLAGS': '+S 2:2'}, proxy=True)

running_updater = subprocess.run(
    ['docker', 'service', 'inspect', 'caudals-warmbly_updater', '--format', '{{.Spec.TaskTemplate.ContainerSpec.Image}}'],
    capture_output=True, text=True
)
updater_image = manifest['registry'] + '/updater@' + manifest['images']['updater']
if running_updater.returncode == 0 and running_updater.stdout.strip():
    updater_image = running_updater.stdout.strip()

services['updater'] = {
    'image': updater_image,
    'environment': {
        'UPDATER_MODE': 'command',
        'UPDATER_COMMAND': '/opt/warmbly/update.sh',
        'UPDATER_ALLOW_DIRTY': 'true',
        'UPDATER_TOKEN': private['INTERNAL_API_TOKEN'],
        'UPDATER_REPO_DIR': str(ROOT),
        'UPDATER_COMPOSE_PROJECT': 'warmbly',
        'UPDATER_COMPOSE_PROFILES': '',
        'UPDATER_BACKEND_HEALTH_URL': 'http://backend:8080/health',
        'UPDATER_ADDR': ':8095',
    },
    'working_dir': str(ROOT),
    'networks': {'private': {'aliases': ['updater']}},
    'volumes': [
        '/var/run/docker.sock:/var/run/docker.sock',
        str(ROOT) + ':' + str(ROOT),
        str(ROOT / 'data/updater') + ':/var/lib/warmbly-updater',
    ],
    'deploy': {
        'replicas': 1,
        'placement': {'constraints': ['node.role == manager']},
        'restart_policy': {'condition': 'any', 'delay': '10s'},
        'resources': {'limits': {'memory': '128M'}},
    },
    'logging': {'driver': 'json-file', 'options': {'max-size': '10m', 'max-file': '3'}},
}

for role, image, memory, target in (
    ('postgres', 'postgres:16-alpine', '384M', '/var/lib/postgresql/data'),
    ('redis', 'redis:7-alpine', '96M', '/data'),
    ('nats', 'nats:2.10-alpine', '96M', '/data'),
):
    services[role] = {
        'image': image, 'networks': {'private': {'aliases': [role]}},
        'volumes': [str(ROOT / 'data' / role) + ':' + target],
        'deploy': {'replicas': 1, 'placement': {'constraints': ['node.role == manager']},
                   'restart_policy': {'condition': 'any', 'delay': '10s'},
                   'resources': {'limits': {'memory': memory}}},
        'logging': {'driver': 'json-file', 'options': {'max-size': '10m', 'max-file': '3'}},
    }
services['postgres'].update({
    'environment': {'POSTGRES_USER': 'warmbly', 'POSTGRES_DB': 'warmbly',
                    'POSTGRES_PASSWORD_FILE': '/run/secrets/runtime_env'},
    'secrets': make_secret('postgres', {'POSTGRES_PASSWORD': private['POSTGRES_PASSWORD']}),
    'entrypoint': ['/bin/sh', '-c'],
    'command': ['set -a; . /run/secrets/runtime_env; set +a; unset POSTGRES_PASSWORD_FILE; exec docker-entrypoint.sh postgres'],
    'healthcheck': {'test': ['CMD-SHELL', 'pg_isready -U warmbly'], 'interval': '10s'},
})
services['redis']['command'] = ['redis-server', '--appendonly', 'yes', '--maxmemory', '64mb', '--maxmemory-policy', 'noeviction']
services['nats']['command'] = ['-js', '-sd', '/data', '-m', '8222']
override = ROOT / 'web-image.txt'
if override.exists():
    custom_image = override.read_text().strip()
    if not custom_image.startswith('caudals-warmbly-web:'):
        raise ValueError('Unexpected dashboard image override')
    services['web']['image'] = custom_image

stack = {'version': '3.8', 'services': services, 'secrets': secrets,
         'networks': {'private': {'driver': 'overlay'}, 'dokploy-network': {'external': True}}}
(ROOT / 'stack.yml').write_text(json.dumps(stack, indent=2) + '\n')
print('Prepared pinned Warmbly stack with Docker secret files and private storage.')
