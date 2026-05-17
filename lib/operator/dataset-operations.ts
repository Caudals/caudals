export type DatasetModality =
  | "tabular"
  | "text"
  | "image"
  | "video"
  | "audio"
  | "geospatial"
  | "timeseries"
  | "document";

export type PipelineGateKey =
  | "G-1"
  | "G-2"
  | "G-3"
  | "G-4"
  | "G-5"
  | "G-6"
  | "G-7";

export type PipelineGateContract = {
  key: PipelineGateKey;
  label: string;
  blueprintSection: string;
  requiredEvidence: string[];
  optionalEvidence?: string[];
};

export const pipelineGateOrder = [
  "G-1",
  "G-2",
  "G-3",
  "G-4",
  "G-5",
  "G-6",
  "G-7",
] as const satisfies readonly PipelineGateKey[];

export const pipelineGateContracts: Record<PipelineGateKey, PipelineGateContract> = {
  "G-1": {
    key: "G-1",
    label: "Acquisition and intake",
    blueprintSection: "07",
    requiredEvidence: [
      "provenanceManifest",
      "permittedUseDeclaration",
      "sensitivityFlag",
      "refreshDeclaration",
      "retentionPosture",
    ],
  },
  "G-2": {
    key: "G-2",
    label: "Profiling",
    blueprintSection: "08",
    requiredEvidence: [
      "schemaFingerprint",
      "suspectedPiiColumnsReviewed",
      "formatAnomaliesResolved",
      "volumeWithinEnvelope",
      "suitabilityCall",
    ],
  },
  "G-3": {
    key: "G-3",
    label: "Cleaning and normalization",
    blueprintSection: "09",
    requiredEvidence: [
      "geSuitePassed",
      "panderaValidated",
      "rejectRateWithinTolerance",
      "sampleDiffReviewed",
      "deterministicCleanHash",
    ],
  },
  "G-4": {
    key: "G-4",
    label: "Privacy and PII handling",
    blueprintSection: "10",
    requiredEvidence: [
      "piiMapReviewed",
      "coverageReport",
      "residualRiskNote",
      "reverseMapVaultRef",
    ],
    optionalEvidence: ["dpiaReference"],
  },
  "G-5": {
    key: "G-5",
    label: "Enrichment",
    blueprintSection: "11",
    requiredEvidence: [
      "enrichmentManifest",
      "spotCheckPassed",
      "independencePassed",
      "licenseCompatible",
    ],
  },
  "G-6": {
    key: "G-6",
    label: "Labeling, curation and active learning",
    blueprintSection: "12",
    requiredEvidence: [
      "coverageComplete",
      "interAnnotatorAgreement",
      "goldAccuracy",
      "cleanlabErrorRate",
      "classDistributionReviewed",
    ],
  },
  "G-7": {
    key: "G-7",
    label: "QA, packaging and release evidence",
    blueprintSection: "13-14",
    requiredEvidence: [
      "qualityScorecard",
      "exceptionReport",
      "roundTripHashVerified",
      "packageManifest",
      "requiredDocumentsComplete",
      "consumerTestPassed",
      "croissantManifest",
    ],
  },
};

export type CleaningOperatorClass =
  | "type_repair"
  | "encoding"
  | "whitespace_case"
  | "units"
  | "identifiers"
  | "geo"
  | "deduplication"
  | "missing_value"
  | "outliers"
  | "schema_conformance"
  | "image"
  | "video"
  | "audio";

export type CleaningOperatorSpec = {
  id: string;
  class: CleaningOperatorClass;
  modalities: readonly DatasetModality[];
  deterministic: true;
  testsRequired: true;
  operator: string;
  defaultAction: "repair" | "flag" | "reject" | "transform";
  requiresApproval?: boolean;
};

export const datasetModalities = [
  "tabular",
  "text",
  "image",
  "video",
  "audio",
  "geospatial",
  "timeseries",
  "document",
] as const satisfies readonly DatasetModality[];

const allModalities = datasetModalities;

export function isDatasetModality(value: string): value is DatasetModality {
  return (datasetModalities as readonly string[]).includes(value);
}

const structuredModalities = [
  "tabular",
  "timeseries",
  "document",
  "geospatial",
] as const satisfies readonly DatasetModality[];

