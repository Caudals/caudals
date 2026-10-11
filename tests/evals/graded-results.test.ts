import { describe, expect, it } from "vitest";
import { matchGradedRows, parseGradedRows } from "../../lib/evals/contracts/graded-results";
import { tabularRecords } from "../../lib/evals/imports/structured";

const id = (n: number) => `00000000-0000-4000-8000-00000000000${n}`;

describe("parseGradedRows", () => {
  it("reads Spanish verdicts, key-fact statuses and categories", () => {
    const { rows, errors } = parseGradedRows([
      { case_revision_id: id(1), system_answer: "1.000 €", veredicto: "Correcta", motivo: "Da el mínimo.", datos_clave_estado: "presente" },
      { case_revision_id: id(2), system_answer: "No pasa nada.", veredicto: "incorrecta", motivo: "Omite la cancelación.", datos_clave_estado: "falta | contradice", categoria_fallo: "contradice fuente", contradicciones: "Dice que no pasa nada" },
      { case_revision_id: id(3), system_answer: "", veredicto: "no responde", motivo: "Sin respuesta." },
    ]);
    expect(errors).toEqual([]);
    expect(rows.map((row) => [row.outcome, row.verdict, row.failureCategory])).toEqual([
      ["pass", "correct", null], ["fail", "incorrect", "contradicts_source"], ["fail", "not_answered", "no_answer"],
    ]);
    expect(rows[1].keyFactStatuses).toEqual(["missing", "contradicted"]);
    expect(rows[1].contradictions).toEqual(["Dice que no pasa nada"]);
  });

  it("reads an optional likely cause in Spanish or English and ignores it on correct answers", () => {
    const { rows, errors } = parseGradedRows([
      { case_revision_id: id(1), system_answer: "39,90 €", veredicto: "incorrecta", motivo: "Tarifa antigua.", causa_probable: "Documento desactualizado" },
      { case_revision_id: id(2), system_answer: "Sí.", veredicto: "incorrecta", motivo: "Debía derivar.", likely_cause: "out_of_scope" },
      { case_revision_id: id(3), system_answer: "1.000 €", veredicto: "correcta", motivo: "Da el mínimo.", causa_probable: "laguna de conocimiento" },
      { case_revision_id: id(4), system_answer: "x", veredicto: "parcial", motivo: "m" },
    ]);
    expect(errors).toEqual([]);
    expect(rows.map((row) => row.likelyCause)).toEqual(["outdated_document", "out_of_scope", null, null]);
    expect(parseGradedRows([{ case_revision_id: id(5), system_answer: "x", veredicto: "incorrecta", motivo: "m", causa_probable: "mala suerte" }]).errors)
      .toEqual([{ rowNumber: 2, errors: ["causa_probable_invalid"] }]);
  });

  it("names every problem by row", () => {
    const { errors } = parseGradedRows([{ case_revision_id: "x", system_answer: "", veredicto: "regular", motivo: "", datos_clave_estado: "quizá" }]);
    expect(errors).toEqual([{ rowNumber: 2, errors: ["case_revision_id_invalid", "veredicto_invalid", "system_answer_required", "motivo_required", "datos_clave_estado_invalid"] }]);
  });
});

describe("matchGradedRows", () => {
  it("requires every question of the test set exactly once", () => {
    const { rows } = parseGradedRows([
      { case_revision_id: id(1), system_answer: "a", veredicto: "parcial", motivo: "m" },
      { case_revision_id: id(1), system_answer: "a", veredicto: "parcial", motivo: "m" },
      { case_revision_id: id(9), system_answer: "a", veredicto: "parcial", motivo: "m" },
    ]);
    expect(matchGradedRows(rows, [id(1), id(2)])).toEqual({
      errors: [{ rowNumber: 3, errors: ["duplicate_case_revision_id"] }, { rowNumber: 4, errors: ["case_revision_mismatch"] }],
      missing: [id(2)],
    });
  });
});

describe("tabularRecords", () => {
  it("reads semicolon CSV as saved by Spanish spreadsheet apps", async () => {
    const csv = "﻿case_revision_id;system_answer;veredicto;motivo\r\n" + `${id(1)};"Sí; 1.000 €";correcta;ok\r\n`;
    const { records } = await tabularRecords(new TextEncoder().encode(csv), "csv");
    expect(records).toEqual([{ case_revision_id: id(1), system_answer: "Sí; 1.000 €", veredicto: "correcta", motivo: "ok" }]);
  });
});
