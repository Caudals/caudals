from __future__ import annotations

from datetime import datetime, timezone
from hashlib import sha256
import json
from typing import Any

import dagster as dg


def _stable_json(value: Any) -> str:
    return json.dumps(value, sort_keys=True, separators=(",", ":"))


def _content_hash(value: Any) -> str:
    return sha256(_stable_json(value).encode("utf-8")).hexdigest()


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
    return report


@dg.asset(
    group_name="caudals_reference_build",
    deps=[silver_profile_report],
    description="G-7 QA scorecard for the reference build path.",
    metadata={
        "pipeline_stage": "G-7 QA",
        "blueprint_section": "13 QA and quality scoring",
    },
    tags={"caudals/build_class": "reference", "caudals/gate": "G-7"},
)
def gold_qa_scorecard(
    context,
    silver_profile_report: dict[str, Any],
) -> dict[str, Any]:
    scorecard = {
        "composite_score": 0.93,
        "dimensions": {
            "completeness": 1.0,
            "validity": 0.98,
            "privacy": 1.0,
            "representativeness": 0.74,
        },
        "verdict": "review",
        "record_count": silver_profile_report["record_count"],
        "schema_fingerprint": silver_profile_report["schema_fingerprint"],
    }
    context.add_output_metadata(
        {
            "composite_score": scorecard["composite_score"],
            "verdict": scorecard["verdict"],
            "gate": "G-7",
        }
    )
    return scorecard


reference_build_job = dg.define_asset_job(
    name="caudals_reference_build",
    selection=[
        bronze_intake_sample,
        silver_profile_report,
        gold_qa_scorecard,
    ],
    tags={"caudals/build_class": "reference"},
)

defs = dg.Definitions(
    assets=[
        bronze_intake_sample,
        silver_profile_report,
        gold_qa_scorecard,
    ],
    jobs=[reference_build_job],
)