function op(
  id: string,
  operatorClass: CleaningOperatorClass,
  modalities: readonly DatasetModality[],
  defaultAction: CleaningOperatorSpec["defaultAction"],
  requiresApproval = false
): CleaningOperatorSpec {
  return {
    id,
    class: operatorClass,
    modalities,
    deterministic: true,
    testsRequired: true,
    operator: id,
    defaultAction,
    requiresApproval,
  };
}

export const cleaningOperatorRegistry = [
  op("cast", "type_repair", structuredModalities, "repair"),
  op("parse-date", "type_repair", structuredModalities, "repair"),
  op("parse-numeric", "type_repair", structuredModalities, "repair"),
  op("parse-currency", "type_repair", ["tabular", "document"], "repair"),
  op("infer-from-pattern", "type_repair", structuredModalities, "flag", true),
  op("utf8-canonicalize", "encoding", allModalities, "repair"),
  op("mojibake-fix", "encoding", ["text", "document", "tabular"], "repair"),
  op("bom-strip", "encoding", ["text", "document", "tabular"], "repair"),
  op("line-ending-normalize", "encoding", ["text", "document", "tabular"], "repair"),
  op("trim", "whitespace_case", ["text", "document", "tabular"], "repair"),
  op("collapse", "whitespace_case", ["text", "document", "tabular"], "repair"),
  op("lower", "whitespace_case", ["text", "document", "tabular"], "repair"),
  op("title", "whitespace_case", ["text", "document", "tabular"], "repair"),
  op("sentence", "whitespace_case", ["text", "document"], "repair"),
  op("convert-currency", "units", ["tabular", "document"], "transform", true),
  op("convert-temperature", "units", ["tabular", "timeseries"], "transform"),
  op("convert-distance", "units", ["tabular", "geospatial", "timeseries"], "transform"),
  op("normalize-time-zone", "units", ["tabular", "timeseries", "geospatial"], "transform"),
  op("e164-phone", "identifiers", ["tabular", "text", "document"], "repair"),
  op("iso-country", "identifiers", ["tabular", "document", "geospatial"], "repair"),
  op("iso-currency", "identifiers", ["tabular", "document"], "repair"),
  op("iban-validate", "identifiers", ["tabular", "text", "document"], "flag"),
  op("vat-validate", "identifiers", ["tabular", "text", "document"], "flag"),
  op("geocode", "geo", ["tabular", "geospatial"], "transform", true),
  op("reverse-geocode", "geo", ["tabular", "geospatial"], "transform", true),
  op("h3-bin", "geo", ["tabular", "geospatial"], "transform"),
  op("country-from-coords", "geo", ["tabular", "geospatial"], "repair"),
  op("exact-key", "deduplication", allModalities, "flag"),
  op("fuzzy-block", "deduplication", ["tabular", "text", "document"], "flag"),
  op("perceptual-hash", "deduplication", ["image", "video", "document"], "flag"),
  op("embedding-near-dup", "deduplication", ["text", "image", "video", "audio", "document"], "flag", true),
  op("drop", "missing_value", structuredModalities, "reject", true),
  op("sentinel", "missing_value", structuredModalities, "repair"),
  op("group-mode", "missing_value", ["tabular"], "repair", true),
  op("regression-impute", "missing_value", ["tabular", "timeseries"], "repair", true),
  op("llm-fill", "missing_value", ["text", "document"], "repair", true),
  op("iqr-clip", "outliers", ["tabular", "timeseries"], "flag"),
  op("zscore-clip", "outliers", ["tabular", "timeseries"], "flag"),
  op("isolation-forest-flag", "outliers", ["tabular", "timeseries"], "flag", true),
  op("rename", "schema_conformance", structuredModalities, "transform"),
  op("project", "schema_conformance", structuredModalities, "transform"),
  op("reorder", "schema_conformance", structuredModalities, "transform"),
  op("type-coerce-strict", "schema_conformance", structuredModalities, "reject"),
  op("image-reencode", "image", ["image"], "transform"),
  op("exif-strip", "image", ["image"], "repair"),
  op("rotation-tag-resolve", "image", ["image"], "repair"),
  op("corrupt-frame-flag", "image", ["image", "video"], "flag"),
  op("video-remux", "video", ["video"], "transform"),
  op("fps-normalize", "video", ["video"], "transform"),
  op("keyframe-extract", "video", ["video"], "transform"),
  op("audio-resample", "audio", ["audio", "video"], "transform"),
  op("loudness-normalize", "audio", ["audio", "video"], "transform"),
  op("id3-strip", "audio", ["audio"], "repair"),
  op("voice-activity-segment", "audio", ["audio", "video"], "transform"),
] as const satisfies readonly CleaningOperatorSpec[];

