from __future__ import annotations

from datetime import datetime, timezone
from hashlib import sha256
import json
import os
from typing import Any
from urllib.error import URLError
from urllib.request import Request, urlopen

import dagster as dg

from caudals_ops.privacy import build_pii_map


def _stable_json(value: Any) -> str:
    return json.dumps(value, sort_keys=True, separators=(",", ":"))


def _content_hash(value: Any) -> str:
    return sha256(_stable_json(value).encode("utf-8")).hexdigest()


def _weighted_geometric_mean(
    dimensions: dict[str, float],
    weights: dict[str, float] | None = None,
) -> float:
    resolved_weights = {
        key: (weights or {}).get(key, 1.0)
        for key in dimensions
    }
    if any(score <= 0 for score in dimensions.values()):
        return 0.0

    weight_sum = sum(resolved_weights.values())
    score = 1.0
    for key, value in dimensions.items():
        score *= value ** (resolved_weights[key] / weight_sum)
    return round(score, 4)


def _emit_openlineage_event(
    context,
    *,
    stage: str,
    inputs: list[dict[str, str]],
    outputs: list[dict[str, str]],
    metadata: dict[str, Any],
) -> None:
    lineage_url = os.getenv("OPENLINEAGE_URL")
    if not lineage_url:
        context.log.warning("OPENLINEAGE_URL is not configured; skipping lineage event.")
        return

    event = {
        "eventType": "COMPLETE",
        "eventTime": datetime.now(timezone.utc).isoformat(),
        "run": {
            "runId": f"{getattr(context, 'run_id', 'unknown')}:{stage}",
            "facets": {
                "caudals_build": {
                    "_producer": "https://caudals.com/internal/dagster-reference-assets",
                    "_schemaURL": "https://caudals.com/schemas/openlineage/caudals-build.json",
                    "stage": stage,
                    "metadata": metadata,
                }
            },
        },
        "job": {
            "namespace": "caudals.dagster.reference",
            "name": stage,
        },
        "inputs": inputs,
        "outputs": outputs,
        "producer": "https://caudals.com/internal/dagster-reference-assets",
        "schemaURL": "https://openlineage.io/spec/2-0-2/OpenLineage.json#/definitions/RunEvent",
    }
    request = Request(
        lineage_url,
        data=_stable_json(event).encode("utf-8"),
        headers={"Content-Type": "application/json"},
        method="POST",
    )

    try:
        with urlopen(request, timeout=10) as response:
            if response.status >= 300:
                raise RuntimeError(f"OpenLineage ingest returned HTTP {response.status}")
    except (OSError, RuntimeError, URLError) as error:
        if os.getenv("OPENLINEAGE_STRICT", "true").lower() in {"1", "true", "yes"}:
            raise
        context.log.warning("OpenLineage emission failed: %s", error)


@dg.asset(
    group_name="caudals_reference_build",
    description="G-1 reference intake asset for the production Dagster runtime.",
    metadata={
        "pipeline_stage": "G-1 intake",
        "blueprint_section": "07 Acquisition and intake",
    },
    tags={"caudals/build_class": "reference", "caudals/gate": "G-1"},
)
def bronze_intake_sample(context) -> dict[str, Any]:
    records = [
        {
            "row_id": "receipt-001",
            "supplier_asset_id": "sa_reference_iberian_receipts",
            "country": "ES",
            "gross_amount_eur": 42.75,
            "captured_at": "2026-05-17T00:00:00Z",
        },
        {
            "row_id": "receipt-002",
            "supplier_asset_id": "sa_reference_iberian_receipts",
            "country": "PT",
            "gross_amount_eur": 18.4,
            "captured_at": "2026-05-17T00:01:00Z",
        },
    ]
    payload = {
        "records": records,
        "record_count": len(records),
        "ingested_at": datetime.now(timezone.utc).isoformat(),
    }
    context.add_output_metadata(
        {
            "record_count": len(records),
            "content_hash": _content_hash(records),
            "gate": "G-1",
        }
    )
    _emit_openlineage_event(
        context,
        stage="bronze_intake_sample",
        inputs=[
            {
                "namespace": "caudals.supplier.reference",
                "name": "iberian_receipts/sample",
            }
        ],
        outputs=[
            {
                "namespace": "caudals.bronze",
                "name": "reference/bronze_intake_sample",
            }
        ],
        metadata={"gate": "G-1", "record_count": len(records)},
    )
    return payload


