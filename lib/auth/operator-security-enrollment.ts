export type OperatorSecurityEnrollmentRow = {
  id: string;
  orgId?: string | null;
  email: string;
  name: string;
  role: string;
  state: string;
  mfaRequired: boolean | null;
  mfaEnabled: boolean | null;
  webauthnRequired: boolean | null;
  passkeyCount: number | string | null;
  lastSessionAt?: string | Date | null;
  lastSessionExpiresAt?: string | Date | null;
};

export type OperatorSecurityEnrollmentEntry = {
  id: string;
  orgId: string | null;
  email: string;
  name: string;
  role: string;
  state: string;
  mfaRequired: boolean;
  mfaEnabled: boolean;
  webauthnRequired: boolean;
  passkeyCount: number;
  securityComplete: boolean;
  resetEligible: boolean;
  lastSessionAt: string | null;
  lastSessionExpiresAt: string | null;
};

export type OperatorSecurityEnrollmentSummary = {
  total: number;
  complete: number;
  actionNeeded: number;
  mfaRequired: number;
  mfaEnabled: number;
  webauthnRequired: number;
  passkeyUsers: number;
  resetEligible: number;
};

function normalizeDate(value: string | Date | null | undefined) {
  if (!value) {
    return null;
  }

  return value instanceof Date ? value.toISOString() : value;
}

function isFixtureOperatorEmail(email: string) {
  return email.toLowerCase().endsWith("@caudals.local");
}

export function mapOperatorSecurityEnrollmentRow(
  row: OperatorSecurityEnrollmentRow
): OperatorSecurityEnrollmentEntry {
  const mfaRequired = row.mfaRequired === true;
  const mfaEnabled = row.mfaEnabled === true;
  const webauthnRequired = row.webauthnRequired === true;
  const passkeyCount = Number(row.passkeyCount ?? 0);
  const securityComplete =
    (!mfaRequired || mfaEnabled) &&
    (!webauthnRequired || passkeyCount > 0);

  return {
    id: row.id,
    orgId: row.orgId ?? null,
    email: row.email,
    name: row.name,
    role: row.role,
    state: row.state,
    mfaRequired,
    mfaEnabled,
    webauthnRequired,
    passkeyCount,
    securityComplete,
    resetEligible:
      !securityComplete &&
      (mfaRequired || webauthnRequired) &&
      !isFixtureOperatorEmail(row.email),
    lastSessionAt: normalizeDate(row.lastSessionAt),
    lastSessionExpiresAt: normalizeDate(row.lastSessionExpiresAt),
  };
}

export function summarizeOperatorSecurityEnrollment(
  operators: OperatorSecurityEnrollmentEntry[]
): OperatorSecurityEnrollmentSummary {
  return {
    total: operators.length,
    complete: operators.filter((operator) => operator.securityComplete).length,
    actionNeeded: operators.filter((operator) => !operator.securityComplete)
      .length,
    mfaRequired: operators.filter((operator) => operator.mfaRequired).length,
    mfaEnabled: operators.filter((operator) => operator.mfaEnabled).length,
    webauthnRequired: operators.filter((operator) => operator.webauthnRequired)
      .length,
    passkeyUsers: operators.filter((operator) => operator.passkeyCount > 0)
      .length,
    resetEligible: operators.filter((operator) => operator.resetEligible)
      .length,
  };
}

export function isOperatorSecurityEnrollmentComplete(
  summary: OperatorSecurityEnrollmentSummary
) {
  return summary.actionNeeded === 0;
}

export function getResetEligibleOperators(
  operators: OperatorSecurityEnrollmentEntry[]
) {
  return operators.filter((operator) => operator.resetEligible);
}
