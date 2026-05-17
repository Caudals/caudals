from __future__ import annotations

from dataclasses import asdict, dataclass
import json
import os
import re
from typing import Any, Iterable


@dataclass(frozen=True)
class PiiFinding:
    detector_id: str
    entity_type: str
    start: int
    end: int
    confidence: float
    sample: str
    treatment: str


@dataclass(frozen=True)
class QuasiIdentifierRisk:
    columns: tuple[str, ...]
    min_k: int
    threshold: int
    high_risk: bool
    bucket_count: int


PATTERN_DETECTORS: tuple[dict[str, Any], ...] = (
    {
        "detector_id": "presidio.email",
        "entity_type": "email",
        "pattern": re.compile(r"[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}", re.I),
        "confidence": 0.98,
        "treatment": "mask",
    },
    {
        "detector_id": "presidio.phone",
        "entity_type": "phone",
        "pattern": re.compile(r"(?:\+?\d[\s().-]?){8,}\d"),
        "confidence": 0.86,
        "treatment": "hash",
    },
    {
        "detector_id": "presidio.iban",
        "entity_type": "iban",
        "pattern": re.compile(r"\b[A-Z]{2}\d{2}[A-Z0-9]{11,30}\b", re.I),
        "confidence": 0.96,
        "treatment": "tokenize",
    },
    {
        "detector_id": "presidio.credit-card",
        "entity_type": "credit_card",
        "pattern": re.compile(r"\b(?:\d[ -]*?){13,19}\b"),
        "confidence": 0.92,
        "treatment": "drop",
    },
    {
        "detector_id": "presidio.ssn",
        "entity_type": "ssn",
        "pattern": re.compile(r"\b\d{3}-\d{2}-\d{4}\b"),
        "confidence": 0.93,
        "treatment": "drop",
    },
    {
        "detector_id": "custom.employee-id",
        "entity_type": "employee_id",
        "pattern": re.compile(r"\b(?:EMP|HR|STAFF)-\d{4,12}\b", re.I),
        "confidence": 0.82,
        "treatment": "pseudonymize",
    },
)


def _redact_sample(value: str) -> str:
    prefix = value[: min(4, len(value))]
    redacted_length = max(4, min(len(value), 12))
    return prefix.ljust(redacted_length, "*")


def _pattern_findings(text: str) -> list[PiiFinding]:
    findings: list[PiiFinding] = []
    for detector in PATTERN_DETECTORS:
        for match in detector["pattern"].finditer(text):
            findings.append(
                PiiFinding(
                    detector_id=detector["detector_id"],
                    entity_type=detector["entity_type"],
                    start=match.start(),
                    end=match.end(),
                    confidence=detector["confidence"],
                    sample=_redact_sample(match.group(0)),
                    treatment=detector["treatment"],
                )
            )
    return findings


def _presidio_findings(text: str, language: str) -> list[PiiFinding]:
    try:
        from presidio_analyzer import AnalyzerEngine  # type: ignore
    except ImportError:
        return []

    try:
        analyzer = AnalyzerEngine()
        results = analyzer.analyze(text=text, language=language)
    except Exception:
        return []

    findings: list[PiiFinding] = []
    for result in results:
        entity_type = str(result.entity_type).lower()
        findings.append(
            PiiFinding(
                detector_id=f"presidio.{entity_type}",
                entity_type=entity_type,
                start=int(result.start),
                end=int(result.end),
                confidence=float(result.score),
                sample=_redact_sample(text[int(result.start) : int(result.end)]),
                treatment="mask",
            )
        )
    return findings


def _spacy_findings(text: str, model_name: str | None) -> list[PiiFinding]:
    try:
        import spacy  # type: ignore
    except ImportError:
        return []

    try:
        nlp = spacy.load(model_name or os.getenv("CAUDALS_SPACY_MODEL", "en_core_web_sm"))
    except Exception:
        return []

    if "ner" not in nlp.pipe_names:
        return []

    findings: list[PiiFinding] = []
    for entity in nlp(text).ents:
        if entity.label_ not in {"PERSON", "ORG", "GPE", "LOC"}:
            continue
        findings.append(
            PiiFinding(
                detector_id="spacy.person-org-location",
                entity_type=entity.label_.lower(),
                start=int(entity.start_char),
                end=int(entity.end_char),
                confidence=0.72,
                sample=_redact_sample(entity.text),
                treatment="review",
            )
        )
    return findings


