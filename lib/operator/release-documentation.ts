export const requiredReleaseDocumentKeys = [
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

export type RequiredReleaseDocumentKey =
  (typeof requiredReleaseDocumentKeys)[number];

export type ReleaseDocumentationInput = {
  dataset: {
    id: string;
    name: string;
    modality: string;
  };
  version: {
    id: string;
    label: string;
    manifestUri: string;
    contentHash: string;
    recordCount?: number | null;
    sizeBytes?: number | null;
    qaScore?: number | null;
    releasedAt?: string | null;
  };
  build?: {
    id?: string | null;
    title?: string | null;
    state?: string | null;
  };
  catalogue?: {
    id?: string | null;
    title?: string | null;
    visibility?: "public" | "partner" | "private" | string | null;
    licenseTier?: string | null;
    refreshCadence?: string | null;
    samplePreviewUri?: string | null;
  };
  license?: {
    spdxId?: string | null;
    permits?: Record<string, unknown> | null;
    geo?: string[] | null;
  };
  quality?: {
    dimensions?: Record<string, unknown> | null;
    score?: number | null;
    verdict?: string | null;
  };
  privacy?: {
    state?: string | null;
    findings?: Record<string, unknown> | null;
    treatments?: Record<string, unknown> | null;
  };
  lineage?: Array<{
    namespace: string;
    jobName: string;
    runId?: string | null;
    eventTime?: string | null;
  }>;
  modalityContract?: {
    canonicalFormat?: string | null;
    packagingTargets?: string[] | null;
    qaDimensions?: string[] | null;
    privacyTreatments?: string[] | null;
  };
  signingKeyId?: string | null;
  documentationUri?: string | null;
  hfMirror?: {
    namespace?: string | null;
    repoId?: string | null;
    url?: string | null;
    status?: string | null;
    license?: string | null;
  };
};

export type ReleaseDocumentationBundle = {
  packageManifest: Record<string, unknown>;
  croissantManifest: Record<string, unknown>;
  article10Document: Record<string, unknown>;
  requiredDocuments: Record<RequiredReleaseDocumentKey, Record<string, unknown>>;
  hfMirror: Record<string, unknown>;
  documentationUri: string | null;
  validationSummary: {
    status: "pass" | "blocked";
    missing: string[];
  };
};

function slugify(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

function compactRecord<T extends Record<string, unknown>>(record: T): T {
  return Object.fromEntries(
    Object.entries(record).filter(([, value]) => {
      if (value === null || value === undefined || value === "") {
        return false;
      }

      if (Array.isArray(value)) {
        return value.length > 0;
      }

      return true;
    })
  ) as T;
}

function defaultLicense(input: ReleaseDocumentationInput) {
  return (
    input.license?.spdxId ??
    input.catalogue?.licenseTier ??
    "supplier-contract"
  );
}

export function buildCroissantManifest(input: ReleaseDocumentationInput) {
  const fields = [
    {
      "@type": "cr:Field",
      name: "record_id",
      dataType: "sc:Text",
      description: "Stable Caudals record identifier.",
    },
    {
      "@type": "cr:Field",
      name: "payload",
      dataType: "sc:Text",
      description: `${input.dataset.modality} canonical record payload or object reference.`,
    },
  ];

  return compactRecord({
    "@context": {
      "@vocab": "https://schema.org/",
      cr: "http://mlcommons.org/croissant/",
      sc: "https://schema.org/",
    },
    "@type": "Dataset",
    conformsTo: "http://mlcommons.org/croissant/1.0",
    name: input.dataset.name,
    description:
      input.catalogue?.title ??
      `${input.dataset.name} ${input.version.label} release`,
    identifier: input.version.id,
    version: input.version.label,
    license: defaultLicense(input),
    datePublished: input.version.releasedAt,
    distribution: [
      compactRecord({
        "@type": "DataDownload",
        name: `${input.dataset.name} package manifest`,
        contentUrl: input.version.manifestUri,
        encodingFormat: "application/json",
        sha256: input.version.contentHash,
        contentSize: input.version.sizeBytes,
      }),
    ],
    recordSet: [
      compactRecord({
        "@type": "cr:RecordSet",
        name: `${slugify(input.dataset.name) || input.dataset.id}-records`,
        key: "record_id",
        field: fields,
      }),
    ],
  });
}

export function buildArticle10Document(input: ReleaseDocumentationInput) {
  return {
    dataGovernance: compactRecord({
      datasetId: input.dataset.id,
      datasetVersionId: input.version.id,
      sourceManifestUri: input.version.manifestUri,
      license: defaultLicense(input),
      permittedUses: input.license?.permits ?? {},
      geographicScope: input.license?.geo ?? ["WW"],
    }),
    dataSources: {
      lineage: input.lineage ?? [],
      supplierEvidence:
        input.modalityContract?.canonicalFormat ??
        `${input.dataset.modality} canonical representation`,
    },
    relevanceRepresentativeness: compactRecord({
      recordCount: input.version.recordCount,
      modality: input.dataset.modality,
      qualityScore: input.version.qaScore ?? input.quality?.score,
      declaredLimitations:
        "Representativeness is bounded by supplier coverage, buyer scope, and documented privacy treatments.",
    }),
    biasTesting: compactRecord({
      qaDimensions: input.modalityContract?.qaDimensions ?? [],
      qualityVerdict: input.quality?.verdict,
      qualityDimensions: input.quality?.dimensions ?? {},
    }),
    preprocessing: {
      privacyTreatments: input.modalityContract?.privacyTreatments ?? [],
      piiFindings: input.privacy?.findings ?? {},
      piiTreatments: input.privacy?.treatments ?? {},
    },
    traceability: compactRecord({
      contentHash: input.version.contentHash,
      buildId: input.build?.id,
      buildState: input.build?.state,
      signingKeyId: input.signingKeyId,
    }),
    limitations: [
      "Documentation supports buyer diligence and audit review; final regulated-system validation remains buyer-specific.",
    ],
  };
}

function buildRequiredDocuments(
  input: ReleaseDocumentationInput,
  croissantManifest: Record<string, unknown>,
  article10Document: Record<string, unknown>
): ReleaseDocumentationBundle["requiredDocuments"] {
  return {
    datasetCard: compactRecord({
      name: input.dataset.name,
      modality: input.dataset.modality,
      version: input.version.label,
      purpose:
        input.catalogue?.title ??
        `${input.dataset.name} curated dataset release`,
      intendedUse: input.license?.permits ?? {},
      limitations: article10Document.limitations,
    }),
    datasheet: compactRecord({
      motivation: "Buyer-ready AI dataset packaged by Caudals operators.",
      composition: {
        recordCount: input.version.recordCount,
        modality: input.dataset.modality,
      },
      collection: article10Document.dataSources,
      preprocessing: article10Document.preprocessing,
      uses: input.license?.permits ?? {},
    }),
    croissantManifest: {
      embedded: true,
      conformsTo: croissantManifest.conformsTo,
      identifier: croissantManifest.identifier,
    },
    schemaDataDictionary: {
      fields: ["record_id", "payload"],
      canonicalFormat:
        input.modalityContract?.canonicalFormat ??
        `${input.dataset.modality} canonical records`,
    },
    qualityScorecard: compactRecord({
      score: input.version.qaScore ?? input.quality?.score,
      verdict: input.quality?.verdict,
      dimensions: input.quality?.dimensions ?? {},
    }),
    lineageProvenanceSummary: {
      contentHash: input.version.contentHash,
      lineage: input.lineage ?? [],
    },
    licensePermittedUseSummary: {
      license: defaultLicense(input),
      permits: input.license?.permits ?? {},
      geo: input.license?.geo ?? ["WW"],
    },
    privacySummary: {
      state: input.privacy?.state ?? "review",
      findings: input.privacy?.findings ?? {},
      treatments: input.privacy?.treatments ?? {},
    },
    refreshPolicy: {
      cadence: input.catalogue?.refreshCadence ?? "one_shot",
      deprecationPolicy: "Superseded dataset versions remain auditable.",
    },
    samplePreview: {
      uri: input.catalogue?.samplePreviewUri ?? null,
      policy:
        input.catalogue?.visibility === "public"
          ? "public listing preview gate"
          : "private delivery preview gate",
    },
  };
}

function buildHfMirror(input: ReleaseDocumentationInput) {
  const isPublic = input.catalogue?.visibility === "public";
  const repoId =
    input.hfMirror?.repoId ??
    (isPublic ? `${slugify(input.dataset.name) || input.dataset.id}` : null);
  const namespace = input.hfMirror?.namespace ?? (isPublic ? "caudals" : null);

  if (!isPublic) {
    return {
      status: "not_applicable",
      reason: "HF mirrors are reserved for public catalogue listings.",
    };
  }

  return compactRecord({
    status: input.hfMirror?.status ?? "planned",
    namespace,
    repoId,
    url:
      input.hfMirror?.url ??
      (namespace && repoId
        ? `https://huggingface.co/datasets/${namespace}/${repoId}`
        : null),
    license: input.hfMirror?.license ?? defaultLicense(input),
  });
}

export function buildReleaseDocumentationBundle(
  input: ReleaseDocumentationInput
): ReleaseDocumentationBundle {
  const croissantManifest = buildCroissantManifest(input);
  const article10Document = buildArticle10Document(input);
  const requiredDocuments = buildRequiredDocuments(
    input,
    croissantManifest,
    article10Document
  );
  const hfMirror = buildHfMirror(input);
  const packageManifest = compactRecord({
    version: 1,
    datasetVersionId: input.version.id,
    buildHash: input.version.contentHash,
    signingKeyId: input.signingKeyId,
    documentationUri: input.documentationUri,
    requiredDocuments: requiredReleaseDocumentKeys,
    croissant: croissantManifest,
    article10: article10Document,
    hfMirror,
  });
  const validation = validateReleaseDocumentationBundle({
    packageManifest,
    croissantManifest,
    article10Document,
    requiredDocuments,
    hfMirror,
  });

  return {
    packageManifest,
    croissantManifest,
    article10Document,
    requiredDocuments,
    hfMirror,
    documentationUri: input.documentationUri ?? null,
    validationSummary: {
      status: validation.ok ? "pass" : "blocked",
      missing: validation.missing,
    },
  };
}

export function isReleaseDocumentationEnabled() {
  return process.env.RELEASE_DOCUMENTATION_ENABLED !== "false";
}

export function validateReleaseDocumentationBundle(
  bundle: Pick<
    ReleaseDocumentationBundle,
    | "packageManifest"
    | "croissantManifest"
    | "article10Document"
    | "requiredDocuments"
    | "hfMirror"
  >
) {
  const missing: string[] = [];

  if (!isReleaseDocumentationEnabled()) {
    missing.push("feature_flag");
  }

  for (const key of requiredReleaseDocumentKeys) {
    if (!bundle.requiredDocuments[key]) {
      missing.push(`required_documents.${key}`);
    }
  }

  if (!bundle.croissantManifest["@context"] || !bundle.croissantManifest["@type"]) {
    missing.push("croissant_manifest");
  }

  if (!bundle.article10Document.dataGovernance) {
    missing.push("article10_document.dataGovernance");
  }

  if (!bundle.article10Document.biasTesting) {
    missing.push("article10_document.biasTesting");
  }

  if (!bundle.article10Document.relevanceRepresentativeness) {
    missing.push("article10_document.relevanceRepresentativeness");
  }

  if (!bundle.packageManifest.croissant) {
    missing.push("package_manifest.croissant");
  }

  if (bundle.hfMirror.status !== "not_applicable") {
    for (const key of ["namespace", "repoId", "url", "license"]) {
      if (!bundle.hfMirror[key]) {
        missing.push(`hf_mirror.${key}`);
      }
    }
  }

  return {
    ok: missing.length === 0,
    missing,
  };
}
