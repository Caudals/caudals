# Caudals Pivot Report

- Date: 2026-03-07
- Author: Codex
- Purpose: Evaluate Caudals' current marketplace thesis, assess current market demand in adjacent AI sectors, and recommend pivot options with concrete product and go-to-market changes.

## Executive Summary

Caudals' current product is a solid software foundation for an AI dataset marketplace, but the marketplace thesis is the weakest part of the business.

The main issue is not software execution. The issue is market structure:
- Caudals currently needs supply (`contributors`) and demand (`requesters`) to grow at the same time.
- The most valuable enterprise data is often private, regulated, or operationally sensitive.
- Buyers increasingly care less about "buying generic data" and more about safely improving model performance inside their own workflows.
- Fine-tuning and evaluation infrastructure are being rapidly commoditized by OpenAI, AWS, Google Cloud, and Microsoft, so a startup should not compete on generic customization plumbing alone.

My recommendation is to pivot Caudals away from a public two-sided dataset marketplace and toward a private, services-led `EvalOps + Model Customization` platform for companies deploying AI in real workflows.

The best near-term direction is:
1. `Primary recommendation`: turn Caudals into a private evaluation, human review, and model-customization control plane for enterprise AI teams.
2. `Short-term revenue motion`: sell a paid implementation/pilot service around eval design, review queues, and domain-specific fine-tuning.
3. `Medium-term productization`: narrow into one vertical workflow where the ROI is obvious and the data is already inside the customer's systems.

If you do this well, you remove the chicken-and-egg problem, rely on customer-owned data instead of public collection, preserve much of the current product and operations architecture, and give yourself a cleaner path to early revenue.

## What Caudals Is Today

Based on the current repo and product docs:
- Caudals is built as an `AI dataset operations platform` with three role surfaces: `requester`, `contributor`, and `admin`.
- The current north star is to help ML teams procure high-quality datasets faster while giving contributors a trustworthy earning workflow.
- The product already includes meaningful infrastructure for:
  - role-based workflows,
  - moderation and review queues,
  - uploads and artifact handling,
  - payments and payouts,
  - exports,
  - audit-oriented admin workflows,
  - public marketing plus authenticated application shells.

Internal references:
- [AGENTS.md](../../AGENTS.md)
- [ARCHITECTURE.md](../../ARCHITECTURE.md)
- [docs/product-specs/platform-overview.md](../product-specs/platform-overview.md)
- [docs/product-specs/role-workflows.md](../product-specs/role-workflows.md)

## Why the Current Thesis Is Weak

Your diagnosis is correct. The marketplace has structural disadvantages:

### 1. The two-sided marketplace problem is real

A public dataset marketplace requires both:
- a steady stream of buyers with funded jobs, and
- a large enough supply of contributors to fulfill those jobs quickly.

Without buyers, contributors churn. Without contributors, buyers do not trust throughput. This is a classic cold-start problem.

### 2. The highest-value data is usually not publicly collectible

In regulated or high-value domains such as healthcare, finance, insurance, legal, internal support, or enterprise operations, the data that matters most is often:
- proprietary,
- privacy-sensitive,
- access-controlled,
- bound to compliance or contractual restrictions.

That makes a public contributor marketplace a poor fit for many of the customers who can pay the most.

### 3. Data collection is not the only bottleneck anymore

Many companies are no longer asking only, "How do I get more data?" They are asking:
- "How do I evaluate whether this model is safe and accurate?"
- "How do I use our internal documents, tickets, calls, and workflows?"
- "How do I customize a model for our domain without breaking compliance?"
- "How do I keep humans in the loop for high-risk outputs and actions?"

This is a better market because the budget owner already exists and the pain is immediate.

### 4. Fine-tuning infrastructure is getting commoditized

OpenAI, AWS, Google Cloud, and Microsoft all now offer first-party tuning and evaluation workflows. That means a startup should not position itself as generic tuning infrastructure.

The defensible layer is higher up the stack:
- domain-specific eval datasets,
- human review pipelines,
- expert graders and rubrics,
- compliance and audit trails,
- workflow-specific integrations,
- vertical outcomes.

