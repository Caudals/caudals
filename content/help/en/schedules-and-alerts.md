---
title: Schedules and regression alerts
summary: Re-run an approved test set weekly or monthly, see what it costs, and get an alert when answers get worse than in the previous run.
keywords: [schedule, scheduled runs, monitoring, recurring, monthly, weekly, daily, regression, alert, compare, run again, skipped, webhook, notification, slack, teams, email, ci, pipeline, github actions, release gate, threshold, api token]
related: [prepare-and-run, reading-results, getting-help]
owner: engineering
reviewed: 2026-10-14
review_by: 2027-01-14
---

A schedule runs the same frozen test set again at a fixed time, so you can see whether a change to your assistant, its model or its documents made answers worse.

## Create a schedule {#create}

Schedules are in **Settings → Monitoring**, under **Scheduled runs**. Owners can create them for evaluations with an approved test set. Scheduling is part of pay as you go and of managed plans, not of the free plan.

1. Choose **New schedule**.
2. Pick the evaluation and the system to test.
3. Set the cadence, the day, the local time and the time zone. Workspaces that pay with credits schedule **Weekly** or **Monthly**; managed plans can also run **Daily**.
4. With credits, the dialog shows the **estimate**: credits per run and per month. Owners can set a **Credit limit per month**, the most the schedule's runs may use in a calendar month. On a managed plan you set a **Maximum run spend** instead.
5. Optionally set a **Maximum source age (days)**. When your sources are older than that, the scheduled run is skipped instead of testing against stale material.

Each schedule can be paused and resumed. When a newer approved test set exists, **Use the approved test set** switches the schedule to it. Owners change a schedule's credit limit from its menu.

## When a scheduled run is skipped {#skipped}

Before each scheduled run starts, Caudals checks that the balance covers its estimate and that it stays within the schedule's limit and your workspace's limits. If not, that run is skipped, nothing is charged, and owners get an alert in the app and by email with what to do before the next run: add credits or raise the limit. The schedule itself stays active. Runs are charged like any other run: only for completed work.

## How outcomes are judged {#outcomes}

Each scheduled run is compared, question by question, with the previous completed run of the same schedule:

- **Pass**: no question got worse.
- **Regression**: at least one question got a worse label than before, for example correct before and incorrect now.
- **Inconclusive**: the runs cannot be compared fairly, for example on the first run, when fewer than 90% of the tests were scored, or when as many questions improved as got worse.
- **Unknown**: the run failed or was cancelled.

Runs on a different test set (or with a different rubric, grader or connection settings) are **not comparable**: their scores are never set side by side, and no regression alert is sent.

## Where alerts appear {#alerts}

Outcomes are listed under **Monitoring outcomes**, with the score against last time, and appear in the notification centre with the questions that got worse. A regression is also emailed to everyone in the workspace who keeps **Regressions** on in **Settings → Notifications**: the score this time and last time, and up to five newly broken questions, each linking to its answer. To send outcomes to a team channel or your own systems, add a destination in **Settings → Developers** (below).

## Slack, Teams and email {#destinations}

In **Settings → Developers → Alert destinations**, owners choose **Add destination** and pick a type:

- **Slack**: in Slack, add the Incoming Webhooks app to the channel and paste the webhook URL it gives you (`https://hooks.slack.com/services/…`).
- **Microsoft Teams**: in Teams, create a workflow from the template “Post to a channel when a webhook request is received” and paste its URL.
- **Email**: a team member's address, or an address on your team's company domain such as a shared alerts inbox.
- **Signed webhook**: a JSON event signed with HMAC for your own systems; the API reference shows how to verify it.

Choose whether to hear about **regressions and runs that could not finish** or **every scheduled run**, and the language of the messages. Slack, Teams and email receive a readable message: the score against last time, up to five questions that got worse with links to their answers, and a link to the report. **Send test** sends an example, clearly labelled, so you can check that it arrives; the result is shown on the destination. Webhook URLs and addresses are stored encrypted, only public internet addresses are accepted, and a deleted destination stops at once.

## Gate releases from your pipeline {#ci}

A deployment pipeline can run your approved test set before each release and stop the release when answers get worse:

1. In **Settings → Developers**, create a token with **CI pipeline: start runs and read their results**. Choose a short expiry and keep it as a secret in your CI.
2. Under **Release gate**, set the **pass threshold**: the share of scored answers that must pass for the test set. A schedule can set its own in its menu, which replaces the test set's for its runs.
3. Your pipeline starts a run with the test set version and system version shown there and an `Idempotency-Key`, then asks the gate until it answers **pass**, **fail** or **unknown** (the run could not give a result). The API reference has a curl example and a GitHub Actions workflow.

Runs started this way count like any other run: the estimate, your credit limits and your plan apply, and each key starts one run however many times it is retried.

## Run again and compare {#compare}

On an evaluation's results, **Run again** runs the same approved test set again (with its estimate first when your workspace pays with credits). When the new run finishes, the comparison with the previous run opens on its own: improved, regressed and unchanged questions, each opening its answer. **Compare** lets you pick another earlier run. In a report, **Re-run these questions** on a fix does the same and lists that fix's questions first.
