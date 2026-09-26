import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { ImageResponse } from "next/og";
import { splitMarked } from "@/lib/marked-text";

/** Open Graph and Twitter card size. */
export const OG_SIZE = { width: 1200, height: 630 } as const;
export const OG_CONTENT_TYPE = "image/png";

const INK = "#141413";
const INK2 = "#3b3a36";
const MUTE = "#6b6a63";
const PAPER = "#f5f4f0";
const LINE = "#dcdad3";

/**
 * Brand fonts for the share images. `next/og` needs static TTF, OTF or WOFF —
 * not the woff2 that `next/font` serves, and not variable fonts — so the latin
 * subsets of the two OFL faces live in `assets/fonts/`.
 */
async function loadFonts() {
  const dir = join(process.cwd(), "assets/fonts");
  const [geist, newsreader] = await Promise.all([
    readFile(join(dir, "Geist-Regular-latin.woff")),
    readFile(join(dir, "Newsreader-Italic-latin.woff")),
  ]);
  return [
    { name: "Geist", data: geist, weight: 400 as const, style: "normal" as const },
    { name: "Newsreader", data: newsreader, weight: 400 as const, style: "italic" as const },
  ];
}

/** The three-bar mark, drawn from `public/caudals_logo_black.svg`. */
function Mark() {
  return (
    <svg width="40" height="40" viewBox="0 0 1080 1080">
      <path
        fill={INK}
        d="M77 221.441C77.0001 199.892 99.0446 185.37 118.844 193.877L304.477 273.638C315.493 278.372 322.633 289.211 322.633 301.202V752.494C322.633 764.484 315.493 775.323 304.477 780.056L118.844 859.818C99.0447 868.325 77.0002 853.804 77 832.254V221.441Z"
      />
      <path
        fill={INK}
        d="M417.621 129.676C417.621 106.723 442.348 92.2722 462.347 103.538L647.979 208.115C657.415 213.432 663.254 223.422 663.254 234.253V842.707C663.254 853.538 657.415 863.529 647.979 868.845L462.347 973.421C442.348 984.687 417.621 970.237 417.621 947.283V129.676Z"
      />
      <path
        fill={INK}
        d="M758.242 45.0504C758.242 21.0063 785.112 6.73228 805.036 20.192L990.668 145.597C998.926 151.176 1003.87 160.49 1003.87 170.456V910.272C1003.87 920.238 998.926 929.553 990.668 935.131L805.036 1060.54C785.112 1074 758.242 1059.72 758.242 1035.68V45.0504Z"
      />
    </svg>
  );
}

/**
 * A 1200 × 630 share card in the Paper language: warm canvas, ink type, one
 * Newsreader italic word, the mark and the domain. `headline` marks its italic
 * word `*like this*`, the same convention as the page headlines.
 */
export async function renderOgImage({
  eyebrow,
  headline,
  footnote,
}: {
  eyebrow: string;
  headline: string;
  footnote: string;
}) {
  const { before, marked, after } = splitMarked(headline);
  const size = headline.length > 44 ? 68 : 80;
  // One flex item per word, so the italic word wraps with the rest of the line
  // instead of dropping to a line of its own.
  const toWords = (text: string, italic: boolean) =>
    text.split(/\s+/).filter(Boolean).map((word) => ({ text: word, italic }));
  const words = [...toWords(before, false), ...toWords(marked, true), ...toWords(after, false)];

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: "64px 72px",
          background: PAPER,
          color: INK,
          fontFamily: "Geist",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <Mark />
          <span style={{ fontSize: 34, letterSpacing: "-0.02em" }}>Caudals</span>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 26 }}>
          <span style={{ fontSize: 26, color: MUTE }}>{eyebrow}</span>
          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              alignItems: "flex-end",
              columnGap: "0.24em",
              maxWidth: 980,
              fontSize: size,
              lineHeight: 1.05,
              letterSpacing: "-0.035em",
            }}
          >
            {words.map(({ text, italic }, index) => (
              <span
                key={index}
                style={
                  italic
                    ? {
                        fontFamily: "Newsreader",
                        fontStyle: "italic",
                        fontSize: size * 1.1,
                        letterSpacing: "-0.02em",
                        // Newsreader sits higher in its box than Geist; this
                        // puts the two on one baseline.
                        marginBottom: -Math.round(size * 0.14),
                      }
                    : {}
                }
              >
                {text}
              </span>
            ))}
          </div>
        </div>

        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            paddingTop: 26,
            borderTop: `1px solid ${LINE}`,
            fontSize: 24,
            color: INK2,
          }}
        >
          <span>{footnote}</span>
          <span style={{ color: MUTE }}>caudals.com</span>
        </div>
      </div>
    ),
    { ...OG_SIZE, fonts: await loadFonts() },
  );
}