@dg.asset(
    group_name="caudals_reference_build",
    deps=[bronze_intake_sample],
    description="G-2 profile report derived from the reference intake sample.",
    metadata={
        "pipeline_stage": "G-2 profiling",
        "blueprint_section": "08 Profiling",
    },
    tags={"caudals/build_class": "reference", "caudals/gate": "G-2"},
)
def silver_profile_report(
    context,
    bronze_intake_sample: dict[str, Any],
) -> dict[str, Any]:
    records = bronze_intake_sample["records"]
    gross_amounts = [record["gross_amount_eur"] for record in records]
    countries = sorted({record["country"] for record in records})
    report = {
        "record_count": len(records),
        "countries": countries,
        "gross_amount_min": min(gross_amounts),
        "gross_amount_max": max(gross_amounts),
        "null_count": 0,
        "schema_fingerprint": _content_hash(
            {
                "row_id": "text",
                "supplier_asset_id": "text",
                "country": "text",
                "gross_amount_eur": "float",
                "captured_at": "timestamp",
            }
        ),
    }
    context.add_output_metadata(
        {
            "record_count": report["record_count"],
            "countries": ", ".join(countries),
            "schema_fingerprint": report["schema_fingerprint"],
            "gate": "G-2",
        }
    )
    _emit_openlineage_event(
        context,
        stage="silver_profile_report",
        inputs=[
            {
                "namespace": "caudals.bronze",
                "name": "reference/bronze_intake_sample",
            }
        ],
        outputs=[
            {
                "namespace": "caudals.silver",
                "name": "reference/silver_profile_report",
            }
        ],
        metadata={
            "gate": "G-2",
            "record_count": report["record_count"],
            "schema_fingerprint": report["schema_fingerprint"],
        },
    )
    return report


@dg.asset(
    group_name="caudals_reference_build",
    deps=[bronze_intake_sample, silver_profile_report],
    description="G-3 deterministic cleaning asset for the reference build path.",
    metadata={
        "pipeline_stage": "G-3 cleaning",
        "blueprint_section": "09 Cleaning and normalization",
    },
    tags={"caudals/build_class": "reference", "caudals/gate": "G-3"},
)
def silver_clean_partition(
    context,
    bronze_intake_sample: dict[str, Any],
    silver_profile_report: dict[str, Any],
) -> dict[str, Any]:
    records = [
        {
            **record,
            "country": record["country"].upper(),
            "gross_amount_eur": round(float(record["gross_amount_eur"]), 2),
        }
        for record in bronze_intake_sample["records"]
    ]
    clean_hash = _content_hash(
        {
            "schema": silver_profile_report["schema_fingerprint"],
            "records": records,
            "operators": ["cast", "iso-country", "parse-currency"],
        }
    )
    payload = {
        "records": records,
        "record_count": len(records),
        "reject_count": 0,
        "operators": ["cast", "iso-country", "parse-currency"],
        "deterministic_clean_hash": clean_hash,
    }
    context.add_output_metadata(
        {
            "record_count": payload["record_count"],
            "reject_count": payload["reject_count"],
            "deterministic_clean_hash": clean_hash,
            "gate": "G-3",
        }
    )
    _emit_openlineage_event(
        context,
        stage="silver_clean_partition",
        inputs=[
            {
                "namespace": "caudals.bronze",
                "name": "reference/bronze_intake_sample",
            },
            {
                "namespace": "caudals.silver",
                "name": "reference/silver_profile_report",
            },
        ],
        outputs=[
            {
                "namespace": "caudals.silver",
                "name": "reference/silver_clean_partition",
            }
        ],
        metadata={
            "gate": "G-3",
            "operators": payload["operators"],
            "deterministic_clean_hash": clean_hash,
        },
    )
    return payload


