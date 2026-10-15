#!/usr/bin/env bash
# Connects the DGX Hermes gateway on atlantic to the Caudals Slack workspace.
# Run from a founder's Mac; the tokens are piped over SSH and never printed:
#   ssh caudals@atlantic 'bash -s' < <(cat ~/.config/caudals/slack/hermes.env; \
#     cat scripts/slack/hermes-slack-setup.sh)
# stdin = the SLACK_BOT_TOKEN/SLACK_APP_TOKEN lines, then this file.
# Idempotent: re-running replaces the SLACK_* block and re-applies config.
set -euo pipefail

H=/home/caudals/dgx-spark/hermes
V=$H/hermes-agent/venv/bin
export PATH=$HOME/.local/bin:$PATH HERMES_HOME=$H
STAMP=$(date +%Y%m%d-%H%M%S)

# Caudals workspace IDs (infra/slack/channels.json)
MARIO=U0C9EGUPU06 ALONSO=U0C9EHEHP38
AGENTS=C0C9JDD8SUR GENERAL=C0C9JCUFJRF CUSTOMERS=C0C9GQSPNSE GROWTH=C0C9A8XN9H9

: "${SLACK_BOT_TOKEN:?missing}" "${SLACK_APP_TOKEN:?missing}"

# The venv has no pip; Hermes manages it with uv (pins from hermes-agent's [slack] extra).
UV=$(command -v uv || echo "$H/bin/uv")
"$V/python" -c 'import slack_bolt' 2>/dev/null ||
  VIRTUAL_ENV=$H/hermes-agent/venv "$UV" pip install --quiet --python "$V/python" \
    "slack-bolt==1.30.0" "slack-sdk==3.43.0"
"$V/python" -c 'import slack_bolt, slack_sdk'

cp -p "$H/.env" "$H/.env.bak-before-slack-$STAMP"
cp -p "$H/config.yaml" "$H/config.yaml.bak-before-slack-$STAMP"

umask 077
sed -i '/^# --- Slack (Caudals workspace) ---$/,/^# --- end Slack ---$/d' "$H/.env"
cat >> "$H/.env" <<EOF
# --- Slack (Caudals workspace) ---
SLACK_BOT_TOKEN=$SLACK_BOT_TOKEN
SLACK_APP_TOKEN=$SLACK_APP_TOKEN
SLACK_ALLOWED_USERS=$MARIO,$ALONSO
SLACK_ALLOWED_CHANNELS=$AGENTS,$GENERAL,$CUSTOMERS,$GROWTH
SLACK_HOME_CHANNEL=$AGENTS
SLACK_HOME_CHANNEL_NAME=agents
# --- end Slack ---
EOF
chmod 600 "$H/.env"

# Slack sessions get research tools only: no terminal, files, code execution,
# cron or skill editing on the production host. Cron jobs keep hermes-cron.
"$V/python" - "$H/config.yaml" <<'PY'
import sys, yaml
path = sys.argv[1]
config = yaml.safe_load(open(path))
config["timezone"] = "Europe/Madrid"
config.setdefault("platform_toolsets", {})["slack"] = [
    "web", "browser", "vision", "memory", "session_search", "todo", "clarify", "delegation",
]
slack = config.setdefault("slack", {})
slack.update({
    "require_mention": True,
    "thread_require_mention": False,
    "unauthorized_dm_behavior": "ignore",
})
extra = config.setdefault("platforms", {}).setdefault("slack", {}).setdefault("extra", {})
extra.update({
    "reply_in_thread": True,
    "unfurl_links": False,
    "unfurl_media": False,
    "rich_blocks": True,
    "allow_bots": "mentions",
    "api_human_users": ["U0C9EGUPU06", "U0C9EHEHP38"],
})
cron = config.setdefault("cron", {})
cron["wrap_response"] = False
yaml.safe_dump(config, open(path, "w"), sort_keys=False, allow_unicode=True)
PY

hermes gateway restart
sleep 20
hermes gateway status 2>&1 | tail -n 15
