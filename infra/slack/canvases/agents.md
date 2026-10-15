# Agent playbook

Copy a prompt, fill the brackets, post it in the right channel. Agents answer in the thread; reply there to refine.

## Hermes prompts

- **Company brief** (#customers): `@Hermes brief [company]: what they sell, which AI assistants, chatbots or agents they run, who owns AI, recent news, and one concrete hook for a Caudals evaluation. Cite sources.`
- **Meeting prep** (#customers, in the account thread): `@Hermes prep my call with [name, role] at [company] on [date]: their background, likely priorities, three questions to ask, and what to avoid.`
- **Market watch** (#general): `@Hermes what changed this week on [AI Act / AI evaluation in Spain / competitor]? Five bullets with sources.`
- **Post draft** (#growth): `@Hermes draft a LinkedIn post in Spanish from this thread. Evidence first, no hype, under 150 words, no claims we can't source.`
- **Follow-up email** (#customers): `@Hermes draft a short follow-up to [name] after [meeting], in [language], proposing [next step].`
- **Schedule a recurring job**: ask in the repo with Claude Code or on atlantic with `hermes cron create`. Slack sessions cannot create cron jobs.

## Claude

- DM Claude for writing, analysis and files once you have connected your Claude account in its App Home.
- Code changes: open a Claude Code session in the repo and say "read the Slack thread [link]". When Claude Tag is launched, `@Claude` in #build will open PRs straight from the thread.

## Guardrails

- Agents draft; founders decide, send and publish.
- Never test a system adversarially (prompt injection, jailbreaks, prompt extraction) without its owner's written authorisation.
- Never say Caudals certifies AI systems or makes anyone AI Act compliant. We produce evidence.
- No secrets, credentials, customer documents or personal data in prompts.
- If an agent is wrong, say so in the thread. It keeps the context and the next answer improves.