## Market Research: What Customers Actually Need Now

### Signal 1: Enterprise AI spend is real, fast-growing, and moving up the stack

Menlo Ventures' 2025 enterprise AI report says enterprise generative AI spend reached `$37B` in 2025, and that more than half of this spend went to AI applications rather than long-term infrastructure bets. It also highlights growing spend in departmental and vertical solutions, including healthcare and legal.

What that means for Caudals:
- Customers want business outcomes now.
- They will pay for applications and workflow acceleration before they pay for generalized infrastructure.
- A product that sits closer to a measurable workflow has a better chance than a horizontal dataset marketplace.

### Signal 2: AI adoption is broad, but maturity and trust are still weak

McKinsey's 2025 AI survey shows:
- AI adoption has accelerated materially.
- Risk and data governance remain among the most centralized parts of AI deployment.
- Organizations still vary widely in how much human review they apply to AI outputs.
- Many organizations are still early in realizing bottom-line value from AI.

What that means for Caudals:
- Companies are using AI, but they do not yet have reliable internal systems for evaluation, governance, and review.
- This creates demand for products that help them move from experimentation to controlled production.

### Signal 3: Evals and human review are becoming a required layer

OpenAI's enterprise guidance explicitly pushes teams to start with evals and to only invest in fine-tuning after setting up evals. OpenAI's tuning documentation also emphasizes that reinforcement fine-tuning depends on expert graders agreeing on what good output looks like.

AWS, Google Cloud, and Microsoft are all expanding model evaluation features:
- AWS Bedrock supports human evaluation, custom metrics, and customer-provided datasets.
- Google Vertex AI supports customizable judge metrics, agent evaluation, and secure tuning flows.
- Microsoft Foundry supports evaluation runs, AI-assisted metrics, and safety evaluation around fine-tuning.

What that means for Caudals:
- Evaluation is not a side feature. It is becoming part of the standard AI production stack.
- Human review, custom rubrics, and expert grading are now product categories.
- Caudals already has workflow DNA that fits review and moderation much better than it fits open marketplace growth.

### Signal 4: Regulated and high-trust use cases are pulling budget

OpenAI's Pioneers Program frames domain-specific evals and narrow expert models as especially important in sectors like legal, finance, insurance, healthcare, and accounting.

The EU AI Act increases pressure on providers and deployers to care about:
- high-quality datasets,
- traceability and logging,
- documentation,
- human oversight,
- robustness and accuracy.

What that means for Caudals:
- European and regulated buyers increasingly need process, auditability, and oversight.
- A startup that helps them document and evaluate AI systems can ride this compliance wave instead of being hurt by it.

### Signal 5: Vertical AI is where willingness to pay is strongest

Menlo's 2025 healthcare AI report is especially useful because it shows how buyers behave when the pain is acute:
- healthcare AI spending reached roughly `$1.4B` in 2025 in Menlo's estimate,
- 22% of healthcare organizations had implemented domain-specific AI tools,
- buyer priorities were production readiness, risk level, and short-term value delivery,
- many winning AI products are automating workflows that were previously funded out of services budgets rather than software budgets.

This pattern likely generalizes beyond healthcare:
- the best AI startups often do not sell "AI" first,
- they sell a faster, safer, cheaper workflow.

## Strategic Conclusion

Do not pivot to "generic custom datasets and fine-tuning for everyone."

That market statement is still too broad and still pushes you toward service-heavy, low-differentiation work.

Instead, pivot Caudals toward one of these higher-quality positions:
- a private `EvalOps + human review + expert tuning` platform,
- a `private workforce orchestration` product for customer-owned or partner-owned reviewer cohorts,
- or a `vertical AI workflow product` built on top of the current review/audit infrastructure.

## Recommended Pivot Options

## Option A: Caudals EvalOps

### Summary
Turn Caudals into a private platform for:
- building evaluation datasets,
- running AI output review workflows,
- capturing expert grades,
- comparing prompts/models/agent versions,
- producing approval, audit, and compliance evidence.