export function validateCleaningOperatorLibrary() {
  const missing: string[] = [];
  const requiredClasses: CleaningOperatorClass[] = [
    "type_repair",
    "encoding",
    "whitespace_case",
    "units",
    "identifiers",
    "geo",
    "deduplication",
    "missing_value",
    "outliers",
    "schema_conformance",
    "image",
    "video",
    "audio",
  ];

  if (cleaningOperatorRegistry.length < 30) {
    missing.push("operator_count");
  }

  for (const operatorClass of requiredClasses) {
    if (!cleaningOperatorRegistry.some((operator) => operator.class === operatorClass)) {
      missing.push(`class.${operatorClass}`);
    }
  }

  for (const operator of cleaningOperatorRegistry) {
    if (!operator.deterministic) {
      missing.push(`deterministic.${operator.id}`);
    }
    if (!operator.testsRequired) {
      missing.push(`tests.${operator.id}`);
    }
    if (operator.modalities.length === 0) {
      missing.push(`modalities.${operator.id}`);
    }
  }

  return { ok: missing.length === 0, missing };
}

export function getCleaningOperatorsForModality(modality: DatasetModality) {
  return cleaningOperatorRegistry.filter((operator) =>
    (operator.modalities as readonly DatasetModality[]).includes(modality)
  );
}

export type PiiDetectorKind =
  | "presidio_pattern"
  | "spacy_ner"
  | "custom_recognizer"
  | "modality_detector"
  | "quasi_identifier";

export type PiiDetectorSpec = {
  id: string;
  kind: PiiDetectorKind;
  entityTypes: readonly string[];
  modalities: readonly DatasetModality[];
  pattern?: RegExp;
  confidence: number;
};

export const piiDetectorPool = [
  {
    id: "presidio.email",
    kind: "presidio_pattern",
    entityTypes: ["email"],
    modalities: ["tabular", "text", "document"],
    pattern: /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi,
    confidence: 0.98,
  },
  {
    id: "presidio.phone",
    kind: "presidio_pattern",
    entityTypes: ["phone"],
    modalities: ["tabular", "text", "document", "audio"],
    pattern: /(?:\+?\d[\s().-]?){8,}\d/g,
    confidence: 0.86,
  },
  {
    id: "presidio.iban",
    kind: "presidio_pattern",
    entityTypes: ["iban"],
    modalities: ["tabular", "text", "document"],
    pattern: /\b[A-Z]{2}\d{2}[A-Z0-9]{11,30}\b/gi,
    confidence: 0.96,
  },
  {
    id: "presidio.credit-card",
    kind: "presidio_pattern",
    entityTypes: ["credit_card"],
    modalities: ["tabular", "text", "document"],
    pattern: /\b(?:\d[ -]*?){13,19}\b/g,
    confidence: 0.92,
  },
  {
    id: "presidio.ssn",
    kind: "presidio_pattern",
    entityTypes: ["ssn"],
    modalities: ["tabular", "text", "document"],
    pattern: /\b\d{3}-\d{2}-\d{4}\b/g,
    confidence: 0.93,
  },
  {
    id: "custom.eu-national-id",
    kind: "custom_recognizer",
    entityTypes: ["national_id"],
    modalities: ["tabular", "text", "document"],
    pattern: /\b[A-Z]?\d{7,8}[A-Z]\b/gi,
    confidence: 0.78,
  },
  {
    id: "custom.employee-id",
    kind: "custom_recognizer",
    entityTypes: ["employee_id", "quasi_identifier"],
    modalities: ["tabular", "text", "document"],
    pattern: /\b(?:EMP|HR|STAFF)-\d{4,12}\b/gi,
    confidence: 0.82,
  },
  {
    id: "spacy.person-org-location",
    kind: "spacy_ner",
    entityTypes: ["person", "organization", "location"],
    modalities: ["tabular", "text", "document"],
    confidence: 0.72,
  },
  {
    id: "modality.face-license-plate",
    kind: "modality_detector",
    entityTypes: ["face", "license_plate", "screen_text"],
    modalities: ["image", "video"],
    confidence: 0.84,
  },
  {
    id: "modality.voice-biometric",
    kind: "modality_detector",
    entityTypes: ["voice_biometric"],
    modalities: ["audio", "video"],
    confidence: 0.8,
  },
  {
    id: "privacy.k-anonymity",
    kind: "quasi_identifier",
    entityTypes: ["quasi_identifier"],
    modalities: ["tabular", "timeseries", "geospatial"],
    confidence: 0.9,
  },
] as const satisfies readonly PiiDetectorSpec[];

