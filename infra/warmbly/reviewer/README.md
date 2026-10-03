# Campaign email reviewer

Integrated dashboard extension for Warmbly v0.6.20. It adds **Review emails** to
every campaign, alongside Leads and Steps. The production dashboard retains
the Apollo and RocketReach extensions.

## Operator workflow

Select a lead, choose First email / Follow-up 1 / Follow-up 2, and edit the full
message in the multiline composer. The sender signature is separate and added
automatically. **Preview** uses Warmbly's real send renderer, including the
campaign footer and sender identity. **Save changes** changes this lead only.
**Review & next** saves if necessary, records a content-specific review, and
advances through the sequence and then the leads. Search and Needs review only
help work through the cohort. Previous/next arrows switch leads; narrow screens
use a compact lead picker. The save bar stays visible while scrolling. Inputs,
checkboxes, select menus and discard dialogs reuse Warmbly dashboard primitives.
Typography, slate surfaces and sky accents follow the surrounding campaign UI. **Use original** stages a return to the original
shared template; Save changes applies it.

No launch or send action is part of this extension. Review status is an operator
checklist, not a server-enforced launch gate. Existing launch controls remain
unchanged. Already sent messages are read-only. Campaigns must be draft or
paused. The first version supports plain-text steps without active A/B variants.

## Storage and sending contract

Original Greeting, Hook, PilotFocus and FollowupIdea fields remain intact. Normal
campaign copy remains the fallback. When an operator saves an individually edited
message, the extension adds an idempotent Go-template condition around that
step's original body (and the opening subject):

```text
{{if .CaudalsBodySTEPID}}{{.CaudalsBodySTEPID}}{{else}}original body{{end}}
```

The body and review UUID suffixes omit hyphens. Subject keys use `CS` followed
by the full UUID encoded in base 36, and a compact `with` template, to fit
Warmbly's 100-byte subject-template limit. Longer shared subjects must be
shortened in Steps before enabling individual edits. The selected contact receives only that step's
body/subject override, saved with actual newline characters through the existing
PATCH /contacts/:id API. Follow-ups retain their inherited conversation subject.
The renderer inserts the override as data; it does not execute it recursively.
Native custom-field single-line controls must not be used to edit these bodies.
The reviewer disables automatic HTML synchronization when enabling per-lead
copy in a text-only campaign, so subsequent saves stay editable.

CaudalsReviewedSTEPID holds JSON with a SHA-256 content version and timestamp.
Relevant template, personalization, recipient, signature or sending-setting
changes invalidate the review. Changes to another step's body/review do not.
Fields travel with Warmbly's ordinary workspace exports and existing audit.

The extension uses only Warmbly's existing authenticated client and APIs. It
introduces no provider credentials, sidecar, database migration or public data
endpoint. It checks campaign status, membership, contact/template revision,
sender signature and A/B variants before saving. These are optimistic checks;
the upstream API has no atomic revision precondition. Do not edit the same lead
concurrently in multiple windows. Unsaved navigation and reload are guarded.

## Build and deploy

Reapply Apollo and RocketReach patches, then this patch to the matching release
source. Preserve `/opt/warmbly/web-image.txt` so future stack regeneration retains
the customized dashboard. Upstream upgrades require rebuilding these extensions
against the matching source and image; never pair an old dashboard with a new API.

```sh
python3 patch-web.py /path/to/warmbly-v0.6.17
# In the matching source web/:
pnpm typecheck
pnpm lint
pnpm exec vitest run src/components/app/campaigns/reviewer/reviewModel.test.ts
pnpm build
# Copy this folder and dist/ to the VPS, then:
sudo docker build -t caudals-warmbly-web:reviewer-1.1.0 -f web.Dockerfile .
sudo docker service update --image caudals-warmbly-web:reviewer-1.1.0 --no-resolve-image caudals-warmbly_web
```

Production entry points:

- [Spanish campaign review](https://out.caudals.com/app/campaigns/137bff9a-6e3a-4c16-8d6a-cc45eaa97c2c/review)
- [English campaign review](https://out.caudals.com/app/campaigns/2659416f-019d-4f11-ad43-ef96d1a5307f/review)
