"use client";

import type { ReactNode } from "react";
import {
  Calculator,
  ClipboardCheck,
  FileSearch,
  Scale,
  Stethoscope,
  Wrench,
  type LucideIcon,
} from "lucide-react";
import { useTranslations } from "@/lib/i18n/context";
import type { DatasetKind } from "@/lib/sectors/content";

/** Who in the network writes, each with the tool of their trade. */
const ROLES: readonly { id: "adjusters" | "claims" | "lawyers" | "tax" | "engineers" | "clinicians"; icon: LucideIcon }[] = [
  { id: "adjusters", icon: FileSearch },
  { id: "claims", icon: ClipboardCheck },
  { id: "lawyers", icon: Scale },
  { id: "tax", icon: Calculator },
  { id: "engineers", icon: Wrench },
  { id: "clinicians", icon: Stethoscope },
];

type DataId = DatasetKind;

/** One glyph per kind of data our experts build, drawn on a 48 × 48 grid. */
const DATA: readonly { id: DataId; icon: ReactNode }[] = [
  {
    id: "qa",
    icon: (
      <>
        <path d="M8 12h24a4 4 0 0 1 4 4v8a4 4 0 0 1-4 4H18l-6 5v-5H8z" />
        <path d="M40 22h-2M22 36h16a4 4 0 0 0 4-4v-8" className="d" />
      </>
    ),
  },
  {
    id: "docs",
    icon: (
      <>
        <rect x="12" y="6" width="24" height="34" rx="1.5" />
        <path d="M17 14h14M17 20h14M17 26h8" />
        <path d="M26 30h10v10H26z" className="k" />
      </>
    ),
  },
  {
    id: "reasoning",
    icon: (
      <>
        <path d="M13 22l8-6M13 26l8 6M27 15l8 7M27 33l8-7" />
        <circle cx="10" cy="24" r="4" />
        <circle cx="24" cy="14" r="4" />
        <circle cx="24" cy="34" r="4" />
        <circle cx="38" cy="24" r="4" className="k" />
      </>
    ),
  },
  {
    id: "preferences",
    icon: (
      <>
        <rect x="8" y="10" width="32" height="10" rx="2" className="k" />
        <rect x="8" y="24" width="32" height="10" rx="2" />
        <path d="M12 40h24" className="d" />
      </>
    ),
  },
  {
    id: "exams",
    icon: (
      <>
        <rect x="8" y="8" width="10" height="10" />
        <rect x="20" y="8" width="10" height="10" />
        <rect x="32" y="8" width="10" height="10" className="k" />
        <rect x="8" y="20" width="10" height="10" />
        <rect x="20" y="20" width="10" height="10" className="k" />
        <rect x="32" y="20" width="10" height="10" className="k" />
      </>
    ),
  },
];

const DATA_ICONS = Object.fromEntries(DATA.map(({ id, icon }) => [id, icon])) as Record<DataId, ReactNode>;

type ExpertNetworkProps = {
  /** A sector page's own roles, each with its icon already resolved. */
  roles?: readonly { label: string; icon: LucideIcon }[];
  /** A sector page's own datasets, drawn with the shared glyphs. */
  datasets?: readonly { kind: DataId; name: string; description: string }[];
};

/**
 * Step 3: who in our network writes, and the data they build from what the
 * exam finds. The landing shows the whole network; a sector page its own part.
 */
export function ExpertNetwork({ roles, datasets }: ExpertNetworkProps = {}) {
  const t = useTranslations("steps.experts");
  const roleItems =
    roles ?? ROLES.map(({ id, icon }) => ({ label: t(`roles.${id}`), icon }));
  const dataItems =
    datasets ??
    DATA.map(({ id }) => ({
      kind: id,
      name: t(`data.${id}.name`),
      description: t(`data.${id}.description`),
    }));

  return (
    <div className="ex">
      <div>
        <p className="lp-label">{t("whoLabel")}</p>
        <ul className="ex-roles">
          {roleItems.map(({ label, icon: Icon }) => (
            <li key={label}>
              <Icon aria-hidden="true" strokeWidth={1.25} />
              {label}
            </li>
          ))}
        </ul>
      </div>
      <div>
        <p className="lp-label">{t("whatLabel")}</p>
        <ul className="ex-cat">
          {dataItems.map(({ kind, name, description }) => (
            <li key={name}>
              <svg viewBox="0 0 48 48" aria-hidden="true">
                {DATA_ICONS[kind]}
              </svg>
              <b>{name}</b>
              <span>{description}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
