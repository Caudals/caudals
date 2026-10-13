---
title: Prepare and run your tests
summary: Generate questions from your material, review and approve them, then run the evaluation and follow its progress.
keywords: [prepare, test set, tests, questions, generate, review, edit, approve, freeze, version, run, pause, resume, stop, restart, queue]
related: [uploads, reading-results, schedules-and-alerts]
owner: operations
reviewed: 2026-10-12
review_by: 2027-01-12
---

Every evaluation moves through four steps: **Connect**, **Prepare tests**, **Run** and **Results**. Owners and editors can prepare and run; viewers can follow along and read the results.

## Generate the test set {#generate}

1. Add your [reference material](help:uploads#documents).
2. Under **Test set**, choose the **Number of tests**: 10 (Quick check), 25 (Standard, the default), 50 (Thorough) or 100 (Professional). On the free plan a test set holds up to 50 tests.
3. Choose the **Difficulty**: Foundational, Balanced or Expert.
4. Choose **Generate test set**.

Caudals reads your material, may ask **A few questions before we write the tests** (all optional), writes the questions and checks them. Fewer tests are written when your material supports fewer distinct facts. You can close the page; preparation continues in the background.

Each test has a question, the expected answer and the excerpt of your material it comes from. To add one of your own, use **Write a test yourself**.

## Review and approve {#review}

In **Review the test set**, read each question with its expected answer and source excerpt, and remove the ones that do not apply.

To change a question, use **Review and edit questions**. You can edit the question, the reference answer, the key facts a correct answer must include, other acceptable answers and what the assistant should do (answer, decline or refer to a person, ask for missing information, or say it is not documented). You can also add questions with a severity from low to critical.

When you are happy, choose **Approve test set**. Approved tests become a frozen, versioned test set: that version never changes, so later runs stay comparable. To change it later, make an editable copy and approve a new version.

## Run the evaluation {#run}

Choose **Run evaluation**. Each question is sent to your system once, the answers are graded, and the report is written:

- **Asking your assistant**, then **Grading answers**, then **Writing the report**, each with its progress.
- If another run is using the workspace's run slot, the evaluation is **queued** and starts by itself.
- You can close the page. You get a notification when the results are ready, and an email if you switched it on in **Settings → Notifications**.

From the evaluation's three-dot menu you can **Pause evaluation**, **Resume evaluation**, **Stop evaluation** or **Restart evaluation**. A paused run can also be finished with the answers it already has; the report then covers only those answers.

On the free plan you can run three evaluations a month, one at a time.
