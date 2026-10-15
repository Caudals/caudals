# Caudals Slack

Workspace `caudalsespacio.slack.com` (Caudals, team `T0C9L6LPX3N`), set up 2026-10-15 for the two founders and their agents. This folder is the source of truth for its structure. Change the files here, then apply them with the scripts in `scripts/slack/`.

## Design

Few channels, one thread per topic, agents in the channels where their work is useful. Everything must keep working on the Free plan. The workspace has a Pro trial until 2026-11-13.

| Channel | Purpose | Members |
| --- | --- | --- |
| `#general` | Decisions, weekly plan, announcements; Hermes morning radar and Friday review. Canvas: **Caudals HQ** (how we work, decision log) | founders, caudals, Hermes |
| `#customers` | Evaluation requests from caudals.com, demo sign-ups, meetings, pilots; one thread per account | founders, caudals, Hermes |
| `#build` | PRs, deploys, bugs and code tasks for `Caudals/caudals` and `Caudals/ops` | founders, caudals, GitHub, Claude |
| `#growth` | Prospecting, outreach, LinkedIn/X drafts for approval, newsletter | founders, caudals, Hermes |
| `#agents` | Ask any agent; scheduled agent reports and agent failures. Canvas: **Agent playbook** | founders, caudals, Hermes, Claude |
| `#alerts` | Machine alerts only (infra, failed CI on main, failed jobs) | founders, caudals, GitHub |

`workspace.json` holds names, purposes, topics and bookmarks. `channels.json` is generated and maps keys to channel IDs for scripts and services. `canvases/<key>.md` is that channel's canvas: Free allows one per channel.

## Apps

The Free plan allows 10 apps. There are 6:

| App | ID | What it does |
| --- | --- | --- |
| caudals (ours) | `A0C9GQ2E9RQ` | Bot for system notifications and these scripts. Manifest: `manifests/caudals.json`; CLI project: `apps/caudals/` |
| Hermes (ours) | `A0C9JUK8XUZ` | Socket Mode bot for the DGX Hermes gateway on atlantic. Manifest: `manifests/hermes.json`; CLI project: `apps/hermes/` |
| Claude | `A08SF47R6P4` | Anthropic's app, paired with the Caudals Claude Team org. Claude Tag is **not launched**: it still needs Claude's GitHub App on the Caudals org and a monthly spend limit (founder decision) |
| GitHub | `A01BP7R4KNY` | `#build` gets PRs, reviews, releases, deployments and issues from `Caudals/caudals` and `Caudals/ops`, without commits. Mario's GitHub account is linked |
| Google Calendar | `ADZ494LHY` | Meeting reminders and "in a meeting" status. Each founder connects their own Google account from the app's Home tab |
| Instinct | `A0AB2JKV29L` | Third-party personal assistant, used in DMs |

## Tokens and where they live

Never put token values in the repo, chat or command output.

- Slack CLI login: `~/.slack/credentials.json` on the founder's Mac (`slack auth list`).
- caudals bot and user tokens: `~/.config/caudals/slack/caudals.env` (`CAUDALS_SLACK_BOT_TOKEN`, `CAUDALS_SLACK_USER_TOKEN`, mode 600). The scripts read this file or the same variables from the environment. The user token acts as Mario and is used only for channel administration.
- Hermes bot and app-level tokens: `~/.config/caudals/slack/hermes.env` on the Mac, and in the `# --- Slack (Caudals workspace) ---` block of `/home/caudals/dgx-spark/hermes/.env` on atlantic.
- To regenerate tokens, reinstall the app: `cd infra/slack/apps/<app> && slack app install -E deployed`. Then capture the tokens with the `apps.developerInstall` call described under Recreating from scratch.

## Scripts

```bash
node scripts/slack/configure-workspace.mjs --dry-run   # show what would change
node scripts/slack/configure-workspace.mjs             # apply workspace.json, refresh channels.json
node scripts/slack/sync-canvases.mjs [general agents]  # publish canvases/*.md as channel canvases
node scripts/slack/notify.mjs alerts "Disk at 92% on atlantic" [--thread TS] [--as "Monitor"]
```

The configure script is idempotent:

- It renames channels listed under `previous_names` and creates any that are missing.
- It sets purposes and topics. Write emoji as `:shortcode:`, because Slack stores them that way.
- It invites every full member plus the bot to each channel.
- It removes only bookmarks the bot added that have since been dropped from the file.
- It reports channels that are not in the file and leaves them alone, unless you pass `--archive-extras`.

`notify.mjs` is the way for agents, cron jobs and CI to post as the caudals bot. It prints the message `ts`, so follow-ups can go in that message's thread.

## Hermes in Slack

The existing gateway user service `hermes-gateway-220a4d0e` (`HERMES_HOME=/home/caudals/dgx-spark/hermes`) now also connects to Slack through Socket Mode. It thinks with `bluehawana/deepseek-v4-flash:iq2_m` on the DGX Spark. `scripts/slack/hermes-slack-setup.sh` is idempotent: it backs up `.env` and `config.yaml`, installs `slack-bolt`, writes the Slack variables and settings, and restarts the gateway gracefully.

