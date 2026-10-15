#!/usr/bin/env python3
"""Infra watchdog for Slack #alerts, run by Hermes cron on atlantic without an LLM.

Installed as $HERMES_HOME/scripts/caudals_infra_watchdog.py and scheduled with
`hermes cron create "every 5m" --no-agent --script caudals_infra_watchdog.py
--deliver slack:C0C9JTHN30R`. Hermes delivers stdout verbatim; empty stdout is
silent. A problem is reported once it fails two checks in a row, and again
when it clears, so a persistent issue is never re-posted every tick.

`--dry-run` prints every check's current result and leaves state untouched.
"""
from __future__ import annotations

import json
import os
import shutil
import subprocess
import sys
import time
import urllib.error
import urllib.request

HERMES_HOME = os.environ.get("HERMES_HOME", os.path.expanduser("~/dgx-spark/hermes"))
STATE_PATH = os.path.join(HERMES_HOME, "cron", "caudals_infra_watchdog.json")
CONFIRM_AFTER = 2  # consecutive failing checks before alerting

DISK_PERCENT = 90
MEMORY_MIB = 400
DGX_URL = "http://192.168.70.19:11434/api/tags"
ENDPOINTS = {
    "caudals.com": "https://caudals.com/en",
    "app.caudals.com": "https://app.caudals.com/login",
    "ops.caudals.com": "https://ops.caudals.com/livez",
    "out.caudals.com (Warmbly, arctic)": "https://out.caudals.com",
    "postiz.caudals.com (arctic)": "https://postiz.caudals.com",
}


def http_problem(url: str, timeout: float = 10) -> str | None:
    request = urllib.request.Request(url, headers={"User-Agent": "caudals-watchdog/1"})
    try:
        with urllib.request.urlopen(request, timeout=timeout) as response:
            status = response.status
    except urllib.error.HTTPError as error:
        status = error.code
    except Exception as error:  # DNS, TLS, timeout, refused
        return f"unreachable ({type(error).__name__})"
    return f"HTTP {status}" if status >= 500 else None


def check_services() -> dict[str, str]:
    try:
        output = subprocess.run(
            ["sudo", "-n", "docker", "service", "ls", "--format", "{{.Name}} {{.Replicas}}"],
            capture_output=True, text=True, timeout=30, check=True,
        ).stdout
    except Exception as error:
        return {"swarm": f"`docker service ls` failed ({type(error).__name__})"}
    problems = {}
    for line in output.splitlines():
        name, _, replicas = line.partition(" ")
        running, _, desired = replicas.split(" ")[0].partition("/")
        if running.isdigit() and desired.isdigit() and int(running) < int(desired):
            problems[f"service:{name}"] = f"Swarm service `{name}` at {running}/{desired} replicas"
    return problems


def check_host() -> dict[str, str]:
    problems = {}
    usage = shutil.disk_usage("/")
    percent = round(usage.used * 100 / usage.total)
    if percent >= DISK_PERCENT:
        problems["disk:/"] = f"Disk `/` at {percent}% ({usage.free // 2**30} GiB free)"
    with open("/proc/meminfo") as meminfo:
        fields = dict(line.split(":", 1) for line in meminfo)
    available = int(fields["MemAvailable"].split()[0]) // 1024
    if available < MEMORY_MIB:
        problems["memory"] = f"Only {available} MiB of memory available"
    return problems


def check_dgx() -> dict[str, str]:
    if not os.path.exists("/sys/class/net/dgxspark"):
        return {"dgx:tunnel": "DGX WireGuard tunnel `dgxspark` is down; run `~/dgx-spark/scripts/tunnel-up`"}
    problem = http_problem(DGX_URL, timeout=8)
    return {"dgx:ollama": f"DGX Ollama {problem}"} if problem else {}


def check_endpoints() -> dict[str, str]:
    problems = {}
    for label, url in ENDPOINTS.items():
        problem = http_problem(url)
        if problem:
            problems[f"http:{label}"] = f"{label} {problem}"
    return problems


def current_problems() -> dict[str, str]:
    problems: dict[str, str] = {}
    for check in (check_services, check_host, check_dgx, check_endpoints):
        try:
            problems.update(check())
        except Exception as error:  # a broken check must not hide the others
            problems[f"check:{check.__name__}"] = f"Watchdog check `{check.__name__}` crashed ({type(error).__name__})"
    return problems


def minutes_since(timestamp: float) -> int:
    return max(1, round((time.time() - timestamp) / 60))


def main() -> int:
    problems = current_problems()
    if "--dry-run" in sys.argv:
        print(json.dumps(problems, indent=2) if problems else "all checks passing")
        return 0

    try:
        with open(STATE_PATH) as handle:
            state = json.load(handle)
    except (FileNotFoundError, json.JSONDecodeError):
        state = {}

    now = time.time()
    opened, resolved = [], []
    for key, message in problems.items():
        entry = state.get(key, {"since": now, "count": 0, "alerted": False})
        entry.update(count=entry["count"] + 1, message=message)
        if entry["count"] >= CONFIRM_AFTER and not entry["alerted"]:
            entry["alerted"] = True
            opened.append(message)
        state[key] = entry
    for key in [key for key in state if key not in problems]:
        entry = state.pop(key)
        if entry.get("alerted"):
            resolved.append(f"{entry['message']} (after {minutes_since(entry['since'])} min)")

    os.makedirs(os.path.dirname(STATE_PATH), exist_ok=True)
    with open(STATE_PATH, "w") as handle:
        json.dump(state, handle)

    lines = [f":red_circle: {message}" for message in opened]
    lines += [f":white_check_mark: Resolved: {message}" for message in resolved]
    if lines:
        print("*atlantic watchdog*\n" + "\n".join(lines))
    return 0


if __name__ == "__main__":
    sys.exit(main())
