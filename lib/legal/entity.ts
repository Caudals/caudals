import "server-only";

import { isPlaceholderEntityValue } from "./placeholders";

/**
 * The company behind Caudals, as published in the legal notice (LSSI-CE art.
 * 10) and the DPA template.
 *
 * The data is read at request time from the app's runtime credentials
 * (`LEGAL_ENTITY_NAME`, `LEGAL_ENTITY_NIF`, `LEGAL_ENTITY_ADDRESS`,
 * `LEGAL_ENTITY_REGISTRY`; launch decision I-1), so the founder can publish it
 * without a code change. Until name, NIF and address are all set, pages name
 * the trade name and say the details follow on registration. A value that is
 * one of the spec's fictitious placeholders (§3.2) is treated as unset.
 */
export type LegalEntity = {
  name: string;
  nif: string;
  address: string;
  /** Commercial registry entry; optional while registration is pending. */
  registry: string | null;
};

type EntityEnv = Record<string, string | undefined>;

function read(value: string | undefined): string | null {
  const trimmed = value?.replace(/\s+/g, " ").trim();
  if (!trimmed || trimmed.length > 300 || isPlaceholderEntityValue(trimmed)) return null;
  return trimmed;
}

export function getLegalEntity(env: EntityEnv = process.env): LegalEntity | null {
  const name = read(env.LEGAL_ENTITY_NAME);
  const nif = read(env.LEGAL_ENTITY_NIF);
  const address = read(env.LEGAL_ENTITY_ADDRESS);
  if (!name || !nif || !address) return null;
  return { name, nif, address, registry: read(env.LEGAL_ENTITY_REGISTRY) };
}
