#!/usr/bin/env python3
"""Add the campaign email reviewer to the matching Warmbly dashboard source."""
from pathlib import Path
import argparse
import shutil

parser = argparse.ArgumentParser()
parser.add_argument("source", type=Path)
args = parser.parse_args()
root = args.source / "web/src"
own = Path(__file__).parent
destination = root / "components/app/campaigns/reviewer"
destination.mkdir(parents=True, exist_ok=True)
for name in ["EmailReviewer.tsx", "reviewModel.ts", "reviewer.css", "reviewModel.test.ts"]:
    shutil.copy2(own / name, destination / name)
main = root / "main.tsx"
text = main.read_text()
if "EmailReviewer" not in text:
    marker = "import CampaignLayout from './app/app/campaigns/[id]/layout';"
    assert marker in text, "Campaign layout import changed upstream"
    text = text.replace(marker, marker + '\nimport EmailReviewer from "@/components/app/campaigns/reviewer/EmailReviewer";', 1)
    marker = '                    path: "steps",'
    assert marker in text, "Campaign routes changed upstream"
    text = text.replace('                  {\n' + marker, '                  { path: "review", element: <EmailReviewer /> },\n                  {\n' + marker, 1)
    assert 'path: "review"' in text
    main.write_text(text)
layout = root / "app/app/campaigns/[id]/layout.tsx"
text = layout.read_text()
if 'path: "/review"' not in text:
    marker = '    { label: "Steps", path: "/steps", Icon: ListChecksIcon },'
    assert marker in text, "Campaign tabs changed upstream"
    text = text.replace(marker, marker + '\n    { label: "Review emails", path: "/review", Icon: ListChecksIcon },', 1)
    layout.write_text(text)
print("Campaign email reviewer installed. Existing provider panels are preserved.")
titles = root / "hooks/useDocumentTitle.ts"
text = titles.read_text()
if '"Review emails"' not in text:
    marker = '  [/^\\/app\\/campaigns\\/[^/]+\\/steps$/, "Campaign steps"],'
    assert marker in text, "Campaign title map changed upstream"
    text = text.replace(marker, marker + '\n  [/^\\/app\\/campaigns\\/[^/]+\\/review$/, "Review emails"],', 1)
    titles.write_text(text)