export const privacyTreatmentPalette = [
  "drop",
  "mask",
  "hash",
  "tokenize",
  "pseudonymize",
  "generalize",
  "synthesize",
  "dp-noise",
  "blur-pixelate",
  "voice-swap",
] as const;

export type IntakeChannel =
  | "object_storage_share"
  | "database_snapshot"
  | "api_connector"
  | "warehouse_share"
  | "public_scraper"
  | "sftp"
  | "signed_upload_url"
  | "email_to_bucket"
  | "physical_media"
  | "webhook";

export type IntakeMode = "pull" | "push";

export type IntakeChannelContract = {
  channel: IntakeChannel;
  mode: IntakeMode;
  label: string;
  blueprintSection: "07";
  requiredConfig: readonly string[];
  requiredEvidence: readonly string[];
  guarantees: readonly string[];
};

const commonIntakeEvidence = [
  "senderIdentity",
  "contractRef",
  "jurisdiction",
  "objectUri",
  "sha256",
] as const;

export const intakeChannelContracts = {
  object_storage_share: {
    channel: "object_storage_share",
    mode: "pull",
    label: "Object storage share",
    blueprintSection: "07",
    requiredConfig: ["endpoint", "bucket", "prefix", "shortLivedCredentialRef"],
    requiredEvidence: [...commonIntakeEvidence, "sourceManifest"],
    guarantees: ["least_privilege_pull", "replayable_manifest", "bronze_seal"],
  },
  database_snapshot: {
    channel: "database_snapshot",
    mode: "pull",
    label: "Database snapshot",
    blueprintSection: "07",
    requiredConfig: ["engine", "readOnlyRoleRef", "snapshotQueryRef"],
    requiredEvidence: [...commonIntakeEvidence, "snapshotTimestamp", "rowCount"],
    guarantees: ["read_only_access", "repeatable_snapshot", "schema_fingerprint"],
  },
  api_connector: {
    channel: "api_connector",
    mode: "pull",
    label: "API connector",
    blueprintSection: "07",
    requiredConfig: ["baseUrl", "authRef", "cursorStrategy", "retryPolicy"],
    requiredEvidence: [...commonIntakeEvidence, "cursorCheckpoint", "replayWindow"],
    guarantees: ["cursor_replay", "rate_limited", "idempotent_fetch"],
  },
  warehouse_share: {
    channel: "warehouse_share",
    mode: "pull",
    label: "Warehouse share",
    blueprintSection: "07",
    requiredConfig: ["provider", "shareName", "readGrantRef"],
    requiredEvidence: [...commonIntakeEvidence, "shareSnapshot"],
    guarantees: ["provider_audit", "read_only_access", "schema_fingerprint"],
  },
  public_scraper: {
    channel: "public_scraper",
    mode: "pull",
    label: "Public scraper",
    blueprintSection: "07",
    requiredConfig: ["allowlistedDomain", "robotsPolicy", "rateLimit"],
    requiredEvidence: [...commonIntakeEvidence, "robotsSnapshot", "sourceUrlList"],
    guarantees: ["allowlisted_only", "robots_aware", "rate_limited"],
  },
  sftp: {
    channel: "sftp",
    mode: "push",
    label: "SFTP drop zone",
    blueprintSection: "07",
    requiredConfig: ["dropZone", "supplierSshKeyFingerprint", "eventSource"],
    requiredEvidence: [...commonIntakeEvidence, "dropEventId", "keyFingerprint"],
    guarantees: ["key_only_identity", "event_on_drop", "isolated_drop_zone"],
  },
  signed_upload_url: {
    channel: "signed_upload_url",
    mode: "push",
    label: "Signed upload URL",
    blueprintSection: "07",
    requiredConfig: ["uploadUrlId", "expiresAt", "supplierAssetId"],
    requiredEvidence: [...commonIntakeEvidence, "uploadRequestId", "contentLength"],
    guarantees: ["time_limited_upload", "supplier_asset_bound", "atomic_commit"],
  },
  email_to_bucket: {
    channel: "email_to_bucket",
    mode: "push",
    label: "Email to bucket",
    blueprintSection: "07",
    requiredConfig: ["verifiedSender", "mailboxRule", "bucketPrefix"],
    requiredEvidence: [...commonIntakeEvidence, "messageId", "verifiedSender"],
    guarantees: ["verified_sender_only", "small_artifact_only", "mail_audit"],
  },
  physical_media: {
    channel: "physical_media",
    mode: "push",
    label: "Physical encrypted media",
    blueprintSection: "07",
    requiredConfig: ["courierTrackingRef", "encryptionKeyRef", "custodyLocation"],
    requiredEvidence: [...commonIntakeEvidence, "custodyLog", "decryptionWitness"],
    guarantees: ["encrypted_at_rest", "camera_audited_chain", "manual_two_person_check"],
  },
  webhook: {
    channel: "webhook",
    mode: "push",
    label: "Supplier webhook",
    blueprintSection: "07",
    requiredConfig: ["webhookEndpoint", "signatureKeyRef", "deltaCursorStrategy"],
    requiredEvidence: [...commonIntakeEvidence, "eventId", "signatureVerified"],
    guarantees: ["signed_event", "replay_window", "idempotent_delta_pull"],
  },
} as const satisfies Record<IntakeChannel, IntakeChannelContract>;

