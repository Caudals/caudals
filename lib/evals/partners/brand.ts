/**
 * White-label PDFs (launch L-28): a client report's PDF carries its partner's
 * logo when the partner is active, links the workspace and has a logo. The
 * stored file's path names the logo (`.b` + the first 8 hex of its SHA-256)
 * so a new or removed logo renders a fresh copy instead of serving the old one.
 */
export type PdfBrand = { partnerId: string; logoSha256: string };

export function brandSuffix(brand: PdfBrand | null | undefined): string {
  return brand ? `.b${brand.logoSha256.slice(0, 8)}` : "";
}
