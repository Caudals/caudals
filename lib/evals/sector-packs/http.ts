import "server-only";
import { EvalError } from "../domain/errors";
import type { EvalIdentity } from "../domain/identity";
import { sectorPacksEnabled } from "./flags";
import { packRole, requirePackAuthor } from "./store";

/** Every sector pack route answers 404 while SECTOR_PACKS_ENABLED is off. */
export function requireSectorPacks() {
  if (!sectorPacksEnabled()) throw new EvalError("SCOPE_DENIED", 404);
}

/** Staff and verified experts (pack authoring); returns the actor's pack role. */
export async function requirePackAuthorIdentity(identity: EvalIdentity) {
  requireSectorPacks();
  const role = await packRole(identity.user.id, identity.platformRole);
  requirePackAuthor(role);
  return role;
}
