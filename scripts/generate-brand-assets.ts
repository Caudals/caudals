import path from "node:path";
import { promises as fs } from "node:fs";
import sharp from "sharp";
import toIco from "png-to-ico";

type LogoVariant = "black" | "white";

type ColorInput =
  | string
  | {
      r: number;
      g: number;
      b: number;
      alpha?: number;
    };

type IconSpec = {
  file: string;
  size: number;
  background: ColorInput;
  logo: LogoVariant;
  marginRatio?: number;
  cornerRadiusRatio?: number;
};

const ROOT_DIR = path.resolve(__dirname, "..");
const PUBLIC_DIR = path.join(ROOT_DIR, "public");
const APP_DIR = path.join(ROOT_DIR, "app");

const LOGO_PATHS: Record<LogoVariant, string> = {
  black: path.join(PUBLIC_DIR, "caudals_logo_black.svg"),
  white: path.join(PUBLIC_DIR, "caudals_logo_white.svg"),
};

const DEFAULT_MARGIN_RATIO = 0.18;
const SMALL_ICON_MARGIN_RATIO = 0.24;
const DEFAULT_CORNER_RADIUS_RATIO = 0.16;
const SMALL_ICON_CORNER_RADIUS_RATIO = 0.28;

const iconSpecs: IconSpec[] = [
  {
    file: path.join(PUBLIC_DIR, "favicon-16x16.png"),
    size: 16,
    background: "#ffffff",
    logo: "black",
    marginRatio: SMALL_ICON_MARGIN_RATIO,
    cornerRadiusRatio: SMALL_ICON_CORNER_RADIUS_RATIO,
  },
  {
    file: path.join(PUBLIC_DIR, "favicon-32x32.png"),
    size: 32,
    background: "#ffffff",
    logo: "black",
    marginRatio: SMALL_ICON_MARGIN_RATIO,
    cornerRadiusRatio: SMALL_ICON_CORNER_RADIUS_RATIO,
  },
  {
    file: path.join(PUBLIC_DIR, "favicon-48x48.png"),
    size: 48,
    background: "#ffffff",
    logo: "black",
    marginRatio: SMALL_ICON_MARGIN_RATIO,
    cornerRadiusRatio: SMALL_ICON_CORNER_RADIUS_RATIO,
  },
  {
    file: path.join(PUBLIC_DIR, "apple-touch-icon.png"),
    size: 180,
    background: "#ffffff",
    logo: "black",
  },
  {
    file: path.join(PUBLIC_DIR, "icon-192.png"),
    size: 192,
    background: "#ffffff",
    logo: "black",
  },
  {
    file: path.join(PUBLIC_DIR, "icon-512.png"),
    size: 512,
    background: "#ffffff",
    logo: "black",
  },
  {
    file: path.join(PUBLIC_DIR, "android-chrome-192x192.png"),
    size: 192,
    background: "#ffffff",
    logo: "black",
  },
  {
    file: path.join(PUBLIC_DIR, "android-chrome-512x512.png"),
    size: 512,
    background: "#ffffff",
    logo: "black",
  },
  {
    file: path.join(PUBLIC_DIR, "pwa-icon-192.png"),
    size: 192,
    background: "#ffffff",
    logo: "black",
  },
  {
    file: path.join(PUBLIC_DIR, "pwa-icon-512.png"),
    size: 512,
    background: "#ffffff",
    logo: "black",
  },
  {
    file: path.join(PUBLIC_DIR, "pwa-maskable-512.png"),
    size: 512,
    background: "#050914",
    logo: "white",
    marginRatio: 0.28,
    cornerRadiusRatio: 0,
  },
  {
    file: path.join(APP_DIR, "icon.png"),
    size: 512,
    background: "#ffffff",
    logo: "black",
  },
];

function colorToSvgFill(color: ColorInput): string {
  if (typeof color === "string") {
    return color;
  }

  const { r, g, b, alpha = 1 } = color;
  return `rgba(${[r, g, b].map((channel) =>
    Math.min(255, Math.max(0, Math.round(channel))),
  )}, ${Math.min(1, Math.max(0, alpha))})`;
}

async function ensureDestination(filePath: string) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
}

async function generateIcon({
  file,
  size,
  background,
  logo,
  marginRatio,
  cornerRadiusRatio,
}: IconSpec): Promise<Buffer> {
  const ratio =
    marginRatio ?? (size <= 64 ? SMALL_ICON_MARGIN_RATIO : DEFAULT_MARGIN_RATIO);
  const inset = Math.max(Math.round(size * ratio), 0);
  const drawableSize = Math.max(size - inset * 2, 1);
  const cornerRatio =
    cornerRadiusRatio ??
    (size <= 64 ? SMALL_ICON_CORNER_RADIUS_RATIO : DEFAULT_CORNER_RADIUS_RATIO);
  const cornerRadius = Math.max(Math.round(size * cornerRatio), 0);

  const logoBuffer = await sharp(LOGO_PATHS[logo])
    .resize(drawableSize, drawableSize, {
      fit: "contain",
    })
    .png()
    .toBuffer();

  const fill = colorToSvgFill(background);
  const baseSvg = Buffer.from(
    `<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" xmlns="http://www.w3.org/2000/svg"><rect width="${size}" height="${size}" rx="${cornerRadius}" ry="${cornerRadius}" fill="${fill}"/></svg>`,
  );

  const canvas = sharp(baseSvg).png();

  const output = await canvas
    .composite([{ input: logoBuffer, top: inset, left: inset }])
    .png({ compressionLevel: 9, adaptiveFiltering: true })
    .toBuffer();

  await ensureDestination(file);
  await fs.writeFile(file, output);
  return output;
}

async function generateFaviconIco(): Promise<void> {
  const sizes = [16, 32, 48];
  const buffers = await Promise.all(
    sizes.map((size) =>
      fs.readFile(path.join(PUBLIC_DIR, `favicon-${size}x${size}.png`)),
    ),
  );
  const ico = await toIco(buffers);
  const target = path.join(PUBLIC_DIR, "favicon.ico");
  await fs.writeFile(target, ico);
}

async function main() {
  await Promise.all(iconSpecs.map((spec) => generateIcon(spec)));
  await generateFaviconIco();
}

main().catch((error) => {
  console.error("Failed to generate brand assets.");
  console.error(error);
  process.exitCode = 1;
});

