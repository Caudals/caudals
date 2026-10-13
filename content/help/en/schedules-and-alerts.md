---
title: Schedules and regression alerts
summary: Re-run an approved test set daily, weekly or monthly, and get an alert when answers get worse than in the previous run.
keywords: [schedule, scheduled runs, monitoring, recurring, monthly, weekly, daily, regression, alert, compare, webhook, notification]
related: [prepare-and-run, reading-results, getting-help]
owner: engineering
reviewed: 2026-10-12
review_by: 2027-01-12
---

A schedule runs the same frozen test set again at a fixed time, so you can see whether a change to your assistant, its model or its documents made answers worse.

## Create a schedule {#create}

Schedules are in **Settings → Monitoring**, under **Scheduled runs**. Owners can create them for evaluations with an approved test set. Scheduling is enabled per workspace and is not part of the free plan.

1. Choose **New schedule**.
2. Pick the evaluation and the system to test.
3. Set the cadence (**Daily**, **Weekly** or **Monthly**), the day, the local time and the time zone.
4. Optionally set a **Maximum run spend** and a **Maximum source age (days)**. When your sources are older than that, the scheduled run is skipped instead of testing against stale material.

Each schedule can be paused and resumed. When a newer approved test set exists, **Use the approved test set** switches the schedule to it.

## How outcomes are judged {#outcomes}

Each scheduled run is compared, question by question, with the previous completed run of the same schedule:

- **Pass**: no question got worse.
- **Regression**: at least one question got a worse label than before, for example correct before and incorrect now.
- **Inconclusive**: the runs cannot be compared fairly, for example on the first run, when fewer than 90% of the tests were scored, or when as many questions improved as got worse.
- **Unknown**: the run failed or was cancelled.

## Where alerts appear {#alerts}

Outcomes are listed under **Monitoring outcomes** and appear in the notification centre. To send them to your own systems, add a signed webhook in **Settings → Developers**; see the API reference there.
