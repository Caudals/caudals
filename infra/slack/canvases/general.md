# Caudals HQ

How the two of us and our agents use this Slack. Few channels, one thread per topic, decisions written down. Source of truth: `infra/slack/` in the caudals repo; change it there and run `node scripts/slack/configure-workspace.mjs` and `node scripts/slack/sync-canvases.mjs`.

## Set up your side (5 minutes)

- [ ] **Google Calendar**: Apps → Google Calendar → Home → connect your caudals.com account. You get meeting reminders and an automatic "in a meeting" status.
- [ ] **Claude**: Apps → Claude → Home → connect your Claude account, so you can DM Claude.
- [ ] **Hermes**: try `@Hermes brief [company]` in #agents, or DM Hermes.
- [ ] **Claude Code**: run `claude plugin install slack` once, then authorize Slack in `/mcp`. Your coding agents can then read and post here.
- [ ] **Notifications**: mute #alerts and #build, and keep #general, #customers and DMs on. Install the Slack mobile app.

## Channels

- **#general**: decisions, weekly plan, announcements. Hermes posts the morning radar here.
- **#customers**: evaluation requests, demo sign-ups, meetings and pilots. One thread per account.
- **#build**: PRs, deploys, bugs and code tasks for Caudals/caudals and Caudals/ops.
- **#growth**: prospecting, outreach, LinkedIn/X drafts, newsletter. A draft needs a ✅ from the other founder before it is scheduled.
- **#agents**: ask any agent anything, scheduled agent reports, agent failures.
- **#alerts**: machine alerts only. 👀 = looking, ✅ = resolved. Discuss fixes in #build.

DMs are for private work with your own agents.

## Agents

- **@Hermes**: our agent on atlantic, thinking on the DGX Spark. Mention it in #agents, #general, #customers or #growth, or DM it. It replies in a thread; keep replying in that thread to continue without mentioning it again. Research, company and person briefs, meeting prep, drafts. From Slack it has web, browser, memory and delegation, but no shell, files or code on the server. In threads use `!new`, `!stop` or `!help`.
- **@Claude**: Anthropic's Claude app. Connect your own Claude account from its App Home to DM it. Channel work (Claude Tag) is installed but not launched: it needs Claude's GitHub app and a monthly spend limit.
- **Instinct**: personal assistant in your DMs.
- **Claude Code and Codex in our repos**: they post with `node scripts/slack/notify.mjs <channel> "text"` and read Slack through the Slack MCP.
- **caudals** bot: system notifications (contact form, demo sign-ups, infra, CI) and the setup scripts.

## Conventions

- One topic, one thread. Start a thread with a one-line title.
- Reactions are status: 👀 looking, ✅ done, ❌ won't do, 🙋 needs the other founder.
- Decisions: post in #general starting with **DECISION:**, then add a line to the log below.
- Agent output is a draft until a founder acts on it.
- Never paste secrets, credentials, customer documents or personal data into Slack. Company names and public facts are fine.
- The Free plan keeps 90 days of history. Anything worth keeping goes to the repo docs, Ops or this canvas.

## Rituals

- Monday to Friday, 08:30: Hermes morning radar in #general. Discuss in its thread.
- Friday, 17:00: weekly review thread in #general. Wins, numbers, and next week's three priorities.

## Decision log

- 2026-10-15: Slack set up with six channels, Hermes, Claude, GitHub and Google Calendar. (Mario)

## Links

- [caudals.com](https://caudals.com)
- [Caudals Ops](https://ops.caudals.com)
- [Evaluation ops](https://app.caudals.com/ops)
- [Caudals/caudals](https://github.com/Caudals/caudals) and [Caudals/ops](https://github.com/Caudals/ops) (the Ops/leads repo)
