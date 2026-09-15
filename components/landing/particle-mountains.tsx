"use client";

import { useEffect, useRef, useSyncExternalStore, type RefObject } from "react";
import * as THREE from "three";
import { cn } from "@/lib/utils";
import { useHeavyVisualsDisabled } from "@/lib/hooks/use-heavy-visuals-disabled";

interface ParticleMountainsProps {
  className?: string;
  /**
   * Tall scroll track the landscape is pinned inside. Flight progress runs over
   * the pinned stretch: 0 when the track's top meets the viewport top, 1 when the
   * stage is about to unpin. The `[data-hero-copy]` element inside it is faded and
   * lifted from the same spring-smoothed progress, so copy and camera move as one.
   */
  trackRef?: RefObject<HTMLElement | null>;
}

/**
 * Editorial 3D particle landscape:
 * Multi-layer abstract mountain and hill ridges composed of fine stippled particles.
 * Scrolling flies the camera straight toward the horizon: the ridges part gently
 * to the sides, the view climbs into the sky, and the terrain thins until every
 * particle has dissolved by the time the hero has scrolled away.
 */
const noopSubscribe = () => () => {};

export function ParticleMountains({ className, trackRef }: ParticleMountainsProps) {
  const disabled = useHeavyVisualsDisabled({ respectReducedMotion: false });
  // The heavy-visuals probe reports "disabled" on the server, so without this the static
  // SVG fallback flashes as dotted lines until hydration picks the real scene.
  const hydrated = useSyncExternalStore(noopSubscribe, () => true, () => false);

  return (
    <div
      className={cn(
        "pointer-events-none relative h-full w-full select-none",
        className
      )}
      aria-hidden="true"
    >
      {!hydrated ? null : disabled ? <StaticLandscape /> : <ParticleCanvas trackRef={trackRef} />}

      {/* Atmospheric fades to seamlessly blend with the canvas */}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-[9svh] bg-gradient-to-t from-background via-background/70 to-transparent" />
      <div className="pointer-events-none absolute inset-y-0 left-0 w-16 bg-gradient-to-r from-background to-transparent sm:w-28" />
      <div className="pointer-events-none absolute inset-y-0 right-0 w-16 bg-gradient-to-l from-background to-transparent sm:w-28" />
    </div>
  );
}

/* Vertex shader: organic undulation, lateral parting of the ridges, near-camera fade, and progressive dissolve */
const VERTEX_SHADER = `
  uniform float uTime;
  uniform float uPixelRatio;
  uniform float uScrollProgress;
  uniform float uOpen;
  uniform float uDensity;
  uniform float uSizeScale;
  uniform float uCopyBottom;
  uniform float uCopyVisible;

  attribute float aSize;
  attribute float aAlpha;
  attribute float aPhase;
  attribute float aLayer;
  attribute vec3 aColor;

  varying float vAlpha;
  varying vec3 vColor;
  varying float vLayer;
  varying float vPhase;

  void main() {
    vColor = aColor;
    vLayer = aLayer;
    vPhase = aPhase;

    vec3 pos = position;

    // Organic living terrain undulation (subtle geological breathing)
    float spread;
    if (aLayer < 0.8) {
      pos.y += sin(pos.x * 0.08 + uTime * 0.14) * 0.024
             + cos(pos.z * 0.10 + uTime * 0.10) * 0.015;
      spread = 0.42;
    } else if (aLayer < 1.8) {
      pos.y += cos(pos.x * 0.06 - uTime * 0.10 + 1.6) * 0.020
             + sin(pos.z * 0.08 + uTime * 0.07) * 0.012;
      spread = 0.26;
    } else if (aLayer < 2.3) {
      pos.y += sin(pos.x * 0.04 + uTime * 0.05 + 2.8) * 0.012;
      spread = 0.13;
    } else if (aLayer < 2.8) {
      pos.y += sin(uTime * 0.04 + pos.x * 0.05) * 0.008;
      spread = 0.08;
    } else {
      pos.y += sin(uTime * 0.020 + aPhase) * 0.004;
      pos.x += cos(uTime * 0.015 + aPhase) * 0.003;
      spread = 0.0;
    }

    // Ridges part to the sides like a gate opening onto the horizon. Nearer layers
    // part more; the centre line stays put so the flight path reads as straight.
    pos.x += pos.x * uOpen * spread;
    pos.y -= uOpen * spread * 0.35 * smoothstep(0.0, 6.0, abs(pos.x));

    // Progressive dissolve: nearest terrain thins first, the sky clears last.
    float thinStart;
    float thinEnd;
    if (aLayer < 0.8) {
      thinStart = 0.30; thinEnd = 0.62;
    } else if (aLayer < 1.8) {
      thinStart = 0.36; thinEnd = 0.70;
    } else if (aLayer < 2.3) {
      thinStart = 0.42; thinEnd = 0.76;
    } else if (aLayer < 2.8) {
      thinStart = 0.38; thinEnd = 0.72;
    } else if (aLayer > 3.05 && aLayer < 3.2) {
      // Zenith stars: the deep sky the climb flies into, last to dissolve
      thinStart = 0.84; thinEnd = 0.95;
    } else if (aLayer > 3.2 && aLayer < 3.4) {
      // Sky dust: the haze clears as the flight rises out of it
      thinStart = 0.50; thinEnd = 0.84;
    } else {
      // Stars hold longest, then fade out behind the next section rising into the sky
      thinStart = 0.62; thinEnd = 0.93;
    }

    float randSeed = fract(aPhase * 0.15915494 + 0.3719);
    float dropout = mix(thinStart, thinEnd, randSeed);
    float dissolve = 1.0 - smoothstep(dropout - 0.07, dropout + 0.02, uScrollProgress);
    dissolve *= 1.0 - smoothstep(0.93, 0.98, uScrollProgress);
    if (aLayer > 3.05 && aLayer < 3.2) {
      // Staggered fade-in so the sky keeps filling with stars as the camera nears it
      float arrive = mix(0.34, 0.66, fract(aPhase * 3.7311 + 0.519));
      dissolve *= smoothstep(arrive - 0.06, arrive + 0.08, uScrollProgress);
    }

    vec4 mvPosition = modelViewMatrix * vec4(pos, 1.0);
    float camDist = -mvPosition.z;

    // Particles close to the lens fade like air instead of clipping or ballooning
    float nearFade = smoothstep(0.6, 1.8, camDist);

    vAlpha = aAlpha * dissolve * nearFade;

    // Narrow screens keep a random subset of the terrain and haze so the frame never saturates
    bool isStar = aLayer > 2.8 && aLayer < 3.2;
    float keepSeed = fract(aPhase * 7.1377 + 0.1731);
    // Stars thin half as much as the terrain so the sky still reads on phones
    float keepRatio = isStar ? 0.5 + 0.5 * uDensity : uDensity;
    if (keepSeed > keepRatio) {
      vAlpha = 0.0;
    }

    gl_Position = projectionMatrix * mvPosition;

    // Particles step back behind the copy so they never veil the text. Sky layers clear a
    // generous band; terrain only thins right where a summit would touch the last line.
    float fromTop = 0.5 - 0.5 * gl_Position.y / gl_Position.w;
    if (aLayer > 2.3) {
      float behindCopy = 1.0 - smoothstep(uCopyBottom - 0.01, uCopyBottom + 0.07, fromTop);
      float mask = isStar ? 0.45 : 1.0;
      vAlpha *= 1.0 - behindCopy * uCopyVisible * mask;
    } else {
      float behindCopy = 1.0 - smoothstep(uCopyBottom - 0.04, uCopyBottom + 0.01, fromTop);
      vAlpha *= 1.0 - behindCopy * uCopyVisible * 0.8;
    }

    float sizeAttenuation = 250.0 / max(0.85, camDist);
    gl_PointSize = aSize * uPixelRatio * uSizeScale * sizeAttenuation * (0.45 + 0.55 * dissolve);
    gl_PointSize = clamp(gl_PointSize, 1.5, 8.5);

    if (vAlpha <= 0.002 || camDist < 0.25) {
      gl_PointSize = 0.0;
    }
  }
`;

