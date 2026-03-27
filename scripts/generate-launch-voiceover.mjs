import { spawn } from "node:child_process";
import { copyFileSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import readline from "node:readline";

const REMOTION_OUTPUT = resolve("public/remotion/audio/caudals-launch-voiceover.mp3");
const EXPORT_OUTPUT = resolve("output/caudals-launch-voiceover.mp3");
const METADATA_OUTPUT = resolve("output/caudals-launch-voiceover.json");
const SEGMENT_OUTPUT_DIR = resolve("output/voiceover-scenes");
const TOTAL_DURATION_SECONDS = 41.045333;

const getArgValue = (flag, fallback = null) => {
  const directMatch = process.argv.find((arg) => arg.startsWith(`${flag}=`));
  if (directMatch) {
    return directMatch.slice(flag.length + 1);
  }

  const index = process.argv.indexOf(flag);
  if (index !== -1 && process.argv[index + 1]) {
    return process.argv[index + 1];
  }

  return fallback;
};

const SCENE_OFFSETS = [0, 4.8, 10.4, 17.2, 24.8, 33.6];

const SCENES = [
  {
    id: "scene-01-intro",
    start: SCENE_OFFSETS[0],
    text:
      "Caudals convierte las operaciones de datasets en un flujo operativo claro para la era de la inteligencia artificial.",
  },
  {
    id: "scene-02-vision",
    start: SCENE_OFFSETS[1],
    text:
      "Una sola capa operativa conecta a solicitantes, colaboradores y administradores con velocidad, confianza y control.",
  },
  {
    id: "scene-03-entry",
    start: SCENE_OFFSETS[2],
    text:
      "Desde la puerta de entrada, cada programa deja clara su propuesta, la red de colaboradores, el QA y los pagos.",
  },
  {
    id: "scene-04-market",
    start: SCENE_OFFSETS[3],
    text:
      "Los colaboradores encuentran oportunidades reales con recompensas claras, contexto de la modalidad y señales de urgencia que aceleran el rendimiento.",
  },
  {
    id: "scene-05-roles",
    start: SCENE_OFFSETS[4],
    text:
      "Tres superficies sostienen un solo ciclo operativo: los solicitantes financian, los colaboradores envían y los administradores supervisan.",
  },
  {
    id: "scene-06-close",
    start: SCENE_OFFSETS[5],
    text:
      "Así, Caudals permite crear datasets profesionales para entrenar modelos de inteligencia artificial a medida, con operaciones auditables y pagos fiables.",
  },
];

const args = new Set(process.argv.slice(2));
const provider = getArgValue("--provider", "elevenlabs");
const systemVoice = getArgValue("--system-voice", "Mónica");
const systemRate = Number.parseInt(getArgValue("--system-rate", "158"), 10);
const requestedSceneId = getArgValue("--scene-id", null);
const assembleOnly = args.has("--assemble-only");
const elevenLabsVoiceId = getArgValue("--voice-id", "RwzBDEn5f6FIgpAjH9YN");

const readApiKey = async () => {
  if (process.env.ELEVENLABS_API_KEY) {
    return process.env.ELEVENLABS_API_KEY.trim();
  }

  const rl = readline.createInterface({
    input: process.stdin,
    crlfDelay: Infinity,
    terminal: false,
  });

  const apiKey = await new Promise((resolveLine) => {
    rl.once("line", (line) => {
      resolveLine(line.trim());
      rl.close();
    });
  });

  if (!apiKey) {
    throw new Error("Missing ElevenLabs API key on stdin.");
  }

  return apiKey;
};

const requestAudio = async (url, init) => {
  const response = await fetch(url, init);

  if (!response.ok) {
    const message = await response.text();
    throw new Error(`HTTP ${response.status}: ${message.slice(0, 1200)}`);
  }

  return Buffer.from(await response.arrayBuffer());
};

const runCommand = (command, commandArgs) => {
  return new Promise((resolveRun, rejectRun) => {
    const child = spawn(command, commandArgs, {
      stdio: ["ignore", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });

    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });

    child.on("close", (code) => {
      if (code !== 0) {
        rejectRun(new Error(`${command} exited with ${code}\n${stderr}`));
        return;
      }

      resolveRun({ stdout, stderr });
    });
  });
};

const getDurationSeconds = async (filePath) => {
  const { stdout } = await runCommand("ffprobe", [
    "-v",
    "error",
    "-show_entries",
    "format=duration",
    "-of",
    "default=noprint_wrappers=1:nokey=1",
    filePath,
  ]);

  return Number.parseFloat(stdout.trim());
};

