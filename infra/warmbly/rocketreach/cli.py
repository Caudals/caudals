#!/usr/bin/env python3
"""JSON CLI and MCP stdio bridge for the Warmbly RocketReach plugin."""
import argparse
import json
import os
import subprocess
import sys
import urllib.error
import urllib.request
from pathlib import Path

BASE = os.environ.get('WARMBLY_API_URL', 'https://out.caudals.com').rstrip('/')

def token():
    credential = os.environ.get('WARMBLY_TOKEN') or os.environ.get('WARMBLY_API_KEY')
    if credential:
        return credential
    result = subprocess.run(['warmbly', 'auth', 'token', '--host', os.environ.get('WARMBLY_HOST', 'out.caudals.com')], capture_output=True, text=True)
    if result.returncode:
        raise RuntimeError('Sign in first: warmbly auth login --hostname out.caudals.com --api-url https://out.caudals.com --web')
    return result.stdout.strip()

def request(path, method='GET', data=None):
    req = urllib.request.Request(BASE + '/v1/rocketreach' + path, method=method,
        data=None if data is None else json.dumps(data).encode(),
        headers={'Authorization': 'Bearer ' + token(), 'Content-Type': 'application/json', 'Accept': 'application/json', 'User-Agent': 'warmbly-rocketreach/1.0.0'})
    try:
        with urllib.request.urlopen(req, timeout=180) as response:
            return json.load(response)
    except urllib.error.HTTPError as error:
        try:
            payload = json.load(error)
        except (ValueError, OSError):
            payload = {'code': 'http_error', 'message': 'Plugin request failed.'}
        raise RuntimeError(json.dumps({'status': error.code, **payload})) from None

def json_arg(value):
    if value.startswith('@'):
        return json.loads(Path(value[1:]).read_text())
    return json.loads(value)

def mcp_stdio():
    for line in sys.stdin:
        identifier = None
        try:
            payload = json.loads(line)
            identifier = payload.get('id')
            if identifier is None:
                continue
            if payload.get('method') == 'initialize':
                response = {'jsonrpc': '2.0', 'id': identifier, 'result': {'protocolVersion': '2025-03-26', 'capabilities': {'tools': {}}, 'serverInfo': {'name': 'warmbly-rocketreach', 'version': '1.0.0'}}}
            elif payload.get('method') == 'tools/list':
                response = {'jsonrpc': '2.0', 'id': identifier, 'result': {'tools': json.loads(Path(__file__).resolve().with_name('mcp-tools.json').read_text())}}
            elif payload.get('method') == 'ping':
                response = {'jsonrpc': '2.0', 'id': identifier, 'result': {}}
            else:
                response = request('/mcp', 'POST', payload)
        except Exception as error:
            response = {'jsonrpc': '2.0', 'id': identifier, 'error': {'code': -32000, 'message': str(error)}}
        sys.stdout.write(json.dumps(response) + '\n')
        sys.stdout.flush()

def main():
    parser = argparse.ArgumentParser(description='RocketReach search, enrichment, accounts and direct import into Warmbly. Outputs JSON.')
    subs = parser.add_subparsers(dest='command', required=True)
    for name in ('status', 'results', 'companies', 'history', 'receipts', 'jobs', 'saved-searches'):
        subs.add_parser(name)
    accounts = subs.add_parser('accounts')
    account_subs = accounts.add_subparsers(dest='action', required=True)
    account_subs.add_parser('list')
    add = account_subs.add_parser('add')
    add.add_argument('--name', required=True)
    add.add_argument('--key-file', required=True, help='Protected file holding the API key; use - to read stdin.')
    add.add_argument('--daily-budget', type=int, default=100)
    add.add_argument('--reserve', type=int, default=0)
    add.add_argument('--priority', type=int, default=100)
    add.add_argument('--api-mode', choices=['legacy','universal'], default='legacy')
    for name in ('refresh', 'usage', 'delete'):
        child = account_subs.add_parser(name); child.add_argument('id')
    update = account_subs.add_parser('update'); update.add_argument('id'); update.add_argument('--data', required=True)
    execute = subs.add_parser('execute')
    execute.add_argument('operation', choices=['people.search', 'companies.search', 'people.enrich', 'people.bulk-enrich', 'companies.enrich', 'companies.bulk-enrich', 'email.verify'])
    execute.add_argument('--params', default='{}', help='JSON or @file')
    execute.add_argument('--options', default='{}', help='JSON or @file')
    execute.add_argument('--account')
    execute.add_argument('--spend', action='store_true')
    execute.add_argument('--idempotency-key')
    execute.add_argument('--max-credits', type=int)
    execute.add_argument('--force', action='store_true')
    importing = subs.add_parser('import')
    importing.add_argument('--ids', required=True, help='Comma-separated stored RocketReach IDs')
    importing.add_argument('--idempotency-key', required=True)
    importing.add_argument('--subscribe-new', action='store_true')
    importing.add_argument('--include-unverified', action='store_true')
    importing.add_argument('--skip-existing', action='store_true')
    importing.add_argument('--field-map', default='{}')
    polling = subs.add_parser('poll'); polling.add_argument('id')
    raw = subs.add_parser('api'); raw.add_argument('method', choices=['GET', 'POST', 'PATCH', 'DELETE']); raw.add_argument('path'); raw.add_argument('--data', default='{}')
    subs.add_parser('mcp-stdio')
    args = parser.parse_args()
    if args.command == 'mcp-stdio':
        mcp_stdio(); return
    if args.command == 'accounts':
        if args.action == 'list': result = request('/accounts')
        elif args.action == 'add':
            secret = sys.stdin.read().strip() if args.key_file == '-' else Path(args.key_file).read_text().strip()
            result = request('/accounts', 'POST', {'name': args.name, 'api_key': secret, 'daily_budget': args.daily_budget, 'reserve': args.reserve, 'priority': args.priority, 'api_mode': args.api_mode})
        elif args.action == 'update': result = request('/accounts/' + args.id, 'PATCH', json_arg(args.data))
        elif args.action == 'delete': result = request('/accounts/' + args.id, 'DELETE')
        else: result = request('/accounts/' + args.id + '/' + args.action, 'POST', {})
    elif args.command == 'execute':
        result = request('/execute', 'POST', {'operation': args.operation, 'params': json_arg(args.params), 'options': json_arg(args.options), 'account_id': args.account, 'spend': args.spend, 'idempotency_key': args.idempotency_key, 'max_credits': args.max_credits, 'force': args.force})
    elif args.command == 'import':
        result = request('/import', 'POST', {'ids': [x.strip() for x in args.ids.split(',') if x.strip()], 'idempotency_key': args.idempotency_key, 'subscribe_new': args.subscribe_new, 'verified_only': not args.include_unverified, 'update_existing': not args.skip_existing, 'field_map': json_arg(args.field_map)})
    elif args.command == 'poll': result = request('/jobs/' + args.id + '/poll', 'POST', {})
    elif args.command == 'api': result = request(args.path, args.method, None if args.method == 'GET' else json_arg(args.data))
    else: result = request('/' + args.command)
    print(json.dumps(result, ensure_ascii=False, indent=2))

if __name__ == '__main__':
    try:
        main()
    except (RuntimeError, ValueError, OSError) as error:
        print(json.dumps({'error': str(error)}, ensure_ascii=False), file=sys.stderr)
        sys.exit(1)