### Why this is the best fit
This is the cleanest pivot because it:
- removes the open marketplace cold start,
- uses customer-owned data instead of public contributors,
- fits the current moderation/review/admin architecture,
- aligns with market demand for evals, human oversight, and traceability,
- leaves room to add fine-tuning services later.

### Ideal customer profile
- Teams with 20-500 employees already shipping AI features.
- Strong initial targets:
  - customer support AI teams,
  - legal/insurance/finance copilots,
  - healthcare admin automation teams,
  - AI consultancies building production systems for end clients,
  - enterprises needing multilingual or regulated review loops.

### Core value proposition
"Caudals helps you turn AI experiments into production systems by combining eval datasets, human review, expert rubrics, and audit trails in one workspace."

### What the product becomes
Map existing concepts to the new model:
- `requester` -> `workspace owner` or `AI team`
- `dataset request` -> `evaluation project` or `AI workflow`
- `submission` -> `test case`, `model output`, `review item`, or `agent run`
- `contributor` -> `reviewer`, `expert`, or `operator`
- `admin` -> `ops/compliance lead`
- `export` -> `evaluation report`, `approval package`, `release sign-off`

### Reuse from current Caudals
High reuse:
- role-based workspace model,
- review and moderation flows,
- upload/file handling,
- support and admin operations,
- export jobs,
- audit-friendly data model,
- public site and auth/onboarding.

### Product changes required
1. Replace public browse marketplace with private projects and invite-only reviewers.
2. Add connectors for internal enterprise data sources:
   - Google Drive,
   - Notion,
   - Slack,
   - Zendesk,
   - Jira,
   - HubSpot,
   - CSV/JSON import.
3. Add rubric builder and scorecards.
4. Add model/version comparison runs.
5. Add human review queues for sampled outputs.
6. Add approval thresholds and sign-off states.
7. Add compliance features:
   - reviewer traceability,
   - immutable logs,
   - PII tagging/redaction,
   - region-aware storage controls.
8. Reduce emphasis on payouts unless reviewers are paid external contractors.

### Business model
- Paid pilot: `EUR 8k-EUR 20k`
- Platform subscription: `EUR 1.5k-EUR 6k MRR`
- Optional managed review/eval operations: `EUR 3k-EUR 15k MRR`

### Risks
- Needs a sharp ICP and use case, or it becomes another generic eval tool.
- You will face competition from dedicated eval vendors and cloud-native tooling.

### How to beat that competition
Differentiate on:
- human-in-the-loop workflows,
- compliance and auditability,
- managed setup and implementation,
- vertical templates,
- multilingual review operations,
- private reviewer orchestration.

## Option B: Caudals Model Customization Studio

### Summary
Offer a services-led product for companies that want:
- data preparation,
- eval design,
- fine-tuning,
- prompt optimization,
- deployment guidance,
- and post-launch monitoring.

### Why it works
- Fastest route to first revenue.
- Easier to sell than a pure software platform when you do not yet have brand distribution.
- Lets you learn real customer pain before hard-committing product direction.

### Best use
This should be a `revenue bridge`, not the final company identity.

### Recommended positioning
Do not say:
- "We train models for companies."

Say:
- "We improve the reliability of your AI workflow using your data, custom evals, and narrow model optimization."

### Offer structure
1. `AI workflow audit` (1-2 weeks)
2. `Pilot implementation` (4-6 weeks)
3. `Managed optimization` (monthly retainer)

### Risks
- Harder to scale.
- Can become bespoke consulting.
- Weak moat if you do not turn repeated work into software.

## Option C: Private Workforce Orchestration

### Summary
Keep the workforce/review DNA, but remove the public marketplace. Instead of sourcing an open crowd, Caudals becomes the control layer for:
- customer-owned reviewers,
- partner BPO teams,
- universities,
- certified contractors,
- expert SMEs.

### Why this is attractive
This preserves more of the current product and avoids the cold-start loop.

### Best use cases
- internal annotation teams,
- law firms or compliance teams reviewing outputs,
- healthcare operations teams reviewing AI actions,
- industrial QA teams reviewing image or document outputs,
- call center QA for voice agents.