/* Fragment shader with crisp antialiased circular falloff and star twinkle */
const FRAGMENT_SHADER = `
  uniform float uTime;

  varying float vAlpha;
  varying vec3 vColor;
  varying float vLayer;
  varying float vPhase;

  void main() {
    vec2 coord = gl_PointCoord - vec2(0.5);
    float dist = length(coord);

    if (dist > 0.5) {
      discard;
    }

    float soft = 1.0 - smoothstep(0.28, 0.49, dist);
    float alpha = vAlpha * soft;

    // Subtle twinkle for static stars (layer 3.0), bypass for celestial transients (layer 3.5)
    if (vLayer > 2.8 && vLayer < 3.2) {
      float twinkle = 0.8 + 0.2 * sin(uTime * 1.8 + vPhase * 6.28318);
      alpha *= twinkle;
    }

    gl_FragColor = vec4(vColor, alpha);
  }
`;

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
/** Hermite ease between two progress marks. */
const ease = (from: number, to: number, v: number) => {
  const t = clamp01((v - from) / (to - from));
  return t * t * (3 - 2 * t);
};
/** Quintic ease: flatter shoulders than smoothstep, so takeoff and arrival feel weightless. */
const easeSoft = (from: number, to: number, v: number) => {
  const t = clamp01((v - from) / (to - from));
  return t * t * t * (t * (t * 6 - 15) + 10);
};

/** Scroll distance (as a fraction of the track) swallowed before the flight starts. */
const SCROLL_DEADZONE = 0.03;
/** Full-screen canvas: cap device pixels so fill rate stays smooth on retina screens. */
const MAX_PIXEL_RATIO = 1.5;
/** Natural frequency of the progress spring; lower is heavier and slower. */
const SPRING_OMEGA = 3.6;

interface Framing {
  /** Camera distance from the scene origin at rest. */
  z: number;
  /** Camera altitude at rest. */
  y: number;
  /** Altitude of the resting look-at point on the horizon. */
  lookY: number;
  /** Vertical field of view at rest. */
  fov: number;
}

/** Keeps the ridge line across the lower third of the stage at every aspect ratio. */
function getFraming(width: number, height: number): Framing {
  const aspect = width / Math.max(1, height);
  // Hold a roughly constant horizontal extent, bounded so tall phones don't fisheye.
  const hTan = aspect < 0.9 ? 0.46 : 0.5;
  const fov = THREE.MathUtils.clamp(
    THREE.MathUtils.radToDeg(2 * Math.atan(hTan / aspect)),
    36,
    64
  );

  if (width < 640) return { z: 12.2, y: 2.15, lookY: 1.8, fov };
  if (width < 1024) return { z: 9.2, y: 1.8, lookY: 1.55, fov };
  return { z: 8.6, y: 1.75, lookY: 1.5, fov };
}

/** Highest midground summit near the centre; the resting frame parks it just below the copy. */
const REFERENCE_CREST = new THREE.Vector3(3.5, 1.79, 0.93);

/**
 * Lens shift (fraction of stage height) that lowers the ridge line until its summit
 * sits a little below the overlay copy, keeping verticals straight instead of pitching.
 */
function getRestingShift(camera: THREE.PerspectiveCamera, framing: Framing, copyBottom: number) {
  camera.clearViewOffset();
  camera.position.set(0, framing.y, framing.z);
  camera.lookAt(0, framing.lookY, framing.z - 8.5);
  camera.fov = framing.fov;
  camera.updateProjectionMatrix();
  camera.updateMatrixWorld();

  const crest = REFERENCE_CREST.clone().project(camera);
  const crestFromTop = (1 - crest.y) / 2;
  // Short or narrow stages can't fit the ridges under tall copy; cap the drop so the
  // hills keep at least a third of the frame and let the copy mask handle any overlap.
  const target = Math.min(copyBottom + 0.05, 0.64);
  return THREE.MathUtils.clamp(target - crestFromTop, 0, 0.4);
}

