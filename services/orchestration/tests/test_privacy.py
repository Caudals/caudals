import unittest

from caudals_ops.privacy import (
    build_pii_map,
    evaluate_k_anonymity,
    scan_text_for_pii,
)


class PrivacyRuntimeTest(unittest.TestCase):
    def test_scan_text_for_pii_redacts_samples(self):
        findings = scan_text_for_pii(
            "Contact maria@example.com, EMP-123456, or ES9121000418450200051332.",
            enable_presidio=False,
            enable_spacy=False,
        )

        entity_types = {finding.entity_type for finding in findings}
        self.assertTrue({"email", "employee_id", "iban"}.issubset(entity_types))
        email_sample = next(
            finding.sample for finding in findings if finding.entity_type == "email"
        )
        self.assertNotIn("example.com", email_sample)

    def test_evaluate_k_anonymity_flags_small_buckets(self):
        risk = evaluate_k_anonymity(
            [
                {"zip3": "280", "age_band": "30-39"},
                {"zip3": "280", "age_band": "30-39"},
                {"zip3": "080", "age_band": "60-69"},
            ],
            ["zip3", "age_band"],
            threshold=3,
        )

        self.assertEqual(risk.min_k, 1)
        self.assertTrue(risk.high_risk)

    def test_build_pii_map_combines_findings_treatments_and_coverage(self):
        pii_map = build_pii_map(
            [
                {
                    "row_id": "1",
                    "notes": "Receipt owner maria@example.com",
                    "zip3": "280",
                    "age_band": "30-39",
                }
            ],
            text_fields=["notes"],
            quasi_identifier_columns=["zip3", "age_band"],
        )

        self.assertEqual(
            pii_map["coverage_report"],
            {
                "scanned_records": 1,
                "scanned_fields": ["notes"],
                "coverage": 1.0,
            },
        )
        self.assertEqual(pii_map["findings"][0]["field"], "notes")
        self.assertEqual(pii_map["treatments"]["notes"], "mask")
        self.assertEqual(pii_map["treatments"]["zip3"], "generalize")


if __name__ == "__main__":
    unittest.main()
