/** First-run onboarding (launch L-06): read on the server at request time (web) or per tick (scheduler). Off unless `ONBOARDING_AUTOSTART=true`. */
export function onboardingEnabled(env: Record<string, string | undefined> = process.env) {
  return env.ONBOARDING_AUTOSTART === "true";
}
