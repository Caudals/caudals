#!/usr/bin/env python3
"""Prepare the RocketReach add-on with Docker secrets. Run as root on caudals-1."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import secrets
import subprocess

parser = argparse.ArgumentParser()
parser.add_argument('--image', required=True)
args = parser.parse_args()
root = Path('/opt/warmbly/rocketreach')
root.mkdir(mode=0o700, parents=True, exist_ok=True)
key_file = root / 'encryption.key'
if not key_file.exists():
    key_file.write_text(secrets.token_hex(32) + '\n')
key_file.chmod(0o600)
data = root / 'data'
data.mkdir(mode=0o700, exist_ok=True)
os.chown(data, 1000, 1000)

def run(command, **kwargs):
    return subprocess.run(command, check=True, capture_output=True, **kwargs)

def docker_secret(name, content, target):
    digest = hashlib.sha256(content).hexdigest()[:12]
    identity = name + '_' + digest
    if subprocess.run(['docker', 'secret', 'inspect', identity], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL).returncode:
        run(['docker', 'secret', 'create', identity, '-'], input=content)
    return identity, {'source': identity, 'target': target, 'uid': '1000', 'gid': '1000', 'mode': 256}

key_name, key_mount = docker_secret('warmbly_rocketreach_encryption', key_file.read_bytes(), 'rocketreach_encryption_key')
external = {key_name: {'external': True}}
mounts = [key_mount]
environment = {'WARMBLY_INTERNAL_URL': 'http://backend:8080', 'PUBLIC_ORIGIN': 'https://out.caudals.com', 'ROCKETREACH_ENCRYPTION_KEY_FILE': '/run/secrets/rocketreach_encryption_key'}

stack = {
    'version': '3.8',
    'services': {'app': {
        'image': args.image,
        'environment': environment,
        'secrets': mounts,
        'networks': {'warmbly-private': {}, 'dokploy-network': {'aliases': ['caudals-warmbly-rocketreach']}},
        'volumes': [str(data) + ':/data'],
        'read_only': True,
        'tmpfs': ['/tmp:size=16m,mode=1777'],
        'cap_drop': ['ALL'],
        'deploy': {'replicas': 1, 'placement': {'constraints': ['node.role == manager']},
            'restart_policy': {'condition': 'any', 'delay': '5s'}, 'resources': {'limits': {'memory': '256M', 'cpus': '0.50'}},
            'update_config': {'order': 'stop-first', 'failure_action': 'rollback'}},
        'logging': {'driver': 'json-file', 'options': {'max-size': '5m', 'max-file': '2'}},
    }},
    'secrets': external,
    'networks': {'warmbly-private': {'external': True, 'name': 'caudals-warmbly_private'}, 'dokploy-network': {'external': True}},
}
manifest = root / 'stack.yml'
manifest.write_text(json.dumps(stack, indent=2) + '\n')
manifest.chmod(0o600)
print(json.dumps({'prepared': True, 'backups': False}))
