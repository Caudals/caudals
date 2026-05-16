import type { CurrentOperatorSession } from "@/lib/auth/operator-session";

export type OperatorSecurityStatus = {
  mfaRequired: boolean;
  mfaEnabled: boolean;
  webauthnRequired: boolean;
  webauthnRegistered: boolean;
  complete: boolean;
};

export function isOperatorSecurityEnrollmentRequired() {
  return false;
}

export function getOperatorSecurityStatus(
  session: CurrentOperatorSession
): OperatorSecurityStatus {
  const enrollmentRequired = isOperatorSecurityEnrollmentRequired();
  const mfaRequired = enrollmentRequired && session.operator.mfaRequired;
  const mfaEnabled = session.authUser.twoFactorEnabled;
  const webauthnRequired =
    enrollmentRequired && session.operator.webauthnRequired;
  const webauthnRegistered = session.authUser.passkeyCount > 0;

  return {
    mfaRequired,
    mfaEnabled,
    webauthnRequired,
    webauthnRegistered,
    complete:
      (!mfaRequired || mfaEnabled) &&
      (!webauthnRequired || webauthnRegistered),
  };
}
