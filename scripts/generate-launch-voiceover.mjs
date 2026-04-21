#!/usr/bin/env node

/**
 * Generate the Caudals launch-video voiceover using Google Gemini TTS.
 *
 * Usage:
 *   GEMINI_API_KEY=... node scripts/generate-launch-voiceover.mjs
 *   node scripts/generate-launch-voiceover.mjs --voice=Charon
 *   node scripts/generate-launch-voiceover.mjs --only=scene-02-why-data
 *   node scripts/generate-launch-voiceover.mjs --list-voices
 *
 * Model: gemini-3.1-flash-tts-preview (Google Gemini TTS).
 * Output: one MP3 per scene + a scene-manifest.json with durations, so
 * Remotion's calculateMetadata can size the composition precisely.
 * Target voice: male, warm, calm, editorial, Castilian Spanish (es-ES).
 */

import { GoogleGenAI } from "@google/genai";
import { spawn } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const REPO_ROOT = resolve(__dirname, "..");

const MODEL = process.env.GEMINI_TTS_MODEL || "gemini-3.1-flash-tts-preview";

// Accent is steered via a style prompt prepended to every scene — the Gemini
// TTS API has no languageCode field, and voices are language-agnostic.
const STYLE_PROMPT =
  "Lee el siguiente guion en español de España, con acento castellano neutro de Madrid. " +
  "Voz masculina adulta, cálida, serena, editorial, pausada, con autoridad tranquila. " +
  "Dicción clara, sin entusiasmo exagerado, sin acento latinoamericano. " +
  "Respeta los silencios marcados con etiquetas entre corchetes.\n\n";

const OUTPUT_AUDIO_DIR = resolve(
  REPO_ROOT,
  "public/remotion/audio/scenes",
);
const MANIFEST_PATH = resolve(
  REPO_ROOT,
  "public/remotion/audio/scene-manifest.json",
);

const SCENES = [
  {
    id: "scene-01-hook",
    text:
      "[slow] La inteligencia artificial [pause] es tan buena [pause short] como los datos [emphasize] que la entrenan.",
  },
  {
    id: "scene-02-why-data",
    text:
      "El texto público de alta calidad [slow] está a punto de agotarse. [pause] " +
      "Epoch AI lo proyecta entre [emphasize] 2026 [pause short] y 2032. [pause] " +
      "Y los equipos de inteligencia artificial dedican más tiempo a conseguir y preparar datos [slow] que a entrenar modelos. [pause] " +
      "El cuello de botella de la IA [pause short] ya no es el modelo. [pause short] [emphasize] Son los datos.",
  },
  {
    id: "scene-03-paradox",
    text:
      "Las empresas de todos los sectores [slow] ya generan datos únicos. [pause short] " +
      "Transacciones, rutas, imágenes, sensores, registros. [pause] " +
      "Pero esos datos [emphasize] no llegan [pause short] a los equipos de inteligencia artificial que los necesitan para entrenar modelos [slow] de verdad útiles.",
  },
  {
    id: "scene-04-intro",
    text:
      "[pause short] Caudals [pause] es el marketplace B2B [slow] de datasets para inteligencia artificial.",
  },
  {
    id: "scene-05-suppliers",
    text:
      "Si tu empresa tiene datos valiosos [pause short] —transacciones, rutas, imágenes, registros operativos— [pause] " +
      "Caudals los convierte en datasets que equipos de inteligencia artificial quieren comprar. [pause] " +
      "[slow] Tú nos cuentas qué datos tienes. [pause short] Nosotros los validamos, los preparamos [pause short] y los entregamos al comprador.",
  },
  {
    id: "scene-06-buyers",
    text:
      "Si tu equipo entrena o evalúa modelos [pause short] —especialmente modelos [emphasize] personalizados— [pause] " +
      "[slow] Caudals te consigue los datos que tu problema necesita. [pause] " +
      "Nos dices el caso de uso, la modalidad, el volumen. [pause short] " +
      "Te entregamos datos reales, específicos, [slow] y listos para entrenar.",
  },
  {
    id: "scene-07-what-you-get",
    text:
      "Cada dataset llega [slow] con derechos claros, [pause short] calidad revisada, [pause short] formatos compatibles [pause short] y procedencia auditable. [pause] [emphasize] Nada de datos dudosos.",
  },
  {
    id: "scene-08-cta",
    text:
      "[pause] Caudals. [pause short] Datos profesionales [slow] para inteligencia artificial a medida. [pause] " +
      "Solicita acceso en [emphasize] caudals [slow] punto com.",
  },
];

function getArg(flag, fallback = null) {
  const eq = process.argv.find((a) => a.startsWith(`${flag}=`));
  if (eq) return eq.slice(flag.length + 1);
  const idx = process.argv.indexOf(flag);
  if (idx !== -1 && process.argv[idx + 1]) return process.argv[idx + 1];
  return fallback;
}

