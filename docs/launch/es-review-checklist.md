# Spanish review checklist (launch L-23, spec P-45)

A native Castilian Spanish speaker reviews the ten core screens below before the public launch (spec §1, criterion 6; founder action in `PROGRESS.md` §5). Engineering already guarantees that no English interface text reaches a Spanish screen (lint rule, parity checks, the harness scanner and the production walk-through recorded in `L-23.md`). This review is about **quality**: whether the Spanish reads as if it had been written in Spanish.

Allow about 90 minutes. Record every finding in the table at the end (screen, the text as shown, the proposed text). An agent then changes the catalogues: `lib/i18n/messages/es.json` (public site and demo), `lib/evals/messages/es.ts` (app), `lib/evals/messages/phrases.ts` (status labels), `lib/email/copy.ts` (emails) and `lib/evals/reports/*-copy.ts` and `i18n.ts` (PDF/Word).

## How to open each screen in Spanish

- Public pages: `https://caudals.com/es/…`.
- App: sign in at `https://app.caudals.com/workspace/sign-in`, then choose **Español (España)** under Language in the account menu (the choice is saved and the page reloads). A browser set to Spanish opens the app in Spanish on the first visit.
- Screens that need data (evaluation page, report, billing) are easiest on an internal workspace that already has a report, or on the example at `app.caudals.com/workspace/example`. Billing and usage is visible only in workspaces where billing is open (before Gate B, an internal test workspace; ask an agent to open one). The UI harness also renders every screen in Spanish with fixtures: `npx playwright test --config=e2e/evals/ui.config.ts spanish.contract.ts` saves screenshots under `/tmp/evals-ui-test-results/spanish/`.
- Check each screen at phone width (390 px) and on a laptop (1440 px).

## What to check on every screen

1. **Tone and address.** The interface speaks to the reader as *tú* (never *usted*, never *vosotros* except where the copy addresses a team). Plain, precise, no hype, no exclamation marks in the app.
2. **Terminology.** The same word for the same thing everywhere:

   | English | Spanish |
   | --- | --- |
   | workspace | espacio de trabajo |
   | test set | conjunto de pruebas |
   | evaluation | evaluación |
   | run | ejecución |
   | report | informe |
   | reference material / sources | material de referencia / fuentes |
   | assistant | asistente |
   | readout | presentación de resultados |
   | credits | créditos |
   | top-up | recarga |
   | pay as you go | pago por uso |
   | free plan | plan gratuito |
   | expert review | revisión experta |
   | pass / partial / fail | superada / parcial / fallida |

3. **Formats.** Numbers `1.234,5`; percentages `80 %` (with a space); money `121,00 €` (symbol after, with a space); dates `12 de octubre de 2026` or `12 oct 2026`; times in 24 hours.
4. **No English left.** Buttons, menus, tooltips, empty states, error messages, screen-reader labels (a screen reader or the browser's accessibility inspector shows them) and the page title in the browser tab. Product and brand names stay as they are (Caudals, OpenAI, DGX Spark, API, CSV, PDF).
5. **Fit.** Spanish runs about 20 % longer: no button text cut off, no label wrapping into the next field, no horizontal scroll at 390 px.
6. **Claims.** Nothing says *certificado*, *certificación*, *cumplimiento*, *conforme a la Ley de IA* or similar: Caudals reports evidence, not compliance.
7. **Gender and agreement.** Labels shared by several things (states such as *Aprobado*, *Pendiente*, *Rechazado*) read naturally where they appear.

## The ten screens

| # | Screen | Where | Check in particular |
| --- | --- | --- | --- |
| 1 | Landing | `caudals.com/es` | Hero promise and subtitle, the four steps, FAQ answers, the pilot and demo calls to action, footer (Confianza, legal links), cookie banner |
| 2 | Demo · start | `caudals.com/es/demo` | The field label and help ("Tu asistente"), the examples of what to paste, the queue and capacity notices, the backup-model disclosure, the consent line |
| 3 | Demo · live | the same page after starting a test (use one of our own sites) | Phase names (reading pages, finding the chat, asking, grading), the time estimate, the "email me" form and its confirmation |
| 4 | Demo · report | the end of the live page | Score sentence, verdict marks (Correcta, Parcial, Incorrecta…), the likely-cause hypotheses, the AI-disclosure note, the account card, "Enviar a un colega" and its limits |
| 5 | Sign-up | `app.caudals.com/workspace/start` and the account card on the demo report | The work-email rules (free mail refused), the terms and privacy line, the emailed link and its email ("Termina de crear tu cuenta de Caudals") |
| 6 | Sign-in | `app.caudals.com/workspace/sign-in` | Error messages (wrong password, unverified email), "Recuperar cuenta" and the reset page, the password-reset email, two-factor prompts |
| 7 | Evaluations list | `app.caudals.com/workspace/evaluations` (and Inicio, `/workspace/home`) | Stage pills (Lista para ejecutar, Preparando pruebas…), next-step lines, empty states, the onboarding checklist |
| 8 | Evaluation page | any evaluation | The four steps (Conectar · Preparar pruebas · Ejecutar · Resultados), connection help, document intake ("Lo que hemos entendido de tu asistente"), test-set review and spot check, the run estimate dialog, paused-run states |
| 9 | Report | any report, plus its PDF and Word downloads and the shared link (`/share`) | Executive summary sentences, "Corrige esto primero", hypotheses labelled as such, methodology wording, the PDF cover and "Página n de N", the Word document, the share dialog |
| 10 | Billing | Ajustes → Facturación y uso (and the top-up page) | Packs, IVA lines, balance and allowance wording, limits and alerts, invoices list, the receipt and low-balance emails |

Also worth a glance if time allows: Ajustes → Notificaciones and the lifecycle emails (`tests/email/__snapshots__/templates.test.ts.snap` has every email in Spanish), the help centre (`/workspace/help`) and the legal pages (`caudals.com/es/legal/…`), which the lawyer reviews separately.

## Findings

| # | Screen | Text as shown | Proposed text | Status |
| --- | --- | --- | --- | --- |
| 1 |  |  |  |  |

Reviewer: ______________________ Date: ____________ Screens covered: __ / 10