const adjustTempoToFit = async ({ inputPath, outputPath, maxDuration }) => {
  const duration = await getDurationSeconds(inputPath);

  if (duration <= maxDuration) {
    copyFileSync(inputPath, outputPath);
    return duration;
  }

  const ratio = duration / maxDuration;
  const atempo = Math.min(2, Math.max(0.5, ratio));

  await runCommand("ffmpeg", [
    "-y",
    "-i",
    inputPath,
    "-filter:a",
    `atempo=${atempo.toFixed(4)}`,
    "-vn",
    outputPath,
  ]);

  return getDurationSeconds(outputPath);
};

const generateSceneAudio = async ({ apiKey, voiceId, scene, outputPath }) => {
  if (provider === "system") {
    await runCommand("say", [
      "-v",
      systemVoice,
      "-r",
      `${systemRate}`,
      "-o",
      outputPath,
      scene.text,
    ]);

    return;
  }

  const buffer = await requestAudio(
    `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`,
    {
      method: "POST",
      headers: {
        "xi-api-key": apiKey,
        "Content-Type": "application/json",
        Accept: "audio/mpeg",
      },
      body: JSON.stringify({
        text: scene.text,
        model_id: "eleven_multilingual_v2",
        voice_settings: {
          stability: 0.42,
          similarity_boost: 0.78,
          style: 0.18,
          use_speaker_boost: true,
        },
      }),
    },
  );

  writeFileSync(outputPath, buffer);
};

const getSceneWindow = (sceneIndex) => {
  const scene = SCENES[sceneIndex];
  const nextStart =
    sceneIndex === SCENES.length - 1
      ? TOTAL_DURATION_SECONDS
      : SCENES[sceneIndex + 1].start;

  return {
    scene,
    maxDuration: Math.max(1.2, nextStart - scene.start - 0.25),
  };
};

const getRequestedScenes = () => {
  if (!requestedSceneId) {
    return SCENES.map((scene, index) => ({
      scene,
      index,
    }));
  }

  const sceneIndex = SCENES.findIndex((scene) => scene.id === requestedSceneId);

  if (sceneIndex === -1) {
    throw new Error(`Unknown scene id: ${requestedSceneId}`);
  }

  return [
    {
      scene: SCENES[sceneIndex],
      index: sceneIndex,
    },
  ];
};

const collectExistingSceneMetadata = async () => {
  const sceneMetadata = [];

  for (let index = 0; index < SCENES.length; index += 1) {
    const scene = SCENES[index];
    const finalPath = join(SEGMENT_OUTPUT_DIR, `${scene.id}.mp3`);
    const { maxDuration } = getSceneWindow(index);
    const actualDuration = await getDurationSeconds(finalPath);

    sceneMetadata.push({
      id: scene.id,
      start: scene.start,
      maxDuration,
      actualDuration,
      text: scene.text,
      path: finalPath,
    });
  }

  return sceneMetadata;
};

const writeMetadata = ({ providerName, voice, sceneMetadata }) => {
  writeFileSync(
    METADATA_OUTPUT,
    JSON.stringify(
      {
        provider: providerName,
        voice,
        totalDurationSeconds: TOTAL_DURATION_SECONDS,
        output: REMOTION_OUTPUT,
        scenes: sceneMetadata,
      },
      null,
      2,
    ),
  );
};

const buildAtempoFilter = (ratio) => {
  const factors = [];
  let remaining = ratio;

  while (remaining > 2) {
    factors.push(2);
    remaining /= 2;
  }

  while (remaining < 0.5) {
    factors.push(0.5);
    remaining /= 0.5;
  }

  factors.push(remaining);

  return factors.map((factor) => `atempo=${factor.toFixed(6)}`).join(",");
};

const normalizeSequentialSceneMetadata = (sceneMetadata) => {
  const totalSourceDuration = sceneMetadata.reduce(
    (sum, scene) => sum + scene.actualDuration,
    0,
  );

  const scale =
    totalSourceDuration > 0
      ? TOTAL_DURATION_SECONDS / totalSourceDuration
      : 1;

  let cursor = 0;

  return sceneMetadata.map((scene) => {
    const scaledDuration = scene.actualDuration * scale;
    const normalizedScene = {
      ...scene,
      start: cursor,
      actualDuration: scaledDuration,
    };

    cursor += scaledDuration;
    return normalizedScene;
  });
};