### Risks
- Still somewhat operationally heavy.
- If you stay too generic, it looks like a smaller label/review platform.

### Best framing
Treat this as the workforce layer inside Option A, not as a standalone end-state.

## Option D: Vertical AI Workflow Product

### Summary
Use Caudals as the operational backbone for one narrow AI workflow with obvious ROI.

### Strong vertical candidates
1. `Healthcare administrative AI`
   - prior authorization,
   - coding review,
   - referral intake,
   - patient messaging QA.
2. `Insurance / claims AI`
   - document triage,
   - claim summarization review,
   - underwriting memo QA,
   - call review and compliance.
3. `Customer support AI QA`
   - response evaluation,
   - escalation routing,
   - multilingual quality assurance,
   - release approval for support agents.
4. `Industrial / robotics data and review ops`
   - private image/video review,
   - defect detection QA,
   - edge-case harvesting,
   - expert validation.

### Why this is powerful
Vertical AI buyers often pay for outcomes, not tooling. That gives clearer ROI and better retention.

### Why this is harder
You need much deeper domain knowledge and a narrower brand.

## Ranking of Pivot Paths

| Rank | Pivot | Why |
| --- | --- | --- |
| 1 | Option A: EvalOps | Best mix of market pull, product reuse, defensibility, and speed to first revenue |
| 2 | Option B: Model Customization Studio | Fastest path to revenue and discovery, but should support Option A rather than replace it |
| 3 | Option D: Vertical AI Workflow | Highest upside if you choose well, but requires stronger focus and customer intimacy |
| 4 | Option C: Private Workforce Orchestration | Useful capability, but weaker as a standalone company thesis |

## My Recommended Direction

### New company thesis
`Caudals helps companies evaluate, review, and safely customize AI systems using their own data and expert workflows.`

This is better than the current thesis because:
- it starts from existing enterprise pain,
- it does not depend on a public marketplace,
- it fits compliance-heavy sectors,
- and it preserves a large share of the current platform's architecture.

### Suggested initial wedge
Start with one narrow problem:
`AI output review and release approval for customer-facing copilots and agents.`

That wedge is attractive because:
- every team shipping AI has output quality problems,
- review can start manually before full automation,
- it naturally leads into eval datasets and fine-tuning,
- and it creates recurring usage.

### Suggested first ICP
Start with one of these:
1. AI consultancies and dev shops building copilots for clients.
2. Mid-market support teams deploying AI agents or AI drafting tools.
3. Legal, compliance, insurance, or finance teams where auditability matters.
4. Multilingual European teams that need human review and governance.

If you want a stronger vertical angle from day one, choose:
- `support AI QA` or `insurance/legal review ops` before healthcare.

Healthcare is attractive, but the sales cycles, integrations, and compliance burden are heavier unless you already have strong domain access.

## Related Startup Ideas You Could Pivot Toward

These are adjacent ideas that are more in demand than a generic public dataset marketplace and still fit parts of the existing Caudals platform.

### 1. AI Agent QA and Release Management
A platform that:
- runs sampled conversations,
- scores outputs against custom rubrics,
- routes failures to humans,
- blocks release if thresholds fail.

Why demand exists:
- agent adoption is increasing,
- evaluation tooling is becoming standard,
- teams need something between raw logs and production confidence.

### 2. Human Approval Layer for High-Risk Agent Actions
A product for workflows where AI drafts or proposes actions, but humans approve before execution.

Examples:
- refund approval,
- claims decision support,
- legal document response review,
- outbound communication approval.

Why demand exists:
- this is where trust, liability, and compliance matter most.

### 3. EU AI Act Readiness and Audit Workspace
A product focused on:
- logging,
- evidence collection,
- review policies,
- human oversight workflows,
- incident traceability.

Why demand exists:
- EU regulation is now concrete and time-bound.
- Many companies will need lightweight operational tooling, not just legal advice.