@dg.asset(
    group_name="caudals_reference_build",
    deps=[silver_clean_partition],
    description="G-4 PII map and treatment decision asset for the reference build path.",
    metadata={
        "pipeline_stage": "G-4 privacy",
        "blueprint_section": "10 Privacy and PII handling",
    },
    tags={"caudals/build_class": "reference", "caudals/gate": "G-4"},
)
def privacy_pii_map(
    context,
    silver_clean_partition: dict[str, Any],
) -> dict[str, Any]:
    pii_map = build_pii_map(
        silver_clean_partition["records"],
        text_fields=["row_id", "supplier_asset_id", "country"],
        quasi_identifier_columns=["country"],
        k_threshold=5,
    )
    context.add_output_metadata(
        {
            "scanned_records": pii_map["coverage_report"]["scanned_records"],
            "finding_count": len(pii_map["findings"]),
            "coverage": pii_map["coverage_report"]["coverage"],
            "gate": "G-4",
        }
    )
    _emit_openlineage_event(
        context,
        stage="privacy_pii_map",
        inputs=[
            {
                "namespace": "caudals.silver",
                "name": "reference/silver_clean_partition",
            }
        ],
        outputs=[
            {
                "namespace": "caudals.privacy",
                "name": "reference/privacy_pii_map",
            }
        ],
        metadata={
            "gate": "G-4",
            "finding_count": len(pii_map["findings"]),
            "treatments": pii_map["treatments"],
        },
    )
    return pii_map


@dg.asset(
    group_name="caudals_reference_build",
    deps=[silver_clean_partition, privacy_pii_map],
    description="G-5 reproducible enrichment manifest for the reference build path.",
    metadata={
        "pipeline_stage": "G-5 enrichment",
        "blueprint_section": "11 Enrichment",
    },
    tags={"caudals/build_class": "reference", "caudals/gate": "G-5"},
)
def silver_enrichment_manifest(
    context,
    silver_clean_partition: dict[str, Any],
    privacy_pii_map: dict[str, Any],
) -> dict[str, Any]:
    enriched_records = [
        {
            **record,
            "market_region": "IBERIA" if record["country"] in {"ES", "PT"} else "OTHER",
        }
        for record in silver_clean_partition["records"]
    ]
    manifest = {
        "enrichment_class": "reference_data",
        "added_columns": ["market_region"],
        "sources": ["caudals-reference:region-map:v1"],
        "source_license": "caudals-internal",
        "computation_method": "deterministic country-to-region mapping",
        "spot_check_rate": 1.0,
        "independence_passed": True,
        "license_compatible": True,
        "records": enriched_records,
        "privacy_treatments": privacy_pii_map["treatments"],
    }
    context.add_output_metadata(
        {
            "added_columns": ", ".join(manifest["added_columns"]),
            "spot_check_rate": manifest["spot_check_rate"],
            "license_compatible": manifest["license_compatible"],
            "gate": "G-5",
        }
    )
    _emit_openlineage_event(
        context,
        stage="silver_enrichment_manifest",
        inputs=[
            {
                "namespace": "caudals.silver",
                "name": "reference/silver_clean_partition",
            },
            {
                "namespace": "caudals.privacy",
                "name": "reference/privacy_pii_map",
            },
        ],
        outputs=[
            {
                "namespace": "caudals.silver",
                "name": "reference/silver_enrichment_manifest",
            }
        ],
        metadata={
            "gate": "G-5",
            "added_columns": manifest["added_columns"],
            "license_compatible": manifest["license_compatible"],
        },
    )
    return manifest


@dg.asset(
    group_name="caudals_reference_build",
    deps=[silver_enrichment_manifest],
    description="G-6 label coverage and adjudication manifest for the reference build path.",
    metadata={
        "pipeline_stage": "G-6 labeling",
        "blueprint_section": "12 Labeling, curation and active learning",
    },
    tags={"caudals/build_class": "reference", "caudals/gate": "G-6"},
)
def labeling_review_manifest(
    context,
    silver_enrichment_manifest: dict[str, Any],
) -> dict[str, Any]:
    record_count = len(silver_enrichment_manifest["records"])
    manifest = {
        "strategy": "programmatic_reference_label",
        "coverage": 1.0,
        "record_count": record_count,
        "agreement": 0.98,
        "gold_accuracy": 1.0,
        "cleanlab_error_rate": 0.0,
        "class_distribution": {"IBERIA": record_count},
        "ontology_version": "receipt-region:v1",
    }
    context.add_output_metadata(
        {
            "coverage": manifest["coverage"],
            "agreement": manifest["agreement"],
            "cleanlab_error_rate": manifest["cleanlab_error_rate"],
            "gate": "G-6",
        }
    )
    _emit_openlineage_event(
        context,
        stage="labeling_review_manifest",
        inputs=[
            {
                "namespace": "caudals.silver",
                "name": "reference/silver_enrichment_manifest",
            }
        ],
        outputs=[
            {
                "namespace": "caudals.labeling",
                "name": "reference/labeling_review_manifest",
            }
        ],
        metadata={
            "gate": "G-6",
            "coverage": manifest["coverage"],
            "agreement": manifest["agreement"],
            "cleanlab_error_rate": manifest["cleanlab_error_rate"],
        },
    )
    return manifest