export const intakeChannels = Object.keys(
  intakeChannelContracts
) as IntakeChannel[];

export const sensitivityFlags = [
  "PUBLIC",
  "CONFIDENTIAL",
  "PII-PRESENT",
  "PHI",
  "PCI",
  "SPECIAL-CATEGORY",
] as const;

export type SensitivityFlag = (typeof sensitivityFlags)[number];

export const refreshDeclarations = [
  "one_shot",
  "scheduled",
  "on_event",
  "perpetual",
] as const;

export type RefreshDeclaration = (typeof refreshDeclarations)[number];

export type IntakeManifestEvidence = Record<string, unknown>;

export type IntakeManifestInput = {
  intakeId?: string;
  supplierAssetId?: string;
  channel?: IntakeChannel;
  receivedAt?: string;
  receivedBy?: string;
  contractRef?: string;
  jurisdiction?: string;
  objectUri?: string;
  bytes?: number;
  sha256?: string;
  signedBySupplier?: boolean;
  caudalsSignature?: string;
  chainOfCustody?: readonly string[];
  permittedUseDeclaration?: Record<string, unknown>;
  sensitivityFlag?: SensitivityFlag;
  refreshDeclaration?: RefreshDeclaration;
  retentionPosture?: Record<string, unknown>;
  evidence?: IntakeManifestEvidence;
};

export type PiiFinding = {
  detectorId: string;
  type: string;
  start: number;
  end: number;
  confidence: number;
  sample: string;
};

function redactFindingSample(value: string) {
  const prefix = value.slice(0, Math.min(4, value.length));
  const redactedLength = Math.max(4, Math.min(value.length, 12));
  return prefix.padEnd(redactedLength, "*");
}

export function scanTextForPii(
  content: string,
  detectors: readonly PiiDetectorSpec[] = piiDetectorPool
): PiiFinding[] {
  return detectors.flatMap((detector) => {
    if (!detector.pattern) return [];

    const pattern = new RegExp(
      detector.pattern.source,
      detector.pattern.flags.includes("g")
        ? detector.pattern.flags
        : `${detector.pattern.flags}g`
    );

    return Array.from(content.matchAll(pattern))
      .slice(0, 25)
      .map((match) => ({
        detectorId: detector.id,
        type: detector.entityTypes[0] ?? "pii",
        start: match.index ?? 0,
        end: (match.index ?? 0) + match[0].length,
        confidence: detector.confidence,
        sample: redactFindingSample(match[0]),
      }));
  });
}

export function evaluateQuasiIdentifierRisk(
  rows: readonly Record<string, unknown>[],
  columns: readonly string[],
  threshold = 5
) {
  const buckets = new Map<string, number>();

  for (const row of rows) {
    const key = columns
      .map((column) => JSON.stringify(row[column] ?? null))
      .join("|");
    buckets.set(key, (buckets.get(key) ?? 0) + 1);
  }

  const bucketSizes = Array.from(buckets.values());
  const minK = bucketSizes.length === 0 ? 0 : Math.min(...bucketSizes);

  return {
    minK,
    threshold,
    highRisk: rows.length > 0 && minK < threshold,
    bucketCount: buckets.size,
  };
}