- Only Mario (`U0C9EGUPU06`) and Alonso (`U0C9EHEHP38`) are allowed. Other users' DMs are ignored.
- It responds only in `#agents`, `#general`, `#customers` and `#growth`, and in DMs. In channels it needs an @mention; once it is in a thread, replies continue without one. In threads use `!new`, `!stop` and `!help`; outside threads use `/hermes`.
- The Slack toolset is `web, browser, vision, memory, session_search, todo, clarify, delegation`. It has no terminal, files, code execution, cron or skill editing on the production host. Cron jobs keep the full `hermes-cron` toolset.
- `allow_bots: mentions` lets the Claude and GitHub bots hand work to Hermes by mentioning it. `api_human_users` treats founders' user-token posts as human.
- Scheduled jobs (`hermes cron list`; prompts in `hermes/*.md`):
  - **Morning radar**, `30 8 * * 1-5` Europe/Madrid, to `#general`.
  - **Weekly review**, `0 17 * * 5`, to `#general`.
  - **Infra watchdog**, every 5 minutes, to `#alerts`. It runs without an LLM (`--no-agent --script caudals_infra_watchdog.py`).

  Both send failures to `#agents` and run with `--continuity`. The `caudals-strategic-prospecting` job is unchanged and delivers `local`.
- To change a prompt, edit `hermes/<job>.md`, then on atlantic `hermes cron edit <id>` (or remove and recreate it), with `HERMES_HOME=/home/caudals/dgx-spark/hermes`.

## #alerts

Two sources post here; successful runs and healthy checks stay silent.

- **Infra watchdog** (`hermes/caudals_infra_watchdog.py`, installed as `$HERMES_HOME/scripts/caudals_infra_watchdog.py` on atlantic).
  - Checks Swarm replicas, disk (≥90%), free memory (<400 MiB), the `dgxspark` tunnel and DGX Ollama, plus five public endpoints, including two on arctic.
  - Posts a problem once it has failed two checks in a row, and posts again when it clears. State is kept in `$HERMES_HOME/cron/caudals_infra_watchdog.json`.
  - Run `python3 caudals_infra_watchdog.py --dry-run` on atlantic to see the current results without changing state.
- **Failed CI on main**: `.github/workflows/slack-alerts.yml` exists in both repos and fires on `workflow_run` with a `failure` conclusion. It posts with the repository secret `SLACK_BOT_TOKEN`; without that secret it does nothing.

## caudals.com → #customers

`lib/notifications/slack.ts` posts each new `/contact` evaluation request to `#customers` once the response has been sent. The post carries the company, system, sector, stage and offer, plus a link to Ops; the requester's name, email and notes stay in the notification email and Ops. It is off until both production credentials exist:

```bash
sudo scripts/set-app-credentials.sh SLACK_BOT_TOKEN          # caudals bot token
sudo scripts/set-app-credentials.sh SLACK_CUSTOMERS_CHANNEL_ID   # C0C9GQSPNSE
```

After setting them, redeploy the app stack.

## Claude Code and other local agents

- Each founder runs `claude plugin install slack` once, then authorizes it in `/mcp`. It uses the Claude app's client, which is already installed, and gives Claude Code search, read, post and canvas tools as that founder.
- Without the plugin, use `node scripts/slack/notify.mjs` to post as the bot.

## Free plan limits that shape this design

- 90 days of visible history. Durable decisions go in the HQ canvas, the repo docs or Ops.
- No Workflow Builder, Lists, custom sidebar sections or user groups. Hermes cron and the scripts above replace workflows.
- One canvas per channel. Huddles are 1:1 only.
- Posting can be restricted only in `#general`, so `#alerts` relies on its convention.

## Recreating from scratch

1. Install the CLI and log in: `brew install --cask slack-cli`, then `slack login`. Run the `/slackauthticket` command it prints in Slack and approve.
2. Create each app: call `apps.manifest.create` with the CLI token and the manifest. Install it with `apps.developerInstall`, passing `bot_scopes` and `user_scopes` from the manifest. That response contains the bot, user and (for Socket Mode apps) app-level tokens. Write them straight to the env files above.
3. Apply the layout with `configure-workspace.mjs` and `sync-canvases.mjs`.
4. Connect Hermes on atlantic:

   ```bash
   ssh caudals@atlantic 'bash -s' < <(cat ~/.config/caudals/slack/hermes.env; cat scripts/slack/hermes-slack-setup.sh)
   ```

   Then invite Hermes to its four channels.
5. Install Claude, GitHub and Google Calendar from the Marketplace.
   - Install GitHub's `slack` GitHub App on `Caudals/caudals` and `Caudals/ops`. It asks for a passkey.
   - In `#build`, run `/github subscribe Caudals/caudals pulls reviews releases deployments issues`, then the same for `Caudals/ops`.
6. Set `SLACK_BOT_TOKEN` as a repository secret in both repos:

   ```bash
   gh secret set SLACK_BOT_TOKEN -R Caudals/<repo>
   ```

   Pipe the value in from the env file.
