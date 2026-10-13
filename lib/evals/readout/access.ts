/**
 * Who may use readout mode (launch L-35, spec P-57), from the server flag
 * `READOUT_MODE_ENABLED` and the person's role. Browser-safe: the report page
 * shows "Present" from this, and every readout API route checks the same
 * function on the server.
 *
 * - `operators`: platform operators and admins, and workspace operators.
 * - `all`: operators, plus owners and editors, who present without notes.
 *
 * Operators see and write the presenter notes and the transcript picks; the
 * database enforces the same rule for notes (migration 099 RLS).
 */
export type ReadoutMode = "off" | "operators" | "all";
export type ReadoutAccess = { present: boolean; notes: boolean; edit: boolean };

const NONE: ReadoutAccess = { present: false, notes: false, edit: false };

export function readoutAccess(mode: ReadoutMode, role: string | null | undefined, platformStaff: boolean): ReadoutAccess {
  if (mode === "off") return NONE;
  if (platformStaff || role === "operator") return { present: true, notes: true, edit: true };
  if (mode === "all" && (role === "owner" || role === "editor")) return { present: true, notes: false, edit: false };
  return NONE;
}
