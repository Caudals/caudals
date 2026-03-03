# Task Validation Checklist Template

Use this checklist for each completed task (`Pxx-Tnn` or `Pxx-Tnn-Snn`) before marking it `DONE`.

## Metadata

- Task ID:
- Phase:
- Date (`YYYY-MM-DD`):
- Owner:

## Validation Commands

- [ ] `npm run typecheck`
- [ ] Targeted lint/tests for touched files
- [ ] Any required migration/schema verification (if applicable)

## Runtime Checks

- [ ] Route/feature loads without runtime console errors
- [ ] Critical user interaction(s) executed end-to-end
- [ ] No new failed network requests tied to the change

## UI Evidence (Frontend Tasks)

- [ ] Desktop screenshot captured
- [ ] Tablet screenshot captured
- [ ] Mobile screenshot captured
- [ ] Screenshot naming follows protocol in `docs/exec-plans/ui-verification-protocol.md`

## Risk Notes

- Known limitations/tradeoffs:
- Follow-up debt item required (`yes/no`):
- If yes, added to `docs/exec-plans/tech-debt-tracker.md`:

## Logging

- [ ] Changelog entry added in `docs/logs/changelog/`
- [ ] Validation entry added in `docs/logs/validations/`