function hasFlag(flag) {
  return process.argv.includes(flag);
}

const DEFAULT_VOICE =
  process.env.GEMINI_TTS_VOICE || getArg("--voice") || "Charon";

async function callWithRetry(fn, { maxAttempts = 5, baseDelayMs = 12000 } = {}) {
  let lastErr;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      const text = String(err?.message || err);
      const is429 = text.includes("429") || text.includes("RESOURCE_EXHAUSTED");
      const retryMs = /retryDelay":"(\d+)s"/.exec(text);
      const waitMs = is429
        ? retryMs
          ? Number.parseInt(retryMs[1], 10) * 1000 + 2000
          : baseDelayMs * attempt
        : baseDelayMs;
      if (!is429 && attempt >= 2) throw err;
      if (attempt >= maxAttempts) break;
      console.warn(
        `    · rate-limited, waiting ${Math.round(waitMs / 1000)}s (attempt ${attempt}/${maxAttempts})`,
      );
      await new Promise((r) => setTimeout(r, waitMs));
    }
  }
  throw lastErr;
}

async function synthesizeScene({ ai, scene, voice }) {
  const prompt = STYLE_PROMPT + scene.text;

  const response = await callWithRetry(() =>
    ai.models.generateContent({
      model: MODEL,
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      config: {
        responseModalities: ["AUDIO"],
        speechConfig: {
          voiceConfig: {
            prebuiltVoiceConfig: { voiceName: voice },
          },
        },
      },
    }),
  );

  const part = response?.candidates?.[0]?.content?.parts?.find(
    (p) => p?.inlineData?.data,
  );
  if (!part) {
    throw new Error(
      `[${scene.id}] Gemini returned no audio inlineData. Response: ${JSON.stringify(
        response,
      ).slice(0, 600)}`,
    );
  }

  const mimeType = part.inlineData.mimeType || "";
  const pcm = Buffer.from(part.inlineData.data, "base64");
  const rateMatch = /rate=(\d+)/.exec(mimeType);
  const sampleRate = rateMatch ? Number.parseInt(rateMatch[1], 10) : 24000;

  return { pcm, sampleRate, mimeType };
}