export type GateEvidence = Record<string, unknown> & {
  specialCategory?: boolean;
};

function hasEvidenceValue(value: unknown) {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return Number.isFinite(value);
  if (typeof value === "string") return value.trim().length > 0;
  if (Array.isArray(value)) return value.length > 0;
  if (value && typeof value === "object") return Object.keys(value).length > 0;
  return false;
}

export function evaluatePipelineGate(gate: PipelineGateKey, evidence: GateEvidence) {
  const contract = pipelineGateContracts[gate];
  const missing = contract.requiredEvidence.filter(
    (key) => !hasEvidenceValue(evidence[key])
  );

  if (gate === "G-4" && evidence.specialCategory && !hasEvidenceValue(evidence.dpiaReference)) {
    missing.push("dpiaReference");
  }

  return {
    ok: missing.length === 0,
    gate,
    label: contract.label,
    missing,
  };
}

function hasValidIsoTimestamp(value: unknown) {
  return (
    typeof value === "string" &&
    value.trim().length > 0 &&
    !Number.isNaN(Date.parse(value))
  );
}

function hasValidSha256(value: unknown) {
  return typeof value === "string" && /^[a-f0-9]{64}$/i.test(value);
}

function hasPositiveInteger(value: unknown) {
  return typeof value === "number" && Number.isInteger(value) && value > 0;
}

export function isIntakeChannel(value: string): value is IntakeChannel {
  return intakeChannels.includes(value as IntakeChannel);
}

export function validateIntakeChannelContracts() {
  const missing: string[] = [];
  const requiredChannels: IntakeChannel[] = [
    "object_storage_share",
    "database_snapshot",
    "api_connector",
    "warehouse_share",
    "public_scraper",
    "sftp",
    "signed_upload_url",
    "email_to_bucket",
    "physical_media",
    "webhook",
  ];

  for (const channel of requiredChannels) {
    const contract = intakeChannelContracts[channel];
    if (!contract) {
      missing.push(channel);
      continue;
    }

    if (!contract.requiredConfig.length) {
      missing.push(`${channel}.requiredConfig`);
    }
    if (!contract.requiredEvidence.length) {
      missing.push(`${channel}.requiredEvidence`);
    }
    if (!contract.guarantees.length) {
      missing.push(`${channel}.guarantees`);
    }
  }

  const modes = new Set(Object.values(intakeChannelContracts).map((contract) => contract.mode));
  if (!modes.has("pull")) missing.push("mode.pull");
  if (!modes.has("push")) missing.push("mode.push");

  return { ok: missing.length === 0, missing };
}

