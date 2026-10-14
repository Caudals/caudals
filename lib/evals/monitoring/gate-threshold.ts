import { z } from "zod";

/**
 * A release gate's pass threshold (launch L-19, P-27): the share of scored
 * answers that must pass, in percent with at most two decimals, set on a test
 * set or a schedule; null removes it. No "server-only": schedules and the
 * scheduler import it.
 */
export const gateThresholdSchema = z.number().min(0).max(100)
  .refine(value => Math.round(value * 100) === value * 100, "Use at most two decimals.").nullable();
