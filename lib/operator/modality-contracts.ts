export type ModalityContractModality =
  | "tabular"
  | "text"
  | "image"
  | "video"
  | "audio"
  | "geospatial"
  | "document"
  | "timeseries";

export type ModalityContractTemplate = {
  modality: ModalityContractModality;
  canonicalFormat: string;
  profileSignals: string[];
  cleaningOperators: string[];
  privacyTreatments: string[];
  labelingWidgets: string[];
  qaDimensions: string[];
  packagingTargets: string[];
};

export type EnrichmentManifestDraft = {
  enrichmentClass: string;
  addedColumns: string[];
  sources: string[];
  sourceLicense: string;
  computationMethod: string;
  spotCheckRate?: number | null;
  independencePassed: boolean;
  licenseCompatible: boolean;
};

export const modalityContractModalities = [
  "tabular",
  "text",
  "image",
  "video",
  "audio",
  "geospatial",
  "document",
  "timeseries",
] as const;

export const modalityContractTemplates: Record<
  ModalityContractModality,
  ModalityContractTemplate
> = {
  tabular: {
    modality: "tabular",
    canonicalFormat: "Iceberg Parquet with zstd compression",
    profileSignals: [
      "row_count",
      "column_types",
      "null_rates",
      "cardinality",
      "key_uniqueness",
    ],
    cleaningOperators: [
      "parse_numeric",
      "parse_date",
      "iso_country",
      "exact_key",
      "type_coerce_strict",
    ],
    privacyTreatments: [
      "presidio_pattern_scan",
      "quasi_identifier_review",
      "hash",
      "generalize",
    ],
    labelingWidgets: ["grid_cell", "row_review", "schema_diff"],
    qaDimensions: [
      "completeness",
      "validity",
      "consistency",
      "uniqueness",
      "privacy_residual",
    ],
    packagingTargets: ["parquet", "csv", "snowflake_share", "rest_api"],
  },
  text: {
    modality: "text",
    canonicalFormat: "Parquet text records plus JSONL mirror",
    profileSignals: [
      "token_count",
      "language_mix",
      "length_distribution",
      "dedup_rate",
      "encoding_cleanliness",
    ],
    cleaningOperators: [
      "utf8_canonicalize",
      "mojibake_fix",
      "line_ending_normalize",
      "embedding_near_dup",
    ],
    privacyTreatments: [
      "spacy_ner_review",
      "presidio_pattern_scan",
      "mask",
      "pseudonymize",
    ],
    labelingWidgets: ["text_span", "classification", "relation"],
    qaDimensions: [
      "language_coverage",
      "deduplication",
      "toxicity_review",
      "privacy_residual",
      "contamination_review",
    ],
    packagingTargets: ["jsonl", "hf_datasets", "parquet_shards"],
  },
  image: {
    modality: "image",
    canonicalFormat: "Lance dataset with media references",
    profileSignals: [
      "resolution_histogram",
      "aspect_ratio",
      "format_inventory",
      "near_duplicate_rate",
      "exif_inventory",
    ],
    cleaningOperators: [
      "image_reencode",
      "exif_strip",
      "rotation_tag_resolve",
      "perceptual_hash",
    ],
    privacyTreatments: [
      "face_blur",
      "license_plate_blur",
      "gps_exif_strip",
      "screen_text_review",
    ],
    labelingWidgets: ["bounding_box", "polygon", "mask", "keypoint"],
    qaDimensions: [
      "image_quality",
      "annotation_iou",
      "class_balance",
      "privacy_residual",
    ],
    packagingTargets: ["coco", "yolo", "lance", "webdataset", "tfrecord"],
  },
  video: {
    modality: "video",
    canonicalFormat: "Lance index over MP4 chunks",
    profileSignals: [
      "duration_histogram",
      "fps",
      "codec",
      "resolution",
      "scene_change_density",
    ],
    cleaningOperators: [
      "temporal_dedup",
      "shot_change_sampling",
      "metadata_strip",
      "ffmpeg_transcode",
    ],
    privacyTreatments: [
      "face_blur",
      "license_plate_blur",
      "burnt_in_text_review",
      "audio_track_pii_review",
    ],
    labelingWidgets: ["bounding_box", "mask", "keyframe", "temporal_segment"],
    qaDimensions: [
      "temporal_coverage",
      "frame_quality",
      "annotation_density",
      "privacy_residual",
    ],
    packagingTargets: ["mp4_clips", "per_frame_manifest", "coco_video"],
  },
  audio: {
    modality: "audio",
    canonicalFormat: "WAV/FLAC plus Lance segment index",
    profileSignals: [
      "duration_histogram",
      "sample_rate",
      "channel_layout",
      "speaker_count_estimate",
      "noise_floor",
    ],
    cleaningOperators: [
      "resample",
      "silence_trim",
      "loudness_normalize",
      "segment_split",
    ],
    privacyTreatments: [
      "voice_biometric_review",
      "speaker_consent_check",
      "metadata_strip",
    ],
    labelingWidgets: ["audio_segment", "transcript_span", "event_marker"],
    qaDimensions: [
      "transcript_alignment",
      "speaker_balance",
      "signal_quality",
      "privacy_residual",
    ],
    packagingTargets: ["wav", "flac", "jsonl_labels", "hf_audio"],
  },
  geospatial: {
    modality: "geospatial",
    canonicalFormat: "STAC plus GeoParquet and Cloud Optimized GeoTIFF",
    profileSignals: [
      "bounding_box",
      "crs",
      "feature_density",
      "temporal_extent",
      "sensor_mix",
    ],
    cleaningOperators: [
      "crs_reconcile",
      "geometry_repair",
      "h3_bin",
      "tile_normalize",
    ],
    privacyTreatments: [
      "jurisdiction_embargo_check",
      "coordinate_precision_reduction",
      "sovereign_data_review",
    ],
    labelingWidgets: ["polygon", "raster_tile", "point_class", "temporal_extent"],
    qaDimensions: [
      "spatial_coverage",
      "crs_consistency",
      "edge_artifacts",
      "sensor_drift",
    ],
    packagingTargets: ["stac_catalog", "geoparquet", "cog", "mvt_tiles"],
  },
  document: {
    modality: "document",
    canonicalFormat: "Parquet page records plus original PDF references",
    profileSignals: [
      "page_count",
      "layout_type_inventory",
      "language_mix",
      "ocr_confidence",
      "tabular_data_ratio",
    ],
    cleaningOperators: [
      "ocr_normalize",
      "page_dedup",
      "layout_segment",
      "table_extract",
    ],
    privacyTreatments: [
      "signature_redaction",
      "printed_pii_redaction",
      "handwriting_review",
      "source_pdf_access_control",
    ],
    labelingWidgets: [
      "page_region",
      "field_extraction",
      "table_cell",
      "signature_presence",
    ],
    qaDimensions: [
      "layout_fidelity",
      "ocr_confidence",
      "field_accuracy",
      "redaction_residual",
    ],
    packagingTargets: ["page_parquet", "jsonl_fields", "pdf_bundle", "rest_query"],
  },
  timeseries: {
    modality: "timeseries",
    canonicalFormat: "Iceberg Parquet partitioned by event time and entity",
    profileSignals: [
      "sample_rate",
      "gap_distribution",
      "regime_changes",
      "seasonality_fingerprint",
      "sensor_drift",
    ],
    cleaningOperators: [
      "sample_rate_align",
      "gap_policy_apply",
      "clock_skew_correct",
      "outlier_window_flag",
    ],
    privacyTreatments: [
      "entity_pseudonymize",
      "location_precision_reduce",
      "blackout_window_apply",
    ],
    labelingWidgets: [
      "event_window",
      "anomaly_span",
      "regime_marker",
      "calibration_jump",
    ],
    qaDimensions: [
      "temporal_continuity",
      "gap_policy_compliance",
      "split_leakage",
      "sensor_drift",
    ],
    packagingTargets: ["time_partitioned_parquet", "arrow_ipc", "rest_cursor"],
  },
};

