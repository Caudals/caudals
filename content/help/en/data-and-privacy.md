---
title: How we handle your data
summary: Where your data is stored, which models read it, how credentials are protected, how long things are kept and how to delete a workspace.
keywords: [data, privacy, gdpr, security, hosting, germany, encryption, credentials, retention, export, zip, delete, deletion, dpa, sub-processors, model, adversarial]
related: [team-and-roles, reports-and-sharing, connect-api]
owner: founder
reviewed: 2026-10-12
review_by: 2027-01-12
---

## Where it is stored {#hosting}

The application, database, file storage and backups run on servers Caudals operates at Hetzner, in Germany. The database and file storage are not reachable from the public internet.

## Which models read it {#models}

By default, test questions are written and answers graded by an AI model that runs on Caudals' own GPU server. Your content goes to a commercial AI provider only if your workspace chooses one. Free workspaces use only Caudals' own models.

## Credentials and logins {#credentials}

API keys and tokens are write-only: Caudals encrypts them, uses them only to call your system and never shows them again. A login you save in the live browser is stored encrypted and stays until you revoke it; Caudals never receives your password.

## What Caudals asks your system {#questions}

Caudals asks only the ordinary questions in your test set. It never runs adversarial tests, such as prompt injection or jailbreak attempts, without your written authorisation.

## How long data is kept {#retention}

- Workspace content (sources, test sets, runs and reports) is kept while the workspace exists. An owner can choose to keep the answers from test runs for 30, 90 or 365 days instead, in **Settings → Data**; answers behind a report you keep stay with that report.
- Screenshots from failed website checks are deleted after seven days.
- Free test results on caudals.com are deleted after seven days.
- Backups expire after about a week.

## Export your data {#export}

Owners can download everything in **Settings → Data** with **Export all workspace data**: one ZIP file with every report you keep (to read in a browser, plus JSON and CSV), the evidence behind each one, every test set, and every test run's questions, answers and grades. It is prepared in the background; the download works for seven days, then the file is deleted.

## Shared reports {#sharing}

You decide what leaves the workspace. Shared links expire, and an owner can revoke them at any time; see [Reports, exports and sharing](help:reports-and-sharing#revoke). A copy someone already downloaded cannot be recalled.

## Delete a workspace {#delete}

Owners can delete the workspace in **Settings → Danger zone** with **Delete workspace data**. You give a reason and type the workspace name to confirm. Deletion revokes every share and credential at once, stops running evaluations, withdraws reports and deletes stored files. It cannot be undone, and access stops immediately for every member. The workspace is closed for good and a record of the deletion is kept; to have every remaining record erased, write to privacy@caudals.com. Encrypted backups expire on their normal schedule, about a week.

## Legal documents {#legal}

The [data processing agreement](https://caudals.com/en/legal/dpa) applies to every workspace without a signature; a signed copy is available on request. See also the [sub-processors](https://caudals.com/en/legal/subprocessors) and [security](https://caudals.com/en/legal/security) pages. For privacy requests, write to privacy@caudals.com.