### 4. Multilingual AI Quality Assurance for European Companies
A system for:
- review of AI outputs across Spanish, English, French, German, etc.,
- rubric-based approval,
- language-specific edge-case tracking,
- release sign-off by locale.

Why demand exists:
- multilingual quality is often materially worse than English quality.
- Europe offers a natural geographic wedge.

### 5. Voice Agent QA and Compliance Review
A platform that ingests call transcripts and audio metadata, then supports:
- conversation scoring,
- hallucination/compliance review,
- escalation labeling,
- supervisor sign-off.

Why demand exists:
- voice agents are proliferating in support, sales, healthcare access, and insurance.

### 6. Private Multimodal Review Platform for Industrial AI
A product for companies with proprietary image/video/sensor data who need:
- review workflows,
- edge-case tagging,
- human verification,
- audit logs,
- exportable evaluation sets.

Why demand exists:
- data is sensitive,
- teams cannot use public marketplaces,
- and multimodal QA is operationally messy.

### 7. Services-to-Software Automation in Regulated Back Offices
A vertical product for workflows like:
- prior auth,
- claims intake,
- compliance review,
- vendor onboarding,
- document triage.

Why demand exists:
- these budgets often come from services spend,
- which creates larger upside than replacing existing software alone.

## What Not To Pivot To

Avoid these paths unless you have a very specific unfair advantage:

### 1. Generic public dataset marketplace
This is the current problem. It keeps the worst structural risk.

### 2. Generic annotation platform
This is crowded and increasingly commoditized.

### 3. Generic "we fine-tune models for companies" consultancy
Too broad, too easy to copy, too dependent on custom work.

### 4. Sensitive-data acquisition marketplace
Especially in healthcare, legal, and enterprise ops, data access is the bottleneck. A marketplace does not solve that.

## Product Changes to Make Now

## Product strategy changes
1. Shift from `public marketplace` to `private workspace` by default.
2. Reposition around `evaluation, review, and safe customization`.
3. Narrow to one wedge before expanding.
4. Keep optional human reviewer orchestration, but stop making open crowdsourcing the center of the business.

## UX and information architecture changes
1. Rename core concepts across the app:
   - dataset -> project / workflow / evaluation set
   - contributor -> reviewer / expert / operator
   - submission -> review item / test case / output sample
2. Replace `/browse` with a private project or reviewer task inbox model.
3. Add a first-class `Runs` or `Evaluations` section.
4. Add a `Rubrics` section.
5. Add a `Review Queue` with confidence buckets and sampling rules.
6. Add an `Approvals` section for release sign-off.
7. Add a `Compliance / Audit` page with immutable logs and exportable evidence.

## Data model changes
High-level target entities:
- `projects`
- `data_sources`
- `evaluation_sets`
- `runs`
- `rubrics`
- `review_items`
- `review_assignments`
- `approvals`
- `audit_events`
- `model_versions`
- `connectors`

### Mapping from existing tables
A practical migration path could be:
- `dataset_requests` -> `projects`
- `submissions` -> `review_items`
- `dataset_exports` -> `reports` or `export_jobs`
- `dataset_activity` -> `audit_events`
- `requester_org_settings` -> workspace configuration
- `requester_api_keys` -> connector credentials / API access
- `wallets` and `transactions` -> keep only if paid external reviewers remain in scope

## Go-to-market changes
1. Sell a paid pilot, not a self-serve marketplace.
2. Start with founder-led outbound.
3. Target companies already using LLMs, not companies merely curious about them.
4. Sell measurable outcomes:
   - reduce hallucinations,
   - improve approval rate,
   - cut review time,
   - create compliance evidence,
   - improve production confidence.
5. Use services to close the first deals and software to retain them.

## What To Keep, Repurpose, or Deprecate

### Keep
- Auth, workspace, and role infrastructure.
- Admin and moderation-style queue patterns.
- Uploads, storage, and export jobs.
- Audit-oriented activity logging.
- Billing foundations for pilots, subscriptions, or paid expert reviewers.
- Support and account management surfaces.