const buildFinalTrack = async (files, options = {}) => {
  const { mode = "timeline" } = options;

  mkdirSync(dirname(REMOTION_OUTPUT), { recursive: true });
  mkdirSync(dirname(EXPORT_OUTPUT), { recursive: true });

  if (mode === "sequential") {
    const tempDir = mkdtempSync(join(tmpdir(), "caudals-voiceover-assemble-"));
    const concatListPath = join(tempDir, "concat.txt");
    const combinedPath = join(tempDir, "combined.mp3");

    try {
      writeFileSync(
        concatListPath,
        files
          .map((file) => `file '${file.path.replaceAll("'", "'\\''")}'`)
          .join("\n"),
      );

      await runCommand("ffmpeg", [
        "-y",
        "-f",
        "concat",
        "-safe",
        "0",
        "-i",
        concatListPath,
        "-ar",
        "44100",
        "-b:a",
        "192k",
        combinedPath,
      ]);

      const combinedDuration = await getDurationSeconds(combinedPath);
      const ratio = combinedDuration / TOTAL_DURATION_SECONDS;
      const filters = [];

      if (Math.abs(ratio - 1) > 0.0001) {
        filters.push(buildAtempoFilter(ratio));
      }

      filters.push(`apad=whole_dur=${TOTAL_DURATION_SECONDS}`);

      await runCommand("ffmpeg", [
        "-y",
        "-i",
        combinedPath,
        "-filter:a",
        filters.join(","),
        "-t",
        `${TOTAL_DURATION_SECONDS}`,
        "-ar",
        "44100",
        "-b:a",
        "192k",
        REMOTION_OUTPUT,
      ]);

      copyFileSync(REMOTION_OUTPUT, EXPORT_OUTPUT);
      return;
    } finally {
      rmSync(tempDir, { force: true, recursive: true });
    }
  }

  const filterParts = files.map((file, index) => {
    const delayMs = Math.max(0, Math.round(file.start * 1000));
    return `[${index}:a]adelay=${delayMs}|${delayMs}[a${index}]`;
  });

  const mixInputs = files.map((_, index) => `[a${index}]`).join("");
  const filterGraph = `${filterParts.join(";")};${mixInputs}amix=inputs=${files.length}:normalize=0,volume=1.0,apad=whole_dur=${TOTAL_DURATION_SECONDS}[aout]`;

  const ffmpegArgs = [
    "-y",
    ...files.flatMap((file) => ["-i", file.path]),
    "-filter_complex",
    filterGraph,
    "-map",
    "[aout]",
    "-t",
    `${TOTAL_DURATION_SECONDS}`,
    "-ar",
    "44100",
    "-b:a",
    "192k",
    REMOTION_OUTPUT,
  ];

  await runCommand("ffmpeg", ffmpegArgs);
  copyFileSync(REMOTION_OUTPUT, EXPORT_OUTPUT);
};

