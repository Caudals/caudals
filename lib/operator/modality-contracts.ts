export type M2Modality = "video" | "audio" | "geospatial";

export type ModalityContractTemplate = {
  modality: M2Modality;
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

export const m2Modalities = ["video", "audio", "geospatial"] as const;

export const modalityContractTemplates: Record<
  M2Modality,
  ModalityContractTemplate
> = {
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
};

export function isM2Modality(value: string): value is M2Modality {
  return m2Modalities.includes(value as M2Modality);
}

export function getModalityContractTemplate(
  modality: string
): ModalityContractTemplate | null {
  return isM2Modality(modality) ? modalityContractTemplates[modality] : null;
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

  if (!isM2Modality(contract.modality)) {
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
