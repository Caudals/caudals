import "server-only";

import {
  AlignmentType,
  BorderStyle,
  Document,
  Footer,
  HeadingLevel,
  Packer,
  PageNumber,
  Paragraph,
  ShadingType,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
} from "docx";
import type { Locale } from "@/lib/i18n/config";
import { getLegalContent, type LegalTable } from "./documents";
import type { LegalEntity } from "./entity";
import { dpaTemplateFileName, legalDocumentVersion } from "./versions";

export { dpaTemplateFileName };

/**
 * The downloadable DPA template (`/legal/caudals-dpa-<locale>.docx`), an
 * editable Word document built from the same content file as `/legal/dpa`, so
 * the page and the template cannot drift. The processor's details come from
 * the company data when it is published; until then both parties get blank
 * lines to complete by hand.
 */

const FONT = "Calibri";
const MUTED = "6B6A63";
const RULE = "DCDAD3";
const BLANK = "______________________________________";

const run = (text: string, options: { bold?: boolean; color?: string; size?: number } = {}) =>
  new TextRun({ text, font: FONT, size: options.size ?? 21, bold: options.bold, color: options.color });

const paragraph = (text: string, options: { bold?: boolean; color?: string; after?: number } = {}) =>
  new Paragraph({ spacing: { after: options.after ?? 140, line: 300 }, children: [run(text, options)] });

const heading = (text: string, level: (typeof HeadingLevel)[keyof typeof HeadingLevel]) =>
  new Paragraph({
    heading: level,
    spacing: { before: 300, after: 120 },
    children: [run(text, { bold: true, size: level === HeadingLevel.TITLE ? 36 : 24 })],
  });

const bullet = (text: string) =>
  new Paragraph({ bullet: { level: 0 }, spacing: { after: 100, line: 300 }, children: [run(text)] });

function cell(text: string, header = false) {
  return new TableCell({
    shading: header ? { type: ShadingType.CLEAR, color: "auto", fill: "F5F4F0" } : undefined,
    margins: { top: 60, bottom: 60, left: 100, right: 100 },
    children: [new Paragraph({ children: [run(text, { bold: header, size: 18 })] })],
  });
}

function table({ columns, rows }: LegalTable) {
  const border = { style: BorderStyle.SINGLE, size: 4, color: RULE };
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: { top: border, bottom: border, left: border, right: border, insideHorizontal: border, insideVertical: border },
    rows: [
      new TableRow({ tableHeader: true, children: columns.map((column) => cell(column, true)) }),
      ...rows.map((row) => new TableRow({ children: row.map((value) => cell(value)) })),
    ],
  });
}

const field = (label: string, value?: string) =>
  new Paragraph({
    spacing: { after: 120 },
    children: [run(`${label}: `, { color: MUTED }), run(value ?? BLANK)],
  });

export async function renderDpaTemplate(locale: Locale, entity: LegalEntity | null): Promise<Buffer> {
  const legal = getLegalContent(locale);
  const copy = legal.dpaTemplate;
  const version = legalDocumentVersion("dpa");
  const subprocessors = legal.subprocessors.sections.find((section) => section.table)?.table;

  const processorDetails = entity
    ? [
        paragraph(
          copy.processorRegistered
            .replaceAll("{name}", entity.name)
            .replaceAll("{nif}", entity.nif)
            .replaceAll("{address}", entity.address),
        ),
        field(copy.partyFields[3]),
      ]
    : copy.partyFields.map((label) => field(label));

  const children: (Paragraph | Table)[] = [
    heading(copy.title, HeadingLevel.TITLE),
    paragraph(`${copy.subtitle} · ${copy.versionLabel} ${version}`, { color: MUTED, after: 240 }),
    ...copy.intro.map((text) => paragraph(text)),
    heading(copy.partiesTitle, HeadingLevel.HEADING_1),
    paragraph(copy.customerTitle, { bold: true }),
    ...copy.partyFields.map((label) => field(label)),
    paragraph(copy.processorTitle, { bold: true }),
    ...processorDetails,
    ...copy.clauses.flatMap((clause, index) => [
      heading(`${index + 1}. ${clause.title}`, HeadingLevel.HEADING_2),
      ...clause.body.map((text) => paragraph(text)),
    ]),
    ...copy.annexes.flatMap((annex) => [
      heading(annex.title, HeadingLevel.HEADING_1),
      ...(annex.body ?? []).map((text) => paragraph(text)),
      ...(annex.items ?? []).map((text) => bullet(text)),
      ...(annex.subprocessors && subprocessors ? [table(subprocessors)] : []),
    ]),
    heading(copy.signaturesTitle, HeadingLevel.HEADING_1),
    paragraph(copy.customerSignature, { bold: true }),
    ...copy.signatureFields.map((label) => field(label)),
    paragraph(copy.processorSignature, { bold: true }),
    ...copy.signatureFields.map((label) => field(label)),
  ];

  const document = new Document({
    creator: "Caudals",
    title: `${copy.title} (${version})`,
    styles: { default: { document: { run: { font: FONT } } } },
    sections: [
      {
        footers: {
          default: new Footer({
            children: [
              new Paragraph({
                alignment: AlignmentType.RIGHT,
                children: [
                  run(`${copy.title} · ${copy.versionLabel} ${version} · `, { color: MUTED, size: 16 }),
                  new TextRun({ children: [PageNumber.CURRENT], font: FONT, size: 16, color: MUTED }),
                ],
              }),
            ],
          }),
        },
        children,
      },
    ],
  });

  return Packer.toBuffer(document);
}

/** Download name, which carries the version so saved copies are identifiable. */
export function dpaTemplateDownloadName(locale: Locale) {
  return `caudals-dpa-${legalDocumentVersion("dpa")}-${locale}.docx`;
}