export function evaluateIntakeManifest(manifest: IntakeManifestInput) {
  const missing: string[] = [];
  const invalid: string[] = [];
  const evidence = manifest.evidence ?? {};

  for (const key of [
    "intakeId",
    "supplierAssetId",
    "channel",
    "receivedBy",
    "contractRef",
    "jurisdiction",
    "objectUri",
    "permittedUseDeclaration",
    "sensitivityFlag",
    "refreshDeclaration",
    "retentionPosture",
  ] as const) {
    if (!hasEvidenceValue(manifest[key])) missing.push(key);
  }

  if (!hasValidIsoTimestamp(manifest.receivedAt)) {
    missing.push("receivedAt");
  }

  if (!hasPositiveInteger(manifest.bytes)) {
    missing.push("bytes");
  }

  if (!hasValidSha256(manifest.sha256)) {
    missing.push("sha256");
  }

  if (manifest.signedBySupplier !== true) {
    missing.push("signedBySupplier");
  }

  if (!hasEvidenceValue(manifest.caudalsSignature)) {
    missing.push("caudalsSignature");
  }

  if (!manifest.chainOfCustody || manifest.chainOfCustody.length < 2) {
    missing.push("chainOfCustody");
  }

  if (manifest.channel && !intakeChannelContracts[manifest.channel]) {
    invalid.push("channel");
  }

  if (
    manifest.sensitivityFlag &&
    !sensitivityFlags.includes(manifest.sensitivityFlag)
  ) {
    invalid.push("sensitivityFlag");
  }

  if (
    manifest.refreshDeclaration &&
    !refreshDeclarations.includes(manifest.refreshDeclaration)
  ) {
    invalid.push("refreshDeclaration");
  }

  const channelContract = manifest.channel
    ? intakeChannelContracts[manifest.channel]
    : undefined;
  if (channelContract) {
    for (const requiredEvidence of channelContract.requiredEvidence) {
      const manifestValue =
        requiredEvidence in manifest
          ? manifest[requiredEvidence as keyof IntakeManifestInput]
          : undefined;
      if (
        !hasEvidenceValue(manifestValue) &&
        !hasEvidenceValue(evidence[requiredEvidence])
      ) {
        missing.push(`evidence.${requiredEvidence}`);
      }
    }
  }

  const uniqueMissing = Array.from(new Set(missing));
  const uniqueInvalid = Array.from(new Set(invalid));

  return {
    ok: uniqueMissing.length === 0 && uniqueInvalid.length === 0,
    gate: "G-1" as const,
    label: pipelineGateContracts["G-1"].label,
    channel: manifest.channel ?? null,
    mode: channelContract?.mode ?? null,
    requiredConfig: channelContract?.requiredConfig ?? [],
    guarantees: channelContract?.guarantees ?? [],
    missing: uniqueMissing,
    invalid: uniqueInvalid,
    quarantine: uniqueMissing.length > 0 || uniqueInvalid.length > 0,
    quarantineReasons: [
      ...uniqueMissing.map((key) => `missing:${key}`),
      ...uniqueInvalid.map((key) => `invalid:${key}`),
    ],
  };
}

export const qualityDimensionKeys = [
  "completeness",
  "validity",
  "consistency",
  "uniqueness",
  "timeliness",
  "accuracy",
  "representativeness",
  "privacy",
  "provenance",
  "reproducibility",
] as const;

export type QualityDimensionKey = (typeof qualityDimensionKeys)[number];

export type QualityScorecardInput = {
  dimensions: Record<QualityDimensionKey, number>;
  weights?: Partial<Record<QualityDimensionKey, number>>;
  releaseThreshold?: number;
  reviewFloor?: number;
  exceptions?: Array<{ code: string; detail: string }>;
};

function assertScore(value: number, key: string) {
  if (!Number.isFinite(value) || value < 0 || value > 1) {
    throw new Error(`${key} must be a number in [0,1]`);
  }
}

export function buildQualityScorecard(input: QualityScorecardInput) {
  const releaseThreshold = input.releaseThreshold ?? 0.85;
  const reviewFloor = input.reviewFloor ?? 0.7;
  const weights = Object.fromEntries(
    qualityDimensionKeys.map((key) => [key, input.weights?.[key] ?? 1])
  ) as Record<QualityDimensionKey, number>;

  let weightSum = 0;
  for (const key of qualityDimensionKeys) {
    assertScore(input.dimensions[key], key);
    if (!Number.isFinite(weights[key]) || weights[key] <= 0) {
      throw new Error(`${key} weight must be positive`);
    }
    weightSum += weights[key];
  }

  const composite = qualityDimensionKeys.some((key) => input.dimensions[key] === 0)
    ? 0
    : qualityDimensionKeys.reduce(
        (score, key) =>
          score * Math.pow(input.dimensions[key], weights[key] / weightSum),
        1
      );
  const roundedComposite = Number(composite.toFixed(4));
  const lowDimensions = qualityDimensionKeys.filter(
    (key) => input.dimensions[key] < reviewFloor
  );
  const verdict =
    roundedComposite >= releaseThreshold && lowDimensions.length === 0
      ? "release"
      : "review";

  return {
    composite: roundedComposite,
    dimensions: input.dimensions,
    weights,
    verdict,
    exceptions: [
      ...(input.exceptions ?? []),
      ...lowDimensions.map((key) => ({
        code: `LOW_${key.toUpperCase()}`,
        detail: `${key} is below the review floor ${reviewFloor}`,
      })),
    ],
  };
}

export const canonicalRepresentationByModality: Record<DatasetModality, string> = {
  tabular: "Iceberg + Parquet (zstd)",
  text: "Parquet + JSONL mirror",
  image: "Lance dataset + media references",
  video: "Lance index over MP4 chunks + frame manifests",
  audio: "Lance index over WAV/FLAC + segment manifests",
  geospatial: "STAC + GeoParquet + Cloud-Optimised GeoTIFF",
  timeseries: "Iceberg / Parquet partitioned by time + entity",
  document: "Parquet page records + original PDF references",
};