### Repurpose
- `requester` surface into customer AI team workspace.
- `contributor` surface into reviewer / expert / operator task inbox.
- `admin` surface into compliance, QA, and release operations console.
- `dataset builder` into evaluation-set or rubric builder.
- `submissions panel` into review queue and adjudication console.
- `files / exports` into evidence packs, release reports, and evaluation exports.

### Deprecate or hide early
- Public browse marketplace.
- Public contributor acquisition flows as the primary growth engine.
- Any messaging centered on global open crowdsourcing as the main differentiator.
- Pricing built around dataset marketplace economics before the new wedge is validated.

## How To Acquire The First Customers

### Best immediate offer
Sell a `4-6 week AI reliability pilot`.

Deliverables:
- one evaluation dataset,
- one rubric pack,
- one review workflow,
- one baseline vs candidate comparison,
- one exported recommendation report,
- optional fine-tuning or prompt-optimization follow-up.

### Who to sell it to first
Prioritize:
1. AI agencies and consultancies
2. SaaS companies with customer support copilots
3. legal / insurance / compliance teams using AI drafting tools
4. enterprise innovation teams that already have pilots and now need governance

### Sample positioning
- "We help your team evaluate and safely release AI features."
- "We turn your experts into a repeatable review and model-improvement loop."
- "We build the evals, human review, and audit trail your AI workflow is missing."

### Why this is a better first sale than the current product
- One customer can start immediately with their own data.
- No need to wait for a marketplace to form.
- Revenue can start with implementation work.
- The product naturally expands into recurring software usage.

## 30 / 60 / 90 Day Plan

## Next 30 days
1. Choose one wedge: `EvalOps for AI outputs`.
2. Rewrite homepage and core messaging around review, evals, and safe customization.
3. Hide or de-emphasize public contributor marketplace flows.
4. Define new core entities and migration plan.
5. Build a pilot manually for one design partner using the existing platform where possible.
6. Start outbound to 30-50 target companies.

## Days 31-60
1. Ship rubric builder and review queue MVP.
2. Add CSV / JSON import and basic connector ingest.
3. Add run comparison and exportable summary report.
4. Sign 1-3 paid pilots.
5. Document a repeatable onboarding playbook.

## Days 61-90
1. Productize the best pilot into a template.
2. Add approval workflow and audit log views.
3. Narrow vertical focus if one segment pulls hardest.
4. Move from custom pilot delivery toward recurring subscription plus optional managed services.

## Decision Framework

Use this to choose whether to fully commit to the pivot:

### Commit if these are true
- You can name one buyer persona with budget and urgency.
- You can close a paid pilot without needing a marketplace.
- You can use customer-owned data instead of sourcing public data.
- You can describe the ROI in workflow terms, not model terms.

### Do not commit yet if these are false
- You still need a public crowd to make the value proposition work.
- You cannot define a narrow wedge.
- The pitch is still mostly "we can build AI stuff for you".

## Bottom Line

The current Caudals codebase is more valuable than the current Caudals business thesis.

You already have the beginnings of a serious operations platform:
- roles,
- queues,
- approvals,
- exports,
- payments,
- admin oversight,
- and enterprise-style workflow structure.

What should change is not "whether to keep building software."
It is `what problem the software is for`.

My strongest recommendation is:
- stop centering the company on an open dataset marketplace,
- reposition Caudals as a private AI evaluation and human-review platform,
- use services-led pilots to get first customers,
- and only then decide whether to deepen into a vertical.

That gives you a much better chance of getting paid early while preserving a large portion of the work you have already done.

## Sources

### Internal repo sources
- [AGENTS.md](../../AGENTS.md)
- [ARCHITECTURE.md](../../ARCHITECTURE.md)
- [docs/PLAN.md](../PLAN.md)
- [docs/product-specs/platform-overview.md](../product-specs/platform-overview.md)
- [docs/product-specs/role-workflows.md](../product-specs/role-workflows.md)
- [components/landing/hero.tsx](../../components/landing/hero.tsx)
- [components/landing/platform-overview.tsx](../../components/landing/platform-overview.tsx)
- [components/landing/pricing.tsx](../../components/landing/pricing.tsx)
- [supabase/migrations/001_initial_schema.sql](../../supabase/migrations/001_initial_schema.sql)
- [supabase/migrations/013_rebuild_payment_infrastructure.sql](../../supabase/migrations/013_rebuild_payment_infrastructure.sql)

