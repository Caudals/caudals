import type { MessageKey } from "../messages/en";

/**
 * Sectors a workspace can choose and packs can target (spec §7.3, D-12:
 * ICP-1 first, then insurance, energy and telco). Stored as these ids.
 */
export const SECTORS = ["fiscal_accounting_payroll", "legal", "hr", "insurance", "energy", "telco", "travel", "other"] as const;
export type Sector = (typeof SECTORS)[number];

export const SECTOR_LABELS: Record<Sector, MessageKey> = {
  fiscal_accounting_payroll: "sectorFiscalAccountingPayroll",
  legal: "sectorLegal",
  hr: "sectorHr",
  insurance: "sectorInsurance",
  energy: "sectorEnergy",
  telco: "sectorTelco",
  travel: "sectorTravel",
  other: "sectorOther",
};

export function isSector(value: unknown): value is Sector {
  return typeof value === "string" && (SECTORS as readonly string[]).includes(value);
}