export const packagingTargetsByModality: Record<DatasetModality, readonly string[]> = {
  tabular: ["parquet", "csv", "delta_sharing", "snowflake", "rest_api"],
  text: ["jsonl", "hf_datasets", "parquet"],
  image: ["coco", "yolo", "lance", "webdataset", "tfrecord"],
  video: ["mp4_clips", "per_frame_manifest", "coco_video"],
  audio: ["wav", "flac", "jsonl_labels", "hf_audio"],
  geospatial: ["stac", "geoparquet", "cog", "mvt_tiles"],
  timeseries: ["parquet", "arrow_ipc", "rest_cursor"],
  document: ["parquet_pdf_bundle", "jsonl", "rest_query"],
};

export const requiredPackageDocuments = [
  "datasetCard",
  "datasheet",
  "croissantManifest",
  "schemaDataDictionary",
  "qualityScorecard",
  "lineageProvenanceSummary",
  "licensePermittedUseSummary",
  "privacySummary",
  "refreshPolicy",
  "samplePreview",
] as const;

export type PackageManifestDraft = {
  version?: number | string | null;
  buildHash?: string | null;
  signingKeyId?: string | null;
  croissant?: unknown;
  requiredDocuments?: Record<string, unknown> | string[];
  roundTripHashes?: Record<string, boolean>;
  consumerTests?: Record<string, { passed: boolean; detail?: string }>;
};

export function validatePackageManifest(manifest: PackageManifestDraft) {
  const missing: string[] = [];

  if (!hasEvidenceValue(manifest.version)) missing.push("version");
  if (!hasEvidenceValue(manifest.buildHash)) missing.push("buildHash");
  if (!hasEvidenceValue(manifest.signingKeyId)) missing.push("signingKeyId");
  if (!hasEvidenceValue(manifest.croissant)) missing.push("croissant");

  const documentKeys = Array.isArray(manifest.requiredDocuments)
    ? manifest.requiredDocuments
    : Object.keys(manifest.requiredDocuments ?? {});

  for (const key of requiredPackageDocuments) {
    if (!documentKeys.includes(key)) {
      missing.push(`requiredDocuments.${key}`);
    }
  }

  if (
    !manifest.roundTripHashes ||
    Object.keys(manifest.roundTripHashes).length === 0 ||
    Object.values(manifest.roundTripHashes).some((passed) => passed !== true)
  ) {
    missing.push("roundTripHashes");
  }

  if (
    !manifest.consumerTests ||
    Object.keys(manifest.consumerTests).length === 0 ||
    Object.values(manifest.consumerTests).some((test) => test.passed !== true)
  ) {
    missing.push("consumerTests");
  }

  return { ok: missing.length === 0, missing };
}

export type DatasetOperationPlanInput = {
  modality: DatasetModality;
  targetFormats?: readonly string[];
  profileSignals?: readonly string[];
};

export function planDatasetOperations(input: DatasetOperationPlanInput) {
  const canonicalFormat = canonicalRepresentationByModality[input.modality];
  const supportedTargets = packagingTargetsByModality[input.modality];
  const requestedTargets =
    input.targetFormats && input.targetFormats.length > 0
      ? input.targetFormats
      : supportedTargets.slice(0, 2);
  const unsupportedTargets = requestedTargets.filter(
    (target) => !supportedTargets.includes(target)
  );

  return {
    modality: input.modality,
    canonicalFormat,
    gates: pipelineGateOrder.map((key) => pipelineGateContracts[key]),
    cleaningOperators: getCleaningOperatorsForModality(input.modality).map(
      (operator) => operator.id
    ),
    piiDetectorPool: piiDetectorPool
      .filter((detector) =>
        (detector.modalities as readonly DatasetModality[]).includes(
          input.modality
        )
      )
      .map((detector) => ({
        id: detector.id,
        kind: detector.kind,
        entityTypes: detector.entityTypes,
      })),
    privacyTreatments: privacyTreatmentPalette,
    intakeChannels: intakeChannels.map((channel) => intakeChannelContracts[channel]),
    packagingTargets: requestedTargets,
    unsupportedTargets,
    profileSignals: input.profileSignals ?? [],
  };
}
