---
title: Upload documents and answers
summary: Add the reference material your tests are written from, and, where it is enabled, upload your system's answers instead of connecting it.
keywords: [upload, file, document, pdf, word, excel, csv, reference material, sources, website, pages, answers, spreadsheet, scanned, drag and drop, help centre, sitemap, context]
related: [prepare-and-run, connect-api, data-and-privacy]
owner: operations
reviewed: 2026-10-13
review_by: 2027-01-13
---

Your tests are written from your own material. You can add files, public web pages, or both.

## Reference documents {#documents}

In the evaluation's **Prepare tests** step, under **Reference material**:

- Drop PDF, Word, TXT, Markdown, CSV or Excel files on the upload area, or choose them: up to 50 files, 25 MB each and 200 MB in total per evaluation. PDFs can have up to 500 pages. Each file shows its own progress; a file that is already in the evaluation is skipped, and a file that cannot be added says why without stopping the others.
- Choose **Import help centre** and paste your help centre's address or its sitemap. Caudals lists the pages first, from the sitemap, on that website only and following its robots.txt; you choose which to read (up to 50 pages on the free plan, 200 with credits) and see the credits it will use, one per page read.
- Choose **Add a public website** to read up to 25 public pages on that host. Caudals does not sign in, submit forms or follow links to other hosts.
- Choose **Find sources on the web** to get up to ten suggested public pages about your product, such as help pages, FAQs, terms and pricing. Pages on your own site come first. Pick the ones to add.

You can open each source to check the text Caudals extracted.

## Scanned documents {#scanned}

Caudals reads the text in a file; it does not read images of text. A PDF with almost no text, or with more than half its pages empty, is marked **This looks like a scanned document** as soon as it is read. Upload a text version (an exported PDF or the Word original) or the matching web page, or leave it out. Your other material is not affected.

## Confirm what we understood {#context}

Before the tests are written, Caudals shows **What we understood about your assistant**: what it is for, who uses it, its main tasks, languages, jurisdiction, reference date, which source wins when sources disagree, what it must not do and any open questions. Fields marked **Check this** were unclear in your material; **Show where this comes from** opens the excerpts behind a field. Correct what is wrong and choose **Confirm and write the tests**; it is free. If you skip, or nobody confirms within 30 minutes, the tests use what Caudals understood and the report says the context was not confirmed.

## Upload your system's answers {#answers}

When Caudals cannot reach your system, you can ask it the questions yourself and upload the answers. This option, **Upload answers**, appears when you create an evaluation if it is enabled for your workspace; it is not part of the free plan.

1. Prepare and approve the test set as usual.
2. Start the run. The evaluation shows **Waiting for your answers**.
3. Choose **Download question sheet**. Ask your system each question and paste its answer in the `system_answer` column. Keep the other columns as they are.
4. Upload the sheet as CSV, JSONL or Excel (up to 25 MB).

Partial uploads are kept, so you can send the answers in several batches. When every question has an answer, Caudals grades them and your preliminary report is ready.