function ParticleCanvas({ trackRef }: { trackRef?: RefObject<HTMLElement | null> }) {
  const hostRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const track = trackRef?.current ?? host.closest("section");

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 100);

    const renderer = new THREE.WebGLRenderer({
      alpha: true,
      // Points are antialiased in the fragment shader; MSAA on a full-screen canvas only costs frames.
      antialias: false,
      powerPreference: "high-performance",
    });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, MAX_PIXEL_RATIO));
    renderer.setClearColor(0x000000, 0);
    // setSize(..., false) leaves CSS sizing to us: pin the canvas to the stage, otherwise on
    // high-DPI screens it displays at drawing-buffer size and the hills fall below the fold.
    renderer.domElement.style.display = "block";
    renderer.domElement.style.width = "100%";
    renderer.domElement.style.height = "100%";
    // Fade the canvas in after its first frame instead of popping in over the page
    renderer.domElement.style.opacity = "0";
    renderer.domElement.style.transition = "opacity 1.2s cubic-bezier(0.22, 1, 0.36, 1)";
    host.appendChild(renderer.domElement);

    const uniforms = {
      uTime: { value: 0 },
      uPixelRatio: { value: Math.min(window.devicePixelRatio, MAX_PIXEL_RATIO) },
      uScrollProgress: { value: 0 },
      uOpen: { value: 0 },
      uDensity: { value: 1 },
      uSizeScale: { value: 1 },
      uCopyBottom: { value: 0.6 },
      uCopyVisible: { value: 1 },
    };

    const material = new THREE.ShaderMaterial({
      uniforms,
      vertexShader: VERTEX_SHADER,
      fragmentShader: FRAGMENT_SHADER,
      transparent: true,
      depthWrite: false,
      blending: THREE.NormalBlending,
    });

    const { positions, sizes, alphas, phases, layers, colors } = generateTerrainData();

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute("aSize", new THREE.BufferAttribute(sizes, 1));
    geometry.setAttribute("aAlpha", new THREE.BufferAttribute(alphas, 1));
    geometry.setAttribute("aPhase", new THREE.BufferAttribute(phases, 1));
    geometry.setAttribute("aLayer", new THREE.BufferAttribute(layers, 1));
    geometry.setAttribute("aColor", new THREE.BufferAttribute(colors, 3));

    const pointCloud = new THREE.Points(geometry, material);
    scene.add(pointCloud);

    // Celestial transient particle buffer (whisper-thin shooting stars & bolides)
    const CELESTIAL_COUNT = 80;
    const celestialGeom = new THREE.BufferGeometry();
    const celestialPositions = new Float32Array(CELESTIAL_COUNT * 3);
    const celestialSizes = new Float32Array(CELESTIAL_COUNT);
    const celestialAlphas = new Float32Array(CELESTIAL_COUNT);
    const celestialPhases = new Float32Array(CELESTIAL_COUNT);
    const celestialLayers = new Float32Array(CELESTIAL_COUNT).fill(3.5);
    const celestialColors = new Float32Array(CELESTIAL_COUNT * 3);

    for (let i = 0; i < CELESTIAL_COUNT; i++) {
      celestialPositions[i * 3 + 1] = -100; // start hidden offscreen
    }

    celestialGeom.setAttribute("position", new THREE.BufferAttribute(celestialPositions, 3));
    celestialGeom.setAttribute("aSize", new THREE.BufferAttribute(celestialSizes, 1));
    celestialGeom.setAttribute("aAlpha", new THREE.BufferAttribute(celestialAlphas, 1));
    celestialGeom.setAttribute("aPhase", new THREE.BufferAttribute(celestialPhases, 1));
    celestialGeom.setAttribute("aLayer", new THREE.BufferAttribute(celestialLayers, 1));
    celestialGeom.setAttribute("aColor", new THREE.BufferAttribute(celestialColors, 3));

    const celestialPoints = new THREE.Points(celestialGeom, material);
    scene.add(celestialPoints);

    // First appears ~2.5s after load, then at randomized 14-26s intervals
    const meteorState = {
      active: false,
      nextTrigger: 2.5,
      startX: 0,
      startY: 0,
      startZ: 0,
      dirX: 1,
      dirY: -0.24,
      dirZ: 0,
      distance: 4.8,
      startTime: 0,
      duration: 0.9,
      trailLength: 1.1,
      isAsteroid: false,
    };

    let framing = getFraming(host.clientWidth, host.clientHeight);
    let stageW = Math.max(1, host.clientWidth);
    let stageH = Math.max(1, host.clientHeight);
    let restingShift = 0.2;

    const triggerMeteor = (t: number) => {
      meteorState.active = true;
      meteorState.startTime = t;
      const isBolide = Math.random() < 0.25;
      meteorState.isAsteroid = isBolide;
      meteorState.duration = isBolide ? 1.35 + Math.random() * 0.3 : 0.85 + Math.random() * 0.2;
      meteorState.trailLength = isBolide ? 1.35 + Math.random() * 0.3 : 0.95 + Math.random() * 0.25;

      // Keep the streak in the open sky band just above the ridges, beside the headline
      const goRight = Math.random() < 0.6;
      meteorState.startX = goRight ? -4.4 + Math.random() * 1.4 : 4.4 - Math.random() * 1.4;
      meteorState.startY = framing.lookY + 0.35 + Math.random() * 0.3;
      meteorState.startZ = -0.5 + Math.random() * 0.6;

      const angle = goRight
        ? -0.2 - Math.random() * 0.16
        : -Math.PI + 0.2 + Math.random() * 0.16;

      meteorState.dirX = Math.cos(angle);
      meteorState.dirY = Math.sin(angle);
      meteorState.dirZ = -0.04;
      meteorState.distance = 4.4 + Math.random() * 1.4;

      meteorState.nextTrigger = t + meteorState.duration + (14.0 + Math.random() * 12.0);
    };

    // Track geometry and scroll position are cached so the render loop never touches layout,
    // and every frame reads a scroll value from the same point in the frame.
    let trackTop = 0;
    let trackDistance = 1;
    let scrollY = window.scrollY;
    const measureTrack = () => {
      if (!track) return;
      const rect = track.getBoundingClientRect();
      trackTop = rect.top + window.scrollY;
      // Pinned stretch only: the flight must be complete when the stage unpins.
      trackDistance = Math.max(1, rect.height - host.clientHeight);
    };
    const handleScroll = () => {
      scrollY = window.scrollY;
    };
    window.addEventListener("scroll", handleScroll, { passive: true });

    const readScrollTarget = () => {
      const raw = clamp01((scrollY - trackTop) / trackDistance);
      // Deadzone: a resting finger or a single wheel nudge must not move the scene.
      return clamp01((raw - SCROLL_DEADZONE) / (1 - SCROLL_DEADZONE));
    };

    const resize = () => {
      const { width, height } = host.getBoundingClientRect();
      if (width === 0 || height === 0) return;

      renderer.setSize(width, height, false);
      camera.aspect = width / height;
      framing = getFraming(width, height);
      stageW = width;
      stageH = height;

      // Copy bottom in layout space (ignores the flight transform), as a fraction of the stage.
      const copy = track?.querySelector<HTMLElement>("[data-hero-copy]");
      const copyBottom = copy ? (copy.offsetTop + copy.offsetHeight) / height : 0.55;
      restingShift = getRestingShift(camera, framing, Math.min(copyBottom, 0.74));
      uniforms.uCopyBottom.value = copyBottom;
      uniforms.uDensity.value = width < 640 ? 0.44 : width < 1024 ? 0.72 : 1;
      uniforms.uSizeScale.value = width < 640 ? 0.9 : 1;
      uniforms.uPixelRatio.value = Math.min(window.devicePixelRatio, MAX_PIXEL_RATIO);
      measureTrack();
    };

    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(host);
    if (track) observer.observe(track);
    const copyElement = track?.querySelector<HTMLElement>("[data-hero-copy]") ?? null;
    if (copyElement) observer.observe(copyElement);

    // Copy holds while the ridges approach, then lifts and fades before the climb.
    let lastCopyFade = -1;
    let lastCopyLift = -1;
    const updateCopy = (p: number) => {
      if (!copyElement) return;
      const fade = Math.round((1 - ease(0.3, 0.5, p)) * 1000) / 1000;
      const lift = Math.round(ease(0.22, 0.52, p) * 1000) / 1000;
      if (fade === lastCopyFade && lift === lastCopyLift) return;
      lastCopyFade = fade;
      lastCopyLift = lift;
      copyElement.style.opacity = String(fade);
      uniforms.uCopyVisible.value = fade;
      copyElement.style.transform = `translate3d(0, ${(-lift * 12).toFixed(2)}svh, 0)`;
      copyElement.style.pointerEvents = fade < 0.5 ? "none" : "";
    };

    // Critically damped spring on flight progress: scroll input only sets the target,
    // the camera glides there with weight and never overshoots.
    let progress = readScrollTarget();
    let progressVelocity = 0;

    let animationFrameId = 0;
    const startTime = performance.now();
    let lastTime = startTime;
    let drewFinalFrame = false;
    let stageHidden = false;
    let revealed = false;

    const animate = (currentTime: number) => {
      animationFrameId = requestAnimationFrame(animate);

      const elapsed = (currentTime - startTime) * 0.001;
      const dt = Math.min(0.1, (currentTime - lastTime) * 0.001);
      lastTime = currentTime;
      uniforms.uTime.value = elapsed;

      const target = readScrollTarget();
      const steps = Math.max(1, Math.ceil(dt / (1 / 120)));
      const h = dt / steps;
      for (let i = 0; i < steps; i++) {
        const accel =
          SPRING_OMEGA * SPRING_OMEGA * (target - progress) - 2 * SPRING_OMEGA * progressVelocity;
        progressVelocity += accel * h;
        progress += progressVelocity * h;
      }
      if (Math.abs(target - progress) < 1e-4 && Math.abs(progressVelocity) < 1e-4) {
        progress = target;
        progressVelocity = 0;
      }
      const p = clamp01(progress);

      updateCopy(p);

      // Past the pin the unpinned stage overlaps the sections below by a full viewport, and its
      // edge fades would veil their text (those sections aren't positioned, so it paints above).
      // Everything in it has dissolved by then, so hide it outright.
      const pastPin = scrollY > trackTop + trackDistance + 1;
      if (track && pastPin !== stageHidden) {
        stageHidden = pastPin;
        track.style.visibility = pastPin ? "hidden" : "";
      }

      // Scene is fully dissolved: nothing left to draw.
      const finished = p >= 0.98 && target >= 0.98;
      if (finished && drewFinalFrame) return;
      drewFinalFrame = finished;

      uniforms.uScrollProgress.value = p;
      uniforms.uOpen.value = easeSoft(0.02, 0.72, p);

      // Straight flight toward the horizon. First the camera eases down to ridge
      // height and glides forward, so the summits hold the horizon line while they
      // grow and part to the sides; then it climbs and lifts its gaze into the sky
      // as the last of the terrain dissolves beneath.
      const cruise = easeSoft(0.0, 0.8, p);
      const settle = ease(0.0, 0.36, p);
      const climb = ease(0.4, 0.88, p);
      const gaze = ease(0.45, 0.92, p);
      // Once the copy has lifted away the ridges rise into the freed frame.
      const reveal = ease(0.42, 0.64, p);

      const camZ = framing.z - cruise * 6.4;
      const camY = framing.y - settle * 0.3 + climb * 1.3;
      camera.position.set(0, camY, camZ);
      camera.lookAt(0, camY + (framing.lookY - framing.y) + gaze * 1.5, camZ - 8.5);

      camera.fov = framing.fov + cruise * 3;
      // Lens shift eases out as the gaze lifts, so the final frame is open, centred sky.
      const shift = restingShift * (1 - reveal * 0.55 - gaze * 0.3);
      camera.setViewOffset(stageW, stageH, 0, -stageH * shift, stageW, stageH);
      camera.updateProjectionMatrix();

      // Transients dissolve along with the sky
      const transientFade = 1 - ease(0.3, 0.55, p);

      if (p < 0.25 && !meteorState.active && elapsed >= meteorState.nextTrigger) {
        triggerMeteor(elapsed);
      }

      if (meteorState.active) {
        const mProgress = (elapsed - meteorState.startTime) / meteorState.duration;
        if (mProgress >= 1.0 || transientFade <= 0.001) {
          meteorState.active = false;
          for (let i = 0; i < CELESTIAL_COUNT; i++) {
            celestialAlphas[i] = 0;
            celestialPositions[i * 3 + 1] = -100;
          }
          celestialGeom.attributes.position.needsUpdate = true;
          celestialGeom.attributes.aAlpha.needsUpdate = true;
        } else {
          // Flight envelope: quick emergence, luminous cruise, graceful fadeout
          const flightEnvelope =
            (mProgress < 0.12
              ? mProgress / 0.12
              : mProgress < 0.7
              ? 1.0
              : Math.max(0, 1.0 - (mProgress - 0.7) / 0.3)) * transientFade;

          const currentDist = meteorState.distance * mProgress;
          const headX = meteorState.startX + meteorState.dirX * currentDist;
          const headY = meteorState.startY + meteorState.dirY * currentDist;
          const headZ = meteorState.startZ + meteorState.dirZ * currentDist;

          celestialPositions[0] = headX;
          celestialPositions[1] = headY;
          celestialPositions[2] = headZ;
          celestialSizes[0] = meteorState.isAsteroid ? 0.06 : 0.046;
          celestialAlphas[0] = flightEnvelope * 0.62;
          celestialColors[0] = 18 / 255;
          celestialColors[1] = 26 / 255;
          celestialColors[2] = 40 / 255;

          const trailPts = CELESTIAL_COUNT - 1;
          const activeTrailLength = meteorState.trailLength * Math.min(1.0, mProgress * 2.8);

          for (let k = 1; k <= trailPts; k++) {
            const frac = k / trailPts;
            const lagDist = frac * activeTrailLength;

            const jitterScale = 0.0015 + frac * 0.0055;
            const perpX = -meteorState.dirY * jitterScale * Math.sin(k * 4.1 + elapsed * 12.0);
            const perpY = meteorState.dirX * jitterScale * Math.cos(k * 3.3 + elapsed * 12.0);

            celestialPositions[k * 3] = headX - meteorState.dirX * lagDist + perpX;
            celestialPositions[k * 3 + 1] = headY - meteorState.dirY * lagDist + perpY;
            celestialPositions[k * 3 + 2] = headZ - meteorState.dirZ * lagDist;

            celestialSizes[k] = Math.max(0.016, 0.042 * (1.0 - frac * 0.75));
            celestialAlphas[k] = flightEnvelope * Math.pow(1.0 - frac, 1.4) * 0.48;

            const slateFrac = frac * 0.75;
            celestialColors[k * 3] = (18 + (80 - 18) * slateFrac) / 255;
            celestialColors[k * 3 + 1] = (26 + (96 - 26) * slateFrac) / 255;
            celestialColors[k * 3 + 2] = (40 + (118 - 40) * slateFrac) / 255;
          }

          celestialGeom.attributes.position.needsUpdate = true;
          celestialGeom.attributes.aSize.needsUpdate = true;
          celestialGeom.attributes.aAlpha.needsUpdate = true;
          celestialGeom.attributes.aColor.needsUpdate = true;
        }
      }

      renderer.render(scene, camera);
      if (!revealed) {
        revealed = true;
        renderer.domElement.style.opacity = "1";
      }
    };

    animationFrameId = requestAnimationFrame(animate);

    return () => {
      cancelAnimationFrame(animationFrameId);
      observer.disconnect();
      window.removeEventListener("scroll", handleScroll);
      track?.style.removeProperty("visibility");
      copyElement?.style.removeProperty("opacity");
      copyElement?.style.removeProperty("transform");
      copyElement?.style.removeProperty("pointer-events");
      geometry.dispose();
      celestialGeom.dispose();
      material.dispose();
      renderer.dispose();
      renderer.domElement.remove();
    };
  }, [trackRef]);

  return <div ref={hostRef} className="absolute inset-0 h-full w-full" />;
}