function wrapPcmAsWav(pcm, sampleRate, channels = 1, bitsPerSample = 16) {
  const byteRate = (sampleRate * channels * bitsPerSample) / 8;
  const blockAlign = (channels * bitsPerSample) / 8;
  const header = Buffer.alloc(44);
  header.write("RIFF", 0);
  header.writeUInt32LE(36 + pcm.length, 4);
  header.write("WAVE", 8);
  header.write("fmt ", 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(channels, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(byteRate, 28);
  header.writeUInt16LE(blockAlign, 32);
  header.writeUInt16LE(bitsPerSample, 34);
  header.write("data", 36);
  header.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([header, pcm]);
}

function transcodeToMp3(wavPath, mp3Path) {
  return new Promise((resolvePromise, rejectPromise) => {
    const proc = spawn(
      "ffmpeg",
      [
        "-y",
        "-loglevel",
        "error",
        "-i",
        wavPath,
        "-codec:a",
        "libmp3lame",
        "-q:a",
        "2",
        mp3Path,
      ],
      { stdio: ["ignore", "inherit", "inherit"] },
    );
    proc.on("error", rejectPromise);
    proc.on("exit", (code) => {
      if (code === 0) resolvePromise();
      else rejectPromise(new Error(`ffmpeg exited with code ${code}`));
    });
  });
}

function probeDurationSeconds(audioPath) {
  return new Promise((resolvePromise, rejectPromise) => {
    const proc = spawn(
      "ffprobe",
      [
        "-v",
        "error",
        "-show_entries",
        "format=duration",
        "-of",
        "default=noprint_wrappers=1:nokey=1",
        audioPath,
      ],
      { stdio: ["ignore", "pipe", "inherit"] },
    );
    let out = "";
    proc.stdout.on("data", (d) => {
      out += d.toString();
    });
    proc.on("error", rejectPromise);
    proc.on("exit", (code) => {
      if (code !== 0) {
        rejectPromise(new Error(`ffprobe exited with code ${code}`));
        return;
      }
      const value = Number.parseFloat(out.trim());
      if (Number.isNaN(value)) {
        rejectPromise(new Error(`ffprobe returned invalid duration: ${out}`));
        return;
      }
      resolvePromise(value);
    });
  });
}

async function main() {
  if (hasFlag("--list-voices")) {
    console.log(
      [
        "Prebuilt male-leaning Gemini voices suitable for warm editorial Castilian:",
        "  Charon     — informative, warm, calm (recommended)",
        "  Iapetus    — clear, neutral mature male",
        "  Gacrux     — mature, grounded",
        "  Orus       — firm, confident",
        "  Rasalgethi — documentary informative",
        "  Enceladus  — breathy, softer",
        "  Algenib    — gravelly, weathered",
        "",
        "Override with --voice=<name> or GEMINI_TTS_VOICE.",
      ].join("\n"),
    );
    return;
  }

  if (
    !process.env.GEMINI_API_KEY &&
    !process.env.GOOGLE_API_KEY
  ) {
    try {
      const envLocal = readFileSync(
        resolve(REPO_ROOT, ".env.local"),
        "utf8",
      );
      const m = /^GEMINI_API_KEY=(.+)$/m.exec(envLocal);
      if (m) process.env.GEMINI_API_KEY = m[1].trim();
    } catch {}
  }

  const apiKey =
    process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
  if (!apiKey) {
    throw new Error(
      "Missing GEMINI_API_KEY. Set it in .env.local or pass it as an env var.",
    );
  }

  const voice = DEFAULT_VOICE;
  const only = getArg("--only");
  const scenes = only ? SCENES.filter((s) => s.id === only) : SCENES;
  if (only && scenes.length === 0) {
    throw new Error(`No scene matches --only=${only}`);
  }

  mkdirSync(OUTPUT_AUDIO_DIR, { recursive: true });

  const ai = new GoogleGenAI({ apiKey });

  console.log(`→ Generating voiceover with ${MODEL} (voice: ${voice})`);

  const manifest = existsSync(MANIFEST_PATH)
    ? JSON.parse(readFileSync(MANIFEST_PATH, "utf8"))
    : { model: MODEL, voice, scenes: {} };

  manifest.model = MODEL;
  manifest.voice = voice;
  manifest.generatedAt = new Date().toISOString();
  manifest.scenes = manifest.scenes || {};

  // Free-tier limit is 3 RPM per TTS model. Throttle between scenes to stay
  // safely below and avoid cascading 429s. Override with --no-throttle.
  const throttleMs = hasFlag("--no-throttle") ? 0 : 22000;
  const skipExisting = hasFlag("--skip-existing");

  for (const [i, scene] of scenes.entries()) {
    const mp3Path = join(OUTPUT_AUDIO_DIR, `${scene.id}.mp3`);
    const wavPath = join(OUTPUT_AUDIO_DIR, `${scene.id}.wav`);

    if (skipExisting && (existsSync(mp3Path) || existsSync(wavPath))) {
      const durationPath = existsSync(mp3Path) ? mp3Path : wavPath;
      const duration = await probeDurationSeconds(durationPath);
      manifest.scenes[scene.id] = {
        wav: `remotion/audio/scenes/${scene.id}.wav`,
        mp3: existsSync(mp3Path)
          ? `remotion/audio/scenes/${scene.id}.mp3`
          : null,
        durationSeconds: duration,
        text: scene.text,
      };
      writeFileSync(MANIFEST_PATH, JSON.stringify(manifest, null, 2));
      console.log(`  · ${scene.id} (cached, ${duration.toFixed(2)}s)`);
      continue;
    }

    if (i > 0 && throttleMs > 0) {
      console.log(`  . throttle ${Math.round(throttleMs / 1000)}s`);
      await new Promise((r) => setTimeout(r, throttleMs));
    }

    console.log(`  · ${scene.id}`);
    const { pcm, sampleRate } = await synthesizeScene({
      ai,
      scene,
      voice,
    });

    writeFileSync(wavPath, wrapPcmAsWav(pcm, sampleRate));

    try {
      await transcodeToMp3(wavPath, mp3Path);
    } catch (err) {
      console.warn(
        `    ! ffmpeg transcode failed (${err.message}). Keeping .wav only.`,
      );
    }

    const durationPath = existsSync(mp3Path) ? mp3Path : wavPath;
    const duration = await probeDurationSeconds(durationPath);

    manifest.scenes[scene.id] = {
      wav: `remotion/audio/scenes/${scene.id}.wav`,
      mp3: existsSync(mp3Path)
        ? `remotion/audio/scenes/${scene.id}.mp3`
        : null,
      durationSeconds: duration,
      text: scene.text,
    };

    // Persist manifest after every scene so a rate-limit crash mid-run
    // doesn't discard completed work.
    writeFileSync(MANIFEST_PATH, JSON.stringify(manifest, null, 2));

    console.log(`    ✓ ${duration.toFixed(2)}s`);
  }

  const totalSeconds = Object.values(manifest.scenes).reduce(
    (sum, s) => sum + (s.durationSeconds || 0),
    0,
  );
  manifest.totalSeconds = totalSeconds;

  writeFileSync(MANIFEST_PATH, JSON.stringify(manifest, null, 2));

  console.log(
    `\nDone. Total voiceover: ${totalSeconds.toFixed(2)}s across ${
      Object.keys(manifest.scenes).length
    } scenes.`,
  );
  console.log(`Manifest: ${MANIFEST_PATH}`);
}

main().catch((err) => {
  console.error("\nVoiceover generation failed:");
  console.error(err?.stack || err?.message || err);
  process.exit(1);
});