### External market and product sources
- Menlo Ventures, [2025: The State of Generative AI in the Enterprise](https://menlovc.com/perspective/2025-the-state-of-generative-ai-in-the-enterprise/)
- McKinsey, [The state of AI: How organizations are rewiring to capture value](https://www.mckinsey.com/~/media/mckinsey/business%20functions/quantumblack/our%20insights/the%20state%20of%20ai/2025/the-state-of-ai-how-organizations-are-rewiring-to-capture-value_final.pdf)
- OpenAI, [AI in the Enterprise: Lessons from seven frontier companies](https://cdn.openai.com/business-guides-and-resources/ai-in-the-enterprise.pdf)
- OpenAI, [Announcing OpenAI Pioneers Program](https://openai.com/index/openai-pioneers-program/)
- OpenAI API docs, [Model optimization](https://developers.openai.com/api/docs/guides/model-optimization)
- OpenAI API docs, [Supervised fine-tuning](https://developers.openai.com/api/docs/guides/supervised-fine-tuning)
- OpenAI API docs, [Reinforcement fine-tuning](https://developers.openai.com/api/docs/guides/reinforcement-fine-tuning)
- AWS, [Amazon Bedrock model evaluation now supports evaluating custom models](https://aws.amazon.com/about-aws/whats-new/2024/10/amazon-bedrock-model-evaluation-evaluating-custom-models/)
- AWS, [Amazon Bedrock RAG and Model Evaluations now support custom metrics](https://aws.amazon.com/about-aws/whats-new/2025/04/amazon-bedrock-rag-model-evaluations-custom-metrics/)
- AWS docs, [Create a human-based model evaluation job](https://docs.aws.amazon.com/bedrock/latest/userguide/model-evaluation-jobs-management-create-human.html)
- AWS docs, [Customize a model with fine-tuning or continued pre-training in Amazon Bedrock](https://docs.aws.amazon.com/bedrock/latest/userguide/custom-model-fine-tuning.html)
- Google Cloud, [Gen AI evaluation service overview](https://cloud.google.com/vertex-ai/generative-ai/docs/models/evaluation-overview)
- Google Cloud, [Gen AI evaluation service API](https://cloud.google.com/vertex-ai/generative-ai/docs/model-reference/evaluation)
- Google Cloud, [Evaluate Gen AI agents](https://cloud.google.com/vertex-ai/generative-ai/docs/models/evaluation-agents)
- Google Cloud, [Tuning API](https://cloud.google.com/vertex-ai/generative-ai/docs/model-reference/tuning)
- Microsoft Learn, [Evaluate generative AI models and applications by using Microsoft Foundry](https://learn.microsoft.com/en-us/azure/foundry/how-to/evaluate-generative-ai-app)
- Microsoft Learn, [Customize a model with fine-tuning](https://learn.microsoft.com/en-us/azure/cognitive-services/openai/how-to/fine-tuning)
- Microsoft Learn, [Safety evaluation for fine-tuning](https://learn.microsoft.com/en-us/azure/foundry/openai/how-to/fine-tuning-safety-evaluation)
- European Commission, [AI Act](https://digital-strategy.ec.europa.eu/en/policies/regulatory-framework-ai)
- Menlo Ventures, [2025: The State of AI in Healthcare](https://menlovc.com/perspective/2025-the-state-of-ai-in-healthcare/)
- Y Combinator, [Confident AI: The Evals Platform for AI Quality & Observability](https://www.ycombinator.com/launches/Mnp-confident-ai-the-evals-platform-for-ai-quality-observability)
- Y Combinator, [HumanLayer - Human-in-the-loop for AI Agents and beyond](https://www.ycombinator.com/launches/M8e-humanlayer-human-in-the-loop-for-ai-agents-and-beyond)
