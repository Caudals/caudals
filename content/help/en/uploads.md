---
title: Upload documents and answers
summary: Add the reference material your tests are written from, and, where it is enabled, upload your system's answers instead of connecting it.
keywords: [upload, file, document, pdf, word, excel, csv, reference material, sources, website, pages, answers, spreadsheet, scanned]
related: [prepare-and-run, connect-api, data-and-privacy]
owner: operations
reviewed: 2026-10-12
review_by: 2027-01-12
---

Your tests are written from your own material. You can add files, public web pages, or both.

## Reference documents {#documents}

In the evaluation's **Prepare tests** step, under **Reference material**:

- Upload PDF, Word, TXT, Markdown, CSV or Excel files: up to 20 files, 25 MB each and 100 MB in total per evaluation. PDFs can have up to 500 pages.
- Choose **Add a public website** to read up to 25 public pages on that host. Caudals does not sign in, submit forms or follow links to other hosts.
- Choose **Find sources on the web** to get up to ten suggested public pages about your product, such as help pages, FAQs, terms and pricing. Pages on your own site come first. Pick the ones to add.

You can open each source to check the text Caudals extracted.

## Scanned documents {#scanned}

Caudals reads the text in a file; it does not read images of text. If a PDF is a scan, you will see "A document could not be read". Upload a copy with selectable text, or the Word original.

## Upload your system's answers {#answers}

When Caudals cannot reach your system, you can ask it the questions yourself and upload the answers. This option, **Upload answers**, appears when you create an evaluation if it is enabled for your workspace; it is not part of the free plan.

1. Prepare and approve the test set as usual.
2. Start the run. The evaluation shows **Waiting for your answers**.
3. Choose **Download question sheet**. Ask your system each question and paste its answer in the `system_answer` column. Keep the other columns as they are.
4. Upload the sheet as CSV, JSONL or Excel (up to 25 MB).

Partial uploads are kept, so you can send the answers in several batches. When every question has an answer, Caudals grades them and your preliminary report is ready.