def dedupe_findings(findings: Iterable[PiiFinding]) -> list[PiiFinding]:
    deduped: dict[tuple[int, int, str], PiiFinding] = {}
    for finding in findings:
        key = (finding.start, finding.end, finding.entity_type)
        current = deduped.get(key)
        if current is None or finding.confidence > current.confidence:
            deduped[key] = finding
    return sorted(deduped.values(), key=lambda item: (item.start, item.end, item.entity_type))


def scan_text_for_pii(
    text: str,
    *,
    language: str = "en",
    enable_presidio: bool | None = None,
    enable_spacy: bool | None = None,
    spacy_model: str | None = None,
) -> list[PiiFinding]:
    presidio_enabled = (
        os.getenv("CAUDALS_PRESIDIO_ENABLED", "false").lower() in {"1", "true", "yes"}
        if enable_presidio is None
        else enable_presidio
    )
    spacy_enabled = (
        os.getenv("CAUDALS_SPACY_NER_ENABLED", "false").lower() in {"1", "true", "yes"}
        if enable_spacy is None
        else enable_spacy
    )
    findings = [*_pattern_findings(text)]
    if presidio_enabled:
        findings.extend(_presidio_findings(text, language))
    if spacy_enabled:
        findings.extend(_spacy_findings(text, spacy_model))
    return dedupe_findings(findings)


def evaluate_k_anonymity(
    rows: Iterable[dict[str, Any]],
    columns: Iterable[str],
    *,
    threshold: int = 5,
) -> QuasiIdentifierRisk:
    column_tuple = tuple(columns)
    buckets: dict[str, int] = {}
    total = 0
    for row in rows:
        total += 1
        key = "|".join(json.dumps(row.get(column), sort_keys=True) for column in column_tuple)
        buckets[key] = buckets.get(key, 0) + 1

    bucket_sizes = list(buckets.values())
    min_k = min(bucket_sizes) if bucket_sizes else 0
    return QuasiIdentifierRisk(
        columns=column_tuple,
        min_k=min_k,
        threshold=threshold,
        high_risk=total > 0 and min_k < threshold,
        bucket_count=len(buckets),
    )


def build_pii_map(
    records: list[dict[str, Any]],
    *,
    text_fields: Iterable[str],
    quasi_identifier_columns: Iterable[str] = (),
    k_threshold: int = 5,
) -> dict[str, Any]:
    fields = tuple(text_fields)
    findings: list[dict[str, Any]] = []
    treatments: dict[str, str] = {}

    for row_index, record in enumerate(records):
        for field in fields:
            value = record.get(field)
            if value is None:
                continue
            for finding in scan_text_for_pii(str(value)):
                finding_payload = asdict(finding)
                finding_payload["row_index"] = row_index
                finding_payload["field"] = field
                findings.append(finding_payload)
                treatments[field] = finding.treatment

    qid_columns = tuple(quasi_identifier_columns)
    risk = (
        evaluate_k_anonymity(records, qid_columns, threshold=k_threshold)
        if qid_columns
        else None
    )
    if risk and risk.high_risk:
        for column in qid_columns:
            treatments.setdefault(column, "generalize")

    return {
        "detectors": [
            "presidio.patterns",
            "presidio.analyzer.optional",
            "spacy.ner.optional",
            "privacy.k-anonymity",
        ],
        "findings": findings,
        "treatments": treatments,
        "coverage_report": {
            "scanned_records": len(records),
            "scanned_fields": list(fields),
            "coverage": 1.0 if records else 0.0,
        },
        "quasi_identifier_risk": asdict(risk) if risk else None,
        "residual_risk": (
            "PII findings require operator treatment review."
            if findings or (risk and risk.high_risk)
            else "No direct identifiers detected by configured runtime."
        ),
        "reverse_map_vault_ref": "kms://caudals/privacy/reverse-map",
    }


def _self_test() -> int:
    pii_map = build_pii_map(
        [
            {
                "row_id": "1",
                "notes": "Contact maria@example.com or EMP-123456.",
                "zip3": "280",
                "age_band": "30-39",
            }
        ],
        text_fields=["notes"],
        quasi_identifier_columns=["zip3", "age_band"],
    )
    if len(pii_map["findings"]) < 2:
        print("privacy runtime self-test failed: expected email and employee id findings")
        return 1
    if not pii_map["quasi_identifier_risk"]["high_risk"]:
        print("privacy runtime self-test failed: expected high quasi-identifier risk")
        return 1
    print(json.dumps({"ok": True, "findings": len(pii_map["findings"])}, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(_self_test())
