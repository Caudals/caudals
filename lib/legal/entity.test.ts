import JSZip from "jszip";
import { describe, expect, it } from "vitest";
import { renderDpaTemplate, dpaTemplateDownloadName } from "./dpa-template";
import { getLegalEntity } from "./entity";
import { findLegalPlaceholders } from "./placeholders";

const real = {
  LEGAL_ENTITY_NAME: "Ejemplo Real, S.L.",
  LEGAL_ENTITY_NIF: "B12345678",
  LEGAL_ENTITY_ADDRESS: "Calle Mayor 2, 47002 Valladolid, España",
  LEGAL_ENTITY_REGISTRY: "Registro Mercantil de Valladolid, tomo 1, folio 2, hoja VA-12345",
};

describe("getLegalEntity", () => {
  it("is null until name, NIF and address are all set", () => {
    expect(getLegalEntity({})).toBeNull();
    expect(getLegalEntity({ ...real, LEGAL_ENTITY_NIF: "  " })).toBeNull();
    expect(getLegalEntity({ ...real, LEGAL_ENTITY_ADDRESS: undefined })).toBeNull();
  });

  it("returns trimmed values, with the registry optional", () => {
    expect(getLegalEntity({ ...real, LEGAL_ENTITY_NAME: "  Ejemplo Real, S.L. " })).toEqual({
      name: "Ejemplo Real, S.L.",
      nif: "B12345678",
      address: "Calle Mayor 2, 47002 Valladolid, España",
      registry: "Registro Mercantil de Valladolid, tomo 1, folio 2, hoja VA-12345",
    });
    expect(getLegalEntity({ ...real, LEGAL_ENTITY_REGISTRY: "" })?.registry).toBeNull();
  });

  it("never publishes the spec's placeholder values (§3.2)", () => {
    expect(getLegalEntity({ ...real, LEGAL_ENTITY_NIF: "B00000000" })).toBeNull();
    expect(getLegalEntity({ ...real, LEGAL_ENTITY_ADDRESS: "Calle Ejemplo 1, 47001 Valladolid, España" })).toBeNull();
    expect(
      getLegalEntity({ ...real, LEGAL_ENTITY_REGISTRY: "Registro Mercantil de Valladolid, Tomo 0000, Folio 0, Hoja VA-00000" })?.registry,
    ).toBeNull();
    expect(getLegalEntity({ ...real, LEGAL_ENTITY_NAME: "[legal company name]" })).toBeNull();
  });
});

async function documentText(buffer: Buffer) {
  const zip = await JSZip.loadAsync(buffer);
  const xml = await zip.file("word/document.xml")!.async("string");
  return xml.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
}

describe("DPA template", () => {
  it("is a Word document with the clauses, annexes and sub-processors, in each language", async () => {
    const en = await documentText(await renderDpaTemplate("en", null));
    expect(en).toContain("Data Processing Agreement");
    expect(en).toContain("Template for signature · Version 2026-10-11");
    expect(en).toContain("Annex 3. Sub-processors");
    expect(en).toContain("Hetzner Online GmbH");
    expect(en).toContain("Personal data breaches");
    const es = await documentText(await renderDpaTemplate("es", null));
    expect(es).toContain("Contrato de encargo del tratamiento");
    expect(es).toContain("Anexo 3. Subencargados");
    expect(dpaTemplateDownloadName("es")).toBe("caudals-dpa-2026-10-11-es.docx");
  });

  it("leaves blank lines for the processor until the company data is published", async () => {
    const pending = await documentText(await renderDpaTemplate("en", null));
    expect(pending).not.toContain("B12345678");
    expect(pending.match(/Tax ID \(NIF or VAT number\):/g)).toHaveLength(2);
    expect(findLegalPlaceholders(pending)).toEqual([]);

    const published = await documentText(await renderDpaTemplate("en", getLegalEntity(real)));
    expect(published).toContain("Ejemplo Real, S.L., with tax identification number (NIF) B12345678");
    expect(published.match(/Tax ID \(NIF or VAT number\):/g)).toHaveLength(1);
  });
});