export function isModalityContractModality(
  value: string
): value is ModalityContractModality {
  return modalityContractModalities.includes(
    value as ModalityContractModality
  );
}

export function getModalityContractTemplate(
  modality: string
): ModalityContractTemplate | null {
  return isModalityContractModality(modality)
    ? modalityContractTemplates[modality]
    : null;
}

export function isModalityContractsEnabled() {
  return process.env.MODALITY_CONTRACTS_ENABLED !== "false";
}

export function validateModalityContractTemplate(
  contract: ModalityContractTemplate
) {
  const missing: string[] = [];

  if (!isModalityContractsEnabled()) {
    missing.push("feature_flag");
  }

  if (!isModalityContractModality(contract.modality)) {
    missing.push("modality");
  }

  for (const [key, value] of Object.entries({
    canonicalFormat: contract.canonicalFormat,
    profileSignals: contract.profileSignals,
    cleaningOperators: contract.cleaningOperators,
    privacyTreatments: contract.privacyTreatments,
    labelingWidgets: contract.labelingWidgets,
    qaDimensions: contract.qaDimensions,
    packagingTargets: contract.packagingTargets,
  })) {
    const present = Array.isArray(value) ? value.length > 0 : Boolean(value);
    if (!present) {
      missing.push(key);
    }
  }

  return {
    ok: missing.length === 0,
    missing,
  };
}

export function validateEnrichmentManifest(
  manifest: EnrichmentManifestDraft
) {
  const missing: string[] = [];

  if (!manifest.enrichmentClass) {
    missing.push("enrichment_class");
  }
  if (manifest.addedColumns.length === 0) {
    missing.push("added_columns");
  }
  if (manifest.sources.length === 0) {
    missing.push("sources");
  }
  if (!manifest.sourceLicense) {
    missing.push("source_license");
  }
  if (!manifest.computationMethod) {
    missing.push("computation_method");
  }
  if (
    manifest.spotCheckRate !== undefined &&
    manifest.spotCheckRate !== null &&
    (manifest.spotCheckRate < 0 || manifest.spotCheckRate > 1)
  ) {
    missing.push("spot_check_rate");
  }
  if (!manifest.independencePassed) {
    missing.push("independence_test");
  }
  if (!manifest.licenseCompatible) {
    missing.push("license_compatibility");
  }

  return {
    ok: missing.length === 0,
    missing,
  };
}