/**
 * Generates natural, fluent, abstract mountain ranges and stars.
 * Utilizes continuous 3D surface stippling with normal-based directional shading,
 * continuous fine-stippled crest spines, and organic point distributions.
 * Strictly avoids artificial concentration of large particles in peaks.
 */
function generateTerrainData() {
  const points: {
    x: number;
    y: number;
    z: number;
    size: number;
    alpha: number;
    phase: number;
    layer: number;
    r: number;
    g: number;
    b: number;
  }[] = [];

  // Color constants tuned for light canvas (#fbfaf8)
  // Deep editorial ink charcoal (#0f172a / #111827)
  const cInkDark = { r: 15 / 255, g: 23 / 255, b: 42 / 255 };
  // Subtle teal/forest accent undertone (#0d332d)
  const cTealAccent = { r: 13 / 255, g: 51 / 255, b: 45 / 255 };
  // Midground slate charcoal (#334155)
  const cSlateMid = { r: 51 / 255, g: 65 / 255, b: 85 / 255 };
  // Background alpine slate (#475569)
  const cSlateBg = { r: 71 / 255, g: 85 / 255, b: 105 / 255 };
  // Distant peaks / mist (#64748b)
  const cSlateDistant = { r: 100 / 255, g: 116 / 255, b: 139 / 255 };
  // Horizon mist (#94a3b8)
  const cHorizon = { r: 148 / 255, g: 163 / 255, b: 184 / 255 };
  // Celestial stars (#1e293b)
  const cStar = { r: 26 / 255, g: 38 / 255, b: 57 / 255 };

  // Natural fine particle sizing (increased slightly for enhanced legibility)
  // 82% micro-stipples (~2.2-3.2px), 15% medium stipples (~3.4-4.4px), 3% accent glints (~4.6-5.8px)
  // Strictly avoids large bead clumps on peaks
  const getNaturalSize = () => {
    const rnd = Math.random();
    if (rnd < 0.82) return 0.040 + Math.random() * 0.020;
    if (rnd < 0.97) return 0.064 + Math.random() * 0.022;
    return 0.088 + Math.random() * 0.024;
  };

  /* ==========================================================================
   * 1. FOREGROUND HILL (Layer 0) — Sweeping Sinuous Dune / Coastal Ridge
   * S-curve crest sweeping smoothly from left to right, framing the center
   * ========================================================================== */
  const fgCrestZ = (x: number) => 2.35 + 0.35 * Math.sin(x * 0.28 + 0.4);

  const fgHeight = (x: number, z: number) => {
    const crestZ = fgCrestZ(x);
    // Crest elevation: peaks on flanks, gentle inviting dip in center
    const crestY =
      0.32 +
      0.68 * Math.exp(-((x + 4.0) ** 2) / 20.0) +
      0.54 * Math.exp(-((x - 5.2) ** 2) / 16.0) +
      0.14 * Math.sin(x * 0.58 - 0.4);

    const dz = z - crestZ;
    let slope = 0;
    if (dz < 0) {
      slope = -Math.pow(Math.abs(dz) * 1.8, 1.5) * 0.85;
    } else {
      slope = -Math.pow(dz * 0.95, 1.35) * 0.72;
    }

    const ripple =
      0.024 * Math.sin(x * 2.2 + z * 3.1) +
      0.015 * Math.cos(x * 4.4 - z * 1.8);

    return crestY + slope + ripple;
  };

  // 1A. Foreground Crest Spine (Dense, continuous fine stipple line)
  const fgSpineCount = 1100;
  for (let i = 0; i < fgSpineCount; i++) {
    const t = i / (fgSpineCount - 1);
    const x = (t - 0.5) * 26 + (Math.random() - 0.5) * 0.06;
    const z = fgCrestZ(x) + (Math.random() - 0.5) * 0.04;
    const y = fgHeight(x, z) + (Math.random() - 0.5) * 0.02;

    const col = Math.random() < 0.16 ? cTealAccent : cInkDark;
    points.push({
      x,
      y,
      z,
      size: getNaturalSize(),
      alpha: 0.84 + Math.random() * 0.16,
      phase: Math.random() * 6.28,
      layer: 0.0,
      r: col.r,
      g: col.g,
      b: col.b,
    });
  }

  // 1B. Foreground Surface Stippling with directional shading
  const fgTarget = 13200;
  let fgGenerated = 0;
  let fgAttempts = 0;
  while (fgGenerated < fgTarget && fgAttempts < 70000) {
    fgAttempts++;
    const x = (Math.random() - 0.5) * 27;
    const dz = -0.5 + Math.random() * 2.2;
    const z = fgCrestZ(x) + dz;
    const y = fgHeight(x, z);

    if (y < -0.90) continue;

    const eps = 0.08;
    const sx = (fgHeight(x + eps, z) - fgHeight(x - eps, z)) / (2 * eps);
    const sz = (fgHeight(x, z + eps) - fgHeight(x, z - eps)) / (2 * eps);
    const len = Math.sqrt(sx * sx + 1.0 + sz * sz);
    const ny = 1.0 / len;
    const nx = -sx / len;
    const nz = -sz / len;

    const dotL = nx * 0.55 + ny * 0.70 + nz * 0.45;
    const shadow = 1.0 - Math.max(0.0, Math.min(1.0, (dotL - 0.2) / 0.7));

    const distToCrest = Math.abs(dz);
    const crestBoost = Math.exp(-(distToCrest ** 2) / 0.14);
    const contour = 0.5 + 0.5 * Math.sin(y * 14.0 + x * 0.8);
    const acceptProb = 0.32 + 0.44 * shadow + 0.36 * crestBoost + 0.16 * contour;

    if (Math.random() > acceptProb) continue;

    const size = getNaturalSize();
    const alpha = Math.min(0.95, Math.max(0.24, 0.46 + 0.34 * shadow + 0.24 * crestBoost));
    const useTeal = Math.random() < 0.14 && crestBoost > 0.35;
    const col = useTeal ? cTealAccent : cInkDark;

    points.push({
      x,
      y,
      z,
      size,
      alpha,
      phase: Math.random() * 6.28,
      layer: 0.0,
      r: col.r,
      g: col.g,
      b: col.b,
    });
    fgGenerated++;
  }

  /* ==========================================================================
   * 2. MIDGROUND MOUNTAINS (Layer 1) — Sculpted Alpine Ridge & Couloirs
   * Distinct mountain summits on the flanks with a wide, open central saddle
   * ========================================================================== */
  const mgCrestZ = (x: number) => 0.85 + 0.25 * Math.cos(x * 0.35);

  const mgHeight = (x: number, z: number) => {
    const crestZ = mgCrestZ(x);

    // Flank alpine summits with an open central pass beneath the CTA
    const p1 = 1.25 * Math.exp(-((x + 4.8) ** 2) / 6.5); // Western pyramid (Y ~ 1.45)
    const p2 = 1.15 * Math.exp(-((x - 3.8) ** 2) / 5.5); // Eastern pyramid (Y ~ 1.35)
    const p3 = 0.28 * Math.exp(-((x + 0.4) ** 2) / 5.0); // Gentle low central dip
    const p4 = 0.72 * Math.exp(-((x - 7.8) ** 2) / 8.5); // Far eastern ridge

    // Knife-edge arête harmonics
    const arete =
      0.16 * (1.0 - Math.abs(Math.sin(x * 0.85 + 1.2))) +
      0.08 * Math.sin(x * 1.8 - 0.4);

    const crestY = 0.58 + p1 + p2 + p3 + p4 + arete;

    const dz = z - crestZ;
    const slope = -Math.pow(Math.abs(dz) * 1.35, 1.35) * 1.15;

    const couloir =
      0.038 * Math.sin(x * 1.6 + z * 3.4) +
      0.022 * Math.cos(x * 3.2 - z * 2.0);

    return crestY + slope + couloir;
  };

  // 2A. Midground Crest & Arêtes (Continuous fine stipple spine)
  const mgSpineCount = 1280;
  for (let i = 0; i < mgSpineCount; i++) {
    const t = i / (mgSpineCount - 1);
    const x = (t - 0.5) * 29 + (Math.random() - 0.5) * 0.08;
    const z = mgCrestZ(x) + (Math.random() - 0.5) * 0.05;
    const y = mgHeight(x, z) + (Math.random() - 0.5) * 0.025;

    const useTeal = Math.random() < 0.12;
    const col = useTeal ? cTealAccent : cSlateMid;

    points.push({
      x,
      y,
      z,
      size: getNaturalSize(),
      alpha: 0.78 + Math.random() * 0.20,
      phase: Math.random() * 6.28,
      layer: 1.0,
      r: col.r,
      g: col.g,
      b: col.b,
    });
  }

  // 2B. Midground Surface Stipples with rock strata & couloir shading
  const mgTarget = 17600;
  let mgGenerated = 0;
  let mgAttempts = 0;
  while (mgGenerated < mgTarget && mgAttempts < 90000) {
    mgAttempts++;
    const x = (Math.random() - 0.5) * 30;
    const dz = -0.7 + Math.random() * 2.2;
    const z = mgCrestZ(x) + dz;
    const y = mgHeight(x, z);

    if (y < -0.55) continue;

    const eps = 0.08;
    const sx = (mgHeight(x + eps, z) - mgHeight(x - eps, z)) / (2 * eps);
    const sz = (mgHeight(x, z + eps) - mgHeight(x, z - eps)) / (2 * eps);
    const len = Math.sqrt(sx * sx + 1.0 + sz * sz);
    const ny = 1.0 / len;
    const nx = -sx / len;
    const nz = -sz / len;

    const dotL = nx * 0.55 + ny * 0.70 + nz * 0.45;
    const shadow = 1.0 - Math.max(0.0, Math.min(1.0, (dotL - 0.2) / 0.7));

    const distToCrest = Math.abs(dz);
    const crestBoost = Math.exp(-(distToCrest ** 2) / 0.15);
    const rockStrata = 0.5 + 0.5 * Math.sin(y * 12.0 + x * 1.2 + z * 2.0);
    const acceptProb = 0.30 + 0.44 * shadow + 0.38 * crestBoost + 0.18 * rockStrata;

    if (Math.random() > acceptProb) continue;

    const size = getNaturalSize();
    const alpha = Math.min(0.88, Math.max(0.20, 0.38 + 0.36 * shadow + 0.24 * crestBoost));
    const useTeal = Math.random() < 0.10 && crestBoost > 0.3;
    const col = useTeal ? cTealAccent : cSlateMid;

    points.push({
      x,
      y,
      z,
      size,
      alpha,
      phase: Math.random() * 6.28,
      layer: 1.0,
      r: col.r,
      g: col.g,
      b: col.b,
    });
    mgGenerated++;
  }

  /* ==========================================================================
   * 3. BACKGROUND ALPINE MASSIF (Layer 2) — Distant Horizons & Side Summits
   * Lowered profile with a wide open central pass, framing the CTA with ample air
   * ========================================================================== */
  const bgCrestZ = (x: number) => -1.2 + 0.3 * Math.sin(x * 0.22);

  const bgHeight = (x: number, z: number) => {
    const crestZ = bgCrestZ(x);

    // Distant mountain summits concentrated on the flanks, kept low in the center
    const p1 = 1.10 * Math.exp(-((x + 7.5) ** 2) / 9.5); // Far western summit
    const p2 = 1.05 * Math.exp(-((x - 7.2) ** 2) / 9.0); // Far eastern summit
    const p3 = 0.55 * Math.exp(-((x + 4.2) ** 2) / 6.0); // West shoulder
    const p4 = 0.48 * Math.exp(-((x - 4.5) ** 2) / 6.0); // East shoulder
    const pCenter = 0.18 * Math.exp(-((x + 0.2) ** 2) / 10.0); // Minimal central rise

    const crag =
      0.12 * (1.0 - Math.abs(Math.cos(x * 0.95 + 0.3))) +
      0.06 * Math.sin(x * 1.9);

    const crestY = 0.65 + p1 + p2 + p3 + p4 + pCenter + crag;

    const dz = z - crestZ;
    const slope = -Math.pow(Math.abs(dz) * 1.2, 1.4) * 1.3;

    const texture = 0.04 * Math.sin(x * 1.3 + z * 2.8);

    return crestY + slope + texture;
  };

  // 3A. Background Crest Spine
  const bgSpineCount = 1150;
  for (let i = 0; i < bgSpineCount; i++) {
    const t = i / (bgSpineCount - 1);
    const x = (t - 0.5) * 33 + (Math.random() - 0.5) * 0.10;
    const z = bgCrestZ(x) + (Math.random() - 0.5) * 0.06;
    const y = bgHeight(x, z) + (Math.random() - 0.5) * 0.03;

    points.push({
      x,
      y,
      z,
      size: getNaturalSize(),
      alpha: 0.72 + Math.random() * 0.20,
      phase: Math.random() * 6.28,
      layer: 2.0,
      r: cSlateBg.r,
      g: cSlateBg.g,
      b: cSlateBg.b,
    });
  }

  // 3B. Background Surface Stipples
  const bgTarget = 14000;
  let bgGenerated = 0;
  let bgAttempts = 0;
  while (bgGenerated < bgTarget && bgAttempts < 80000) {
    bgAttempts++;
    const x = (Math.random() - 0.5) * 34;
    const dz = -0.8 + Math.random() * 2.2;
    const z = bgCrestZ(x) + dz;
    const y = bgHeight(x, z);

    if (y < -0.15) continue;

    const eps = 0.1;
    const sx = (bgHeight(x + eps, z) - bgHeight(x - eps, z)) / (2 * eps);
    const sz = (bgHeight(x, z + eps) - bgHeight(x, z - eps)) / (2 * eps);
    const len = Math.sqrt(sx * sx + 1.0 + sz * sz);
    const ny = 1.0 / len;
    const nx = -sx / len;
    const nz = -sz / len;

    const dotL = nx * 0.55 + ny * 0.70 + nz * 0.45;
    const shadow = 1.0 - Math.max(0.0, Math.min(1.0, (dotL - 0.2) / 0.7));

    const distToCrest = Math.abs(dz);
    const crestBoost = Math.exp(-(distToCrest ** 2) / 0.16);
    const acceptProb = 0.28 + 0.42 * shadow + 0.36 * crestBoost;

    if (Math.random() > acceptProb) continue;

    const size = getNaturalSize();
    const alpha = Math.min(0.76, Math.max(0.16, 0.32 + 0.30 * shadow + 0.22 * crestBoost));
    const col = dz > 0.6 ? cSlateDistant : cSlateBg;

    points.push({
      x,
      y,
      z,
      size,
      alpha,
      phase: Math.random() * 6.28,
      layer: 2.0,
      r: col.r,
      g: col.g,
      b: col.b,
    });
    bgGenerated++;
  }

  /* ==========================================================================
   * 4. DISTANT HORIZON MIST (Layer 2.5) — Atmospheric Depth
   * ========================================================================== */
  const horizonCount = 1400;
  for (let i = 0; i < horizonCount; i++) {
    const x = (Math.random() - 0.5) * 38;
    const y = -0.2 + Math.random() * 1.5;
    const z = -3.4 + (Math.random() - 0.5) * 1.6;

    points.push({
      x,
      y,
      z,
      size: 0.034 + Math.random() * 0.016,
      alpha: 0.16 + Math.random() * 0.24,
      phase: Math.random() * 6.28,
      layer: 2.5,
      r: cHorizon.r,
      g: cHorizon.g,
      b: cHorizon.b,
    });
  }

  /* ==========================================================================
   * 5. STARS IN THE SKY (Layer 3) — Deep Celestial Canopy
   * Filled per depth slice so the whole visible sky carries stars, from just above
   * the summits up past the top of the frame the climbing camera will look into.
   * ========================================================================== */
  const starCount = 720;
  for (let i = 0; i < starCount; i++) {
    const z = -2.5 - Math.pow(Math.random(), 0.9) * 13.5;
    const depth = 8.6 - z; // distance from the resting camera
    const halfWidth = depth * 0.74;
    const x = (Math.random() - 0.5) * 2 * halfWidth;

    const terrainY = Math.max(
      fgHeight(x, fgCrestZ(x)),
      mgHeight(x, mgCrestZ(x)),
      bgHeight(x, bgCrestZ(x))
    );
    const yBase = Math.max(1.5, terrainY + 0.3);
    const y = yBase + Math.random() * (1.2 + depth * 0.62);

    // Mostly fine pinpricks, a few mid stars, and rare bright anchors
    const rnd = Math.random();
    let size: number;
    let alpha: number;
    if (rnd < 0.78) {
      size = 0.044 + Math.random() * 0.028;
      alpha = 0.52 + Math.random() * 0.34;
    } else if (rnd < 0.95) {
      size = 0.078 + Math.random() * 0.028;
      alpha = 0.72 + Math.random() * 0.24;
    } else {
      size = 0.112 + Math.random() * 0.036;
      alpha = 0.9 + Math.random() * 0.1;
    }

    const col = Math.random() < 0.1 ? cTealAccent : rnd >= 0.95 ? cInkDark : cStar;
    points.push({
      x,
      y,
      z,
      size,
      alpha,
      phase: Math.random() * 6.28,
      layer: 3.0,
      r: col.r,
      g: col.g,
      b: col.b,
    });
  }

  /* ==========================================================================
   * 5B. ZENITH STARS (Layer 3.1) — The Sky The Flight Climbs Into
   * Spread through the frustum of the camera's final climbing pose, so the frame
   * keeps gaining stars as it approaches the sky instead of emptying out.
   * ========================================================================== */
  const zenithEye = new THREE.Vector3(0, 2.75, 2.2);
  const zenithForward = new THREE.Vector3(0, 1.25, -8.5).normalize();
  const zenithRight = new THREE.Vector3(1, 0, 0);
  const zenithUp = new THREE.Vector3().crossVectors(zenithRight, zenithForward).normalize();
  const zenithCount = 900;
  for (let i = 0; i < zenithCount; i++) {
    const depth = 5 + Math.pow(Math.random(), 0.8) * 13;
    const across = (Math.random() - 0.5) * 2 * depth * 0.78;
    const upward = (Math.random() - 0.35) * 2 * depth * 0.42;
    const point = zenithEye
      .clone()
      .addScaledVector(zenithForward, depth)
      .addScaledVector(zenithRight, across)
      .addScaledVector(zenithUp, upward);

    // Keep clear of the ridges so zenith stars only ever read as sky
    const terrainY = Math.max(
      fgHeight(point.x, fgCrestZ(point.x)),
      mgHeight(point.x, mgCrestZ(point.x)),
      bgHeight(point.x, bgCrestZ(point.x))
    );
    if (point.y < terrainY + 0.6) continue;

    const rnd = Math.random();
    const size =
      rnd < 0.8 ? 0.046 + Math.random() * 0.028 : rnd < 0.96 ? 0.08 + Math.random() * 0.03 : 0.115 + Math.random() * 0.035;
    const alpha = rnd < 0.8 ? 0.5 + Math.random() * 0.35 : 0.75 + Math.random() * 0.25;
    const col = Math.random() < 0.1 ? cTealAccent : rnd >= 0.96 ? cInkDark : cStar;

    points.push({
      x: point.x,
      y: point.y,
      z: point.z,
      size,
      alpha,
      phase: Math.random() * 6.28,
      layer: 3.1,
      r: col.r,
      g: col.g,
      b: col.b,
    });
  }

  /* ==========================================================================
   * 6. SKY DUST (Layer 3.3) — Faint Atmosphere Above The Ridges
   * A thin veil densest just over the summits and thinning upward, giving the
   * sky texture and depth without competing with the headline.
   * ========================================================================== */
  const dustCount = 650;
  for (let i = 0; i < dustCount; i++) {
    const z = -1.5 - Math.random() * 7.5;
    const depth = 8.6 - z;
    const x = (Math.random() - 0.5) * 2 * depth * 0.74;
    const lift = Math.pow(Math.random(), 2.2); // bias toward the horizon
    const y = 1.2 + lift * (1.0 + depth * 0.45);

    points.push({
      x,
      y,
      z,
      size: 0.026 + Math.random() * 0.016,
      alpha: (0.08 + Math.random() * 0.12) * (1 - lift * 0.7),
      phase: Math.random() * 6.28,
      layer: 3.3,
      r: cHorizon.r,
      g: cHorizon.g,
      b: cHorizon.b,
    });
  }

  // Convert to typed arrays for THREE.BufferGeometry
  const total = points.length;
  const positions = new Float32Array(total * 3);
  const sizes = new Float32Array(total);
  const alphas = new Float32Array(total);
  const phases = new Float32Array(total);
  const layers = new Float32Array(total);
  const colors = new Float32Array(total * 3);

  for (let i = 0; i < total; i++) {
    const p = points[i];
    positions[i * 3] = p.x;
    positions[i * 3 + 1] = p.y;
    positions[i * 3 + 2] = p.z;

    sizes[i] = p.size;
    alphas[i] = p.alpha;
    phases[i] = p.phase;
    layers[i] = p.layer;

    colors[i * 3] = p.r;
    colors[i * 3 + 1] = p.g;
    colors[i * 3 + 2] = p.b;
  }

  return { positions, sizes, alphas, phases, layers, colors };
}

/**
 * Clean static fallback for reduced-motion / non-WebGL environments.
 * Renders an editorial SVG stippled contour silhouette.
 */
function StaticLandscape() {
  return (
    <div className="absolute inset-0 flex items-end justify-center overflow-hidden opacity-60">
      <svg
        viewBox="0 0 1200 400"
        className="h-full w-full object-cover"
        preserveAspectRatio="xMidYMax slice"
      >
        <path
          d="M0,320 Q200,240 380,260 T760,200 T1200,270 L1200,400 L0,400 Z"
          fill="none"
          stroke="#111827"
          strokeWidth="1.2"
          strokeDasharray="2 6"
          opacity="0.5"
        />
        <path
          d="M0,360 Q280,290 520,320 T940,280 T1200,340 L1200,400 L0,400 Z"
          fill="none"
          stroke="#111827"
          strokeWidth="1.5"
          strokeDasharray="1.5 5"
          opacity="0.75"
        />
      </svg>
    </div>
  );
}