const main = async () => {
  mkdirSync(SEGMENT_OUTPUT_DIR, { recursive: true });

  if (assembleOnly) {
    const sourceSceneMetadata = await collectExistingSceneMetadata();
    const sceneMetadata = normalizeSequentialSceneMetadata(sourceSceneMetadata);

    await buildFinalTrack(
      sceneMetadata.map((scene) => ({
        path: scene.path,
        start: scene.start,
      })),
      {
        mode: "sequential",
      },
    );

    writeMetadata({
      providerName: provider === "system" ? "system" : "elevenlabs",
      voice:
        provider === "system"
          ? {
              name: systemVoice,
              rate: systemRate,
            }
          : {
              name: "elevenlabs-direct",
              voice_id: elevenLabsVoiceId,
            },
      sceneMetadata,
    });

    console.log(
      JSON.stringify(
        {
          provider,
          assembleOnly: true,
          output: REMOTION_OUTPUT,
          export: EXPORT_OUTPUT,
          scenes: sceneMetadata.map((scene) => ({
            id: scene.id,
            start: scene.start,
            actualDuration: scene.actualDuration,
          })),
        },
        null,
        2,
      ),
    );

    return;
  }

  if (provider === "system") {
    const tempDir = mkdtempSync(join(tmpdir(), "caudals-voiceover-system-"));
    const sceneMetadata = [];
    const requestedScenes = getRequestedScenes();

    try {
      for (const requested of requestedScenes) {
        const { scene, index } = requested;
        const rawPath = join(tempDir, `${scene.id}.aiff`);
        const finalPath = join(SEGMENT_OUTPUT_DIR, `${scene.id}.mp3`);
        const { maxDuration } = getSceneWindow(index);

        await generateSceneAudio({
          apiKey: "",
          voiceId: "",
          scene,
          outputPath: rawPath,
        });

        const finalDuration = await adjustTempoToFit({
          inputPath: rawPath,
          outputPath: finalPath,
          maxDuration,
        });

        sceneMetadata.push({
          id: scene.id,
          start: scene.start,
          maxDuration,
          actualDuration: finalDuration,
          text: scene.text,
          path: finalPath,
        });
      }

      if (requestedSceneId) {
        console.log(
          JSON.stringify(
            {
              provider: "system",
              scene: requestedSceneId,
              voice: systemVoice,
              rate: systemRate,
              path: sceneMetadata[0]?.path,
              actualDuration: sceneMetadata[0]?.actualDuration,
            },
            null,
            2,
          ),
        );
        return;
      }

      await buildFinalTrack(
        sceneMetadata.map((scene) => ({
          path: scene.path,
          start: scene.start,
        })),
      );

      writeMetadata({
        providerName: "system",
        voice: {
          name: systemVoice,
          rate: systemRate,
        },
        sceneMetadata,
      });

      console.log(
        JSON.stringify(
          {
            provider: "system",
            voice: systemVoice,
            rate: systemRate,
            output: REMOTION_OUTPUT,
            export: EXPORT_OUTPUT,
            scenes: sceneMetadata.map((scene) => ({
              id: scene.id,
              start: scene.start,
              actualDuration: scene.actualDuration,
            })),
          },
          null,
          2,
        ),
      );
    } finally {
      rmSync(tempDir, { force: true, recursive: true });
    }

    return;
  }

  const apiKey = await readApiKey();
  const resolvedVoice = {
    name: "elevenlabs-direct",
    voice_id: elevenLabsVoiceId,
    category: "manual",
    labels: {},
    score: 0,
  };

  const tempDir = mkdtempSync(join(tmpdir(), "caudals-voiceover-"));
  const sceneMetadata = [];
  const requestedScenes = getRequestedScenes();

  try {
    for (const requested of requestedScenes) {
      const { scene, index } = requested;
      const rawPath = join(tempDir, `${scene.id}.raw.mp3`);
      const finalPath = join(SEGMENT_OUTPUT_DIR, `${scene.id}.mp3`);
      const { maxDuration } = getSceneWindow(index);

      await generateSceneAudio({
        apiKey,
        voiceId: resolvedVoice.voice_id,
        scene,
        outputPath: rawPath,
      });

      const finalDuration = await adjustTempoToFit({
        inputPath: rawPath,
        outputPath: finalPath,
        maxDuration,
      });

      sceneMetadata.push({
        id: scene.id,
        start: scene.start,
        maxDuration,
        actualDuration: finalDuration,
        text: scene.text,
        path: finalPath,
        });
      }

      if (requestedSceneId) {
        console.log(
          JSON.stringify(
            {
              provider: "elevenlabs",
              scene: requestedSceneId,
              voice: resolvedVoice.name,
              voice_id: resolvedVoice.voice_id,
              path: sceneMetadata[0]?.path,
              actualDuration: sceneMetadata[0]?.actualDuration,
            },
            null,
            2,
          ),
        );
        return;
      }

    await buildFinalTrack(
      sceneMetadata.map((scene) => ({
        path: scene.path,
        start: scene.start,
      })),
    );

    writeMetadata({
      providerName: "elevenlabs",
      voice: {
        name: resolvedVoice.name,
        voice_id: resolvedVoice.voice_id,
        category: resolvedVoice.category,
        labels: resolvedVoice.labels,
        score: resolvedVoice.score,
      },
      sceneMetadata,
    });

    console.log(
      JSON.stringify(
        {
          provider: "elevenlabs",
          voice: resolvedVoice.name,
          voice_id: resolvedVoice.voice_id,
          output: REMOTION_OUTPUT,
          export: EXPORT_OUTPUT,
          scenes: sceneMetadata.map((scene) => ({
            id: scene.id,
            start: scene.start,
            actualDuration: scene.actualDuration,
          })),
        },
        null,
        2,
      ),
    );
  } finally {
    rmSync(tempDir, { force: true, recursive: true });
  }
};

main().catch((error) => {
  console.error(error?.stack || String(error));
  process.exit(1);
});