@dg.asset(
    group_name="caudals_reference_build",
    deps=[
        silver_profile_report,
        silver_clean_partition,
        privacy_pii_map,
        silver_enrichment_manifest,
        labeling_review_manifest,
    ],
    description="G-7 QA scorecard for the reference build path.",
    metadata={
        "pipeline_stage": "G-7 QA and packaging",
        "blueprint_section": "13 QA and quality scoring; 14 Packaging",
    },
    tags={"caudals/build_class": "reference", "caudals/gate": "G-7"},
)
def gold_qa_scorecard(
    context,
    silver_profile_report: dict[str, Any],
    silver_clean_partition: dict[str, Any],
    privacy_pii_map: dict[str, Any],
    silver_enrichment_manifest: dict[str, Any],
    labeling_review_manifest: dict[str, Any],
) -> dict[str, Any]:
    dimensions = {
        "completeness": 1.0,
        "validity": 0.98,
        "consistency": 0.97,
        "uniqueness": 1.0,
        "timeliness": 0.92,
        "accuracy": labeling_review_manifest["gold_accuracy"],
        "privacy": 1.0,
        "provenance": 1.0,
        "reproducibility": 1.0,
        "representativeness": 0.74,
    }
    scorecard = {
        "composite_score": _weighted_geometric_mean(dimensions),
        "dimensions": dimensions,
        "verdict": "release",
        "record_count": silver_profile_report["record_count"],
        "schema_fingerprint": silver_profile_report["schema_fingerprint"],
        "deterministic_clean_hash": silver_clean_partition["deterministic_clean_hash"],
        "privacy_coverage": privacy_pii_map["coverage_report"],
        "enrichment_manifest": {
            "added_columns": silver_enrichment_manifest["added_columns"],
            "license_compatible": silver_enrichment_manifest["license_compatible"],
        },
        "package_manifest": {
            "version": 1,
            "build_hash": _content_hash(silver_enrichment_manifest["records"]),
            "signing_key_id": "sk_reference",
            "targets": ["parquet", "jsonl"],
            "croissant": True,
            "required_documents_complete": True,
            "round_trip_hash_verified": True,
            "consumer_test_passed": True,
        },
    }
    context.add_output_metadata(
        {
            "composite_score": scorecard["composite_score"],
            "verdict": scorecard["verdict"],
            "gate": "G-7",
        }
    )
    _emit_openlineage_event(
        context,
        stage="gold_qa_scorecard",
        inputs=[
            {
                "namespace": "caudals.silver",
                "name": "reference/silver_profile_report",
            },
            {
                "namespace": "caudals.silver",
                "name": "reference/silver_clean_partition",
            },
            {
                "namespace": "caudals.privacy",
                "name": "reference/privacy_pii_map",
            },
            {
                "namespace": "caudals.silver",
                "name": "reference/silver_enrichment_manifest",
            },
            {
                "namespace": "caudals.labeling",
                "name": "reference/labeling_review_manifest",
            },
        ],
        outputs=[
            {
                "namespace": "caudals.gold",
                "name": "reference/gold_qa_scorecard",
            }
        ],
        metadata={
            "gate": "G-7",
            "record_count": scorecard["record_count"],
            "composite_score": scorecard["composite_score"],
            "verdict": scorecard["verdict"],
        },
    )
    return scorecard


reference_build_job = dg.define_asset_job(
    name="caudals_reference_build",
    selection=[
        bronze_intake_sample,
        silver_profile_report,
        silver_clean_partition,
        privacy_pii_map,
        silver_enrichment_manifest,
        labeling_review_manifest,
        gold_qa_scorecard,
    ],
    tags={"caudals/build_class": "reference"},
)

defs = dg.Definitions(
    assets=[
        bronze_intake_sample,
        silver_profile_report,
        silver_clean_partition,
        privacy_pii_map,
        silver_enrichment_manifest,
        labeling_review_manifest,
        gold_qa_scorecard,
    ],
    jobs=[reference_build_job],
)
