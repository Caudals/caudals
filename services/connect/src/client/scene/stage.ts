import {
  CanvasTexture,
  ExtrudeGeometry,
  Group,
  LinearFilter,
  LinearMipmapLinearFilter,
  Mesh,
  NoColorSpace,
  PerspectiveCamera,
  PlaneGeometry,
  Scene,
  ShaderMaterial,
  Shape,
  Vector2,
  Vector3,
  WebGLRenderer,
} from 'three';
import { cardFragment, cardVertex, flowFragment, flowVertex } from './glsl.ts';
import { CARD_RATIO, drawBack, drawFront, fontsReady, type FaceData } from './textures.ts';

type Rgb = readonly [number, number, number];
const hex = (h: string): Rgb => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255) as unknown as Rgb;

interface Theme {
  bg: Rgb;
  line: Rgb;
  pulse: Rgb;
  glow: Rgb;
  shadow: Rgb;
  lineAlpha: number;
  pulseAlpha: number;
  glowAlpha: number;
  shadowAlpha: number;
  ambient: number;
  foilBoost: number;
  base: number;
  rim: number;
}

const LIGHT: Theme = {
  bg: hex('#fafaf8'),
  line: hex('#141413'),
  pulse: hex('#141413'),
  glow: hex('#ffffff'),
  shadow: hex('#1c1b18'),
  lineAlpha: 0.15,
  pulseAlpha: 0.62,
  glowAlpha: 0,
  shadowAlpha: 0.2,
  ambient: 0.11,
  foilBoost: 1,
  base: 0.046,
  rim: 0.05,
};

const DARK: Theme = {
  bg: hex('#0c0c0b'),
  line: hex('#f2f1ec'),
  pulse: hex('#ffffff'),
  glow: hex('#f2f1ec'),
  shadow: hex('#000000'),
  lineAlpha: 0.12,
  pulseAlpha: 0.85,
  glowAlpha: 0.11,
  shadowAlpha: 0.6,
  ambient: 0.08,
  foilBoost: 1.1,
  base: 0.082,
  rim: 0.16,
};

export interface Still {
  rotX: number;
  rotY: number;
  time: number;
  sweep?: number;
  presence?: number;
  hideCard?: boolean;
  grain?: number;
}

export interface SceneOptions {
  canvas: HTMLCanvasElement;
  stage: HTMLElement;
  /** Where the card rests, in viewport coordinates (the flat card). */
  anchor: () => DOMRect | null;
  face: FaceData;
  dark: boolean;
  reducedMotion: boolean;
  still?: Still;
  onReady?: () => void;
  onInteract?: () => void;
  onFlip?: (back: boolean) => void;
}

export interface StageScene {
  setDark(dark: boolean): void;
  setReducedMotion(reduce: boolean): void;
  /** iOS asks for motion access from a tap; resolves to whether tilt is on. */
  enableTilt(): Promise<boolean>;
  tiltNeedsPermission: boolean;
  /** True once the device has reported an orientation. */
  tiltActive(): boolean;
  flip(): void;
  dispose(): void;
}

const CARD_W = 8.56;
const CARD_H = CARD_W / CARD_RATIO;
const SPACING_CSS = 15;

const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));
const easeOut = (x: number) => 1 - Math.pow(1 - clamp(x, 0, 1), 3);

function cardShape(w: number, h: number, r: number): Shape {
  const s = new Shape();
  const x = -w / 2;
  const y = -h / 2;
  s.moveTo(x + r, y);
  s.lineTo(x + w - r, y);
  s.absarc(x + w - r, y + r, r, -Math.PI / 2, 0, false);
  s.lineTo(x + w, y + h - r);
  s.absarc(x + w - r, y + h - r, r, 0, Math.PI / 2, false);
  s.lineTo(x + r, y + h);
  s.absarc(x + r, y + h - r, r, Math.PI / 2, Math.PI, false);
  s.lineTo(x, y + r);
  s.absarc(x + r, y + r, r, Math.PI, Math.PI * 1.5, false);
  return s;
}

function maskTexture(canvas: HTMLCanvasElement, anisotropy: number): CanvasTexture {
  const t = new CanvasTexture(canvas);
  t.colorSpace = NoColorSpace;
  t.generateMipmaps = true;
  t.minFilter = LinearMipmapLinearFilter;
  t.magFilter = LinearFilter;
  t.anisotropy = anisotropy;
  t.needsUpdate = true;
  return t;
}

export async function createStage(o: SceneOptions): Promise<StageScene> {
  const still = o.still;
  const renderer = new WebGLRenderer({
    canvas: o.canvas,
    antialias: true,
    alpha: false,
    powerPreference: 'high-performance',
    preserveDrawingBuffer: Boolean(still),
  });
  renderer.autoClear = true;

  let theme = o.dark ? DARK : LIGHT;
  let motion = o.reducedMotion ? 0 : 1;

  const scene = new Scene();
  const camera = new PerspectiveCamera(24, 1, 1, 400);

  const flowUniforms = {
    uRes: { value: new Vector2(1, 1) },
    uDpr: { value: 1 },
    uTime: { value: 0 },
    uMotion: { value: motion },
    uCenter: { value: new Vector2() },
    uHalf: { value: new Vector2(1, 1) },
    uAngle: { value: 0 },
    uPresence: { value: 0 },
    uPointer: { value: new Vector3() },
    uBg: { value: new Vector3() },
    uLine: { value: new Vector3() },
    uPulse: { value: new Vector3() },
    uGlow: { value: new Vector3() },
    uLineAlpha: { value: 0 },
    uPulseAlpha: { value: 0 },
    uGlowAlpha: { value: 0 },
    uSpacing: { value: SPACING_CSS },
    uReveal: { value: 0 },
    uShadowColor: { value: new Vector3() },
    uShadowAlpha: { value: 0 },
    uShadowOffset: { value: new Vector2() },
    uShadowBlur: { value: 40 },
    uFadeTop: { value: 1 },
    uFadeBottom: { value: 1 },
    uQuad: { value: [new Vector2(), new Vector2(), new Vector2(), new Vector2()] },
    uQuadRadius: { value: 0 },
    uGrain: { value: still?.grain ?? 1 },
  };
  const flow = new Mesh(
    new PlaneGeometry(2, 2),
    new ShaderMaterial({
      vertexShader: flowVertex,
      fragmentShader: flowFragment,
      uniforms: flowUniforms,
      depthTest: false,
      depthWrite: false,
    }),
  );
  flow.frustumCulled = false;
  flow.renderOrder = -1;
  scene.add(flow);

  await fontsReady();
  const maxAniso = renderer.capabilities.getMaxAnisotropy();
  const anchorRect = o.anchor();
  const texWidth = (anchorRect?.width ?? 400) * Math.min(window.devicePixelRatio || 1, 3) > 760 ? 2048 : 1536;
  const front = maskTexture(drawFront(o.face, texWidth), maxAniso);
  const back = maskTexture(drawBack(o.face, texWidth), maxAniso);

  const cardUniforms = {
    uFront: { value: front },
    uBack: { value: back },
    uSize: { value: new Vector2(CARD_W, CARD_H) },
    uTexel: { value: new Vector2(1 / texWidth, CARD_RATIO / texWidth) },
    uTime: { value: 0 },
    uSweep: { value: 0 },
    uAmbient: { value: theme.ambient },
    uFoilBoost: { value: theme.foilBoost },
    uBase: { value: theme.base },
    uRim: { value: theme.rim },
  };
  const geometry = new ExtrudeGeometry(cardShape(CARD_W, CARD_H, 0.318), {
    depth: 0.05,
    bevelEnabled: true,
    bevelThickness: 0.03,
    bevelSize: 0.03,
    bevelOffset: -0.03,
    bevelSegments: 4,
    curveSegments: 20,
  });
  geometry.center();
  const card = new Mesh(
    geometry,
    new ShaderMaterial({ vertexShader: cardVertex, fragmentShader: cardFragment, uniforms: cardUniforms }),
  );
  const pivot = new Group();
  pivot.add(card);
  scene.add(pivot);
  card.visible = !still?.hideCard;

  function applyTheme() {
    flowUniforms.uBg.value.set(...theme.bg);
    flowUniforms.uLine.value.set(...theme.line);
    flowUniforms.uPulse.value.set(...theme.pulse);
    flowUniforms.uGlow.value.set(...theme.glow);
    flowUniforms.uShadowColor.value.set(...theme.shadow);
    flowUniforms.uLineAlpha.value = theme.lineAlpha;
    flowUniforms.uPulseAlpha.value = theme.pulseAlpha;
    flowUniforms.uGlowAlpha.value = still?.hideCard ? 0 : theme.glowAlpha;
    flowUniforms.uShadowAlpha.value = still?.hideCard ? 0 : theme.shadowAlpha;
    cardUniforms.uAmbient.value = theme.ambient;
    cardUniforms.uFoilBoost.value = theme.foilBoost;
    cardUniforms.uBase.value = theme.base;
    cardUniforms.uRim.value = theme.rim;
    renderer.setClearColor(`rgb(${theme.bg.map((c) => Math.round(c * 255)).join(',')})`, 1);
  }
  applyTheme();

  // ---- Layout: the 3D card rests exactly where the flat card sits. ----
  let maxDpr = 2;
  let size = { w: 1, h: 1, dpr: 1, left: 0, top: 0 };
  function layout() {
    const rect = o.stage.getBoundingClientRect();
    const w = Math.max(1, rect.width);
    const h = Math.max(1, rect.height);
    const dpr = Math.min(window.devicePixelRatio || 1, maxDpr);
    renderer.setPixelRatio(dpr);
    renderer.setSize(w, h, false);
    const a = o.anchor();
    const cardPx = a && a.width > 0 ? a.width / CARD_RATIO : Math.min(w * 0.86, 520) / CARD_RATIO;
    const cx = a && a.width > 0 ? a.left + a.width / 2 - rect.left : w / 2;
    const cy = a && a.width > 0 ? a.top + a.height / 2 - rect.top : h / 2;
    const fullW = 2 * Math.max(cx, w - cx);
    const fullH = 2 * Math.max(cy, h - cy);
    camera.aspect = fullW / fullH;
    const tan = Math.tan((camera.fov * Math.PI) / 360);
    const distance = (CARD_H * fullH) / (2 * tan * cardPx);
    camera.position.set(0, 0, distance);
    camera.lookAt(0, 0, 0);
    camera.setViewOffset(fullW, fullH, fullW / 2 - cx, fullH / 2 - cy, w, h);
    camera.updateProjectionMatrix();
    size = { w, h, dpr, left: rect.left, top: rect.top };
    flowUniforms.uRes.value.set(w * dpr, h * dpr);
    flowUniforms.uDpr.value = dpr;
    flowUniforms.uSpacing.value = SPACING_CSS * dpr;
    flowUniforms.uShadowBlur.value = 38 * dpr;
    flowUniforms.uFadeTop.value = Math.min(90, h * 0.2) * dpr;
    flowUniforms.uFadeBottom.value = Math.min(110, h * 0.26) * dpr;
  }

  // ---- Card silhouette for the flow field ----
  const corners = [
    new Vector3(-CARD_W / 2, -CARD_H / 2, 0),
    new Vector3(CARD_W / 2, -CARD_H / 2, 0),
    new Vector3(CARD_W / 2, CARD_H / 2, 0),
    new Vector3(-CARD_W / 2, CARD_H / 2, 0),
  ];
  const tmp = new Vector3();
  const pts: Vector2[] = corners.map(() => new Vector2());
  function silhouette() {
    pivot.updateMatrixWorld(true);
    const bw = size.w * size.dpr;
    const bh = size.h * size.dpr;
    corners.forEach((c, i) => {
      tmp.copy(c).applyMatrix4(card.matrixWorld).project(camera);
      pts[i]!.set(((tmp.x + 1) / 2) * bw, ((tmp.y + 1) / 2) * bh);
    });
    const [p0, p1, p2, p3] = pts as [Vector2, Vector2, Vector2, Vector2];
    // Inset the corners by the card's corner radius; the shader adds it back
    // as a rounded offset, so shadow and glow follow the rounded outline.
    const radius = Math.max(1, 0.0372 * ((p0.distanceTo(p1) + p3.distanceTo(p2)) / 2));
    flowUniforms.uQuadRadius.value = radius;
    flowUniforms.uQuad.value.forEach((q, i) => {
      const c = pts[i]!;
      const next = pts[(i + 1) % 4]!;
      const prev = pts[(i + 3) % 4]!;
      const a = next.distanceTo(c) || 1;
      const b = prev.distanceTo(c) || 1;
      const inset = Math.min(radius, a / 2, b / 2);
      q.set(
        c.x + ((next.x - c.x) / a) * inset + ((prev.x - c.x) / b) * inset,
        c.y + ((next.y - c.y) / a) * inset + ((prev.y - c.y) / b) * inset,
      );
    });
    const cxp = (p0.x + p1.x + p2.x + p3.x) / 4;
    const cyp = (p0.y + p1.y + p2.y + p3.y) / 4;
    const ux = (p1.x - p0.x + p2.x - p3.x) / 2;
    const uy = (p1.y - p0.y + p2.y - p3.y) / 2;
    const angle = Math.atan2(uy, ux);
    const e1x = Math.cos(angle);
    const e1y = Math.sin(angle);
    let hw = 0;
    let hh = 0;
    for (const p of pts) {
      const dx = p.x - cxp;
      const dy = p.y - cyp;
      hw = Math.max(hw, Math.abs(dx * e1x + dy * e1y));
      hh = Math.max(hh, Math.abs(-dx * e1y + dy * e1x));
    }
    flowUniforms.uCenter.value.set(cxp, cyp);
    flowUniforms.uHalf.value.set(Math.max(hw, 2 * size.dpr), Math.max(hh, 2 * size.dpr));
    flowUniforms.uAngle.value = angle;
    flowUniforms.uShadowOffset.value.set(10 * size.dpr, -20 * size.dpr);
  }

  // ---- Motion state ----
  let rotX = still?.rotX ?? 0;
  let rotY = still?.rotY ?? 0;
  let velX = 0;
  let velY = 0;
  let baseY = 0;
  let hoverX = 0;
  let hoverY = 0;
  let tiltX = 0;
  let tiltY = 0;
  let pointerStrength = 0;
  let pointerTarget = 0;
  const pointer = new Vector2(-9999, -9999);
  let elapsed = still?.time ?? 0;
  let introStart = -1;

  const drag = { active: false, mouse: false, id: -1, x0: 0, y0: 0, rx0: 0, ry0: 0, lastT: 0, moved: false, t0: 0 };

  const toBuffer = (clientX: number, clientY: number) => {
    const rect = o.stage.getBoundingClientRect();
    pointer.set((clientX - rect.left) * size.dpr, (rect.height - (clientY - rect.top)) * size.dpr);
  };

  function settle() {
    const projected = rotY + velY * 0.16;
    const nextBase = Math.round(projected / Math.PI) * Math.PI;
    if (Math.round(nextBase / Math.PI) % 2 !== Math.round(baseY / Math.PI) % 2) {
      o.onFlip?.(Math.abs(Math.round(nextBase / Math.PI)) % 2 === 1);
    }
    baseY = nextBase;
  }

  function flip(direction = 1) {
    const before = Math.abs(Math.round(baseY / Math.PI)) % 2;
    baseY += Math.PI * direction;
    velY += 2.2 * direction;
    o.onFlip?.(before === 0);
  }

  const onDown = (e: PointerEvent) => {
    if (e.button !== 0 || still) return;
    drag.active = true;
    drag.mouse = e.pointerType === 'mouse';
    drag.id = e.pointerId;
    drag.x0 = e.clientX;
    drag.y0 = e.clientY;
    drag.rx0 = rotX;
    drag.ry0 = rotY;
    drag.lastT = performance.now();
    drag.t0 = drag.lastT;
    drag.moved = false;
    velY = 0;
    pointerTarget = 1;
    toBuffer(e.clientX, e.clientY);
    o.onInteract?.();
  };
  const onMove = (e: PointerEvent) => {
    if (drag.active && e.pointerId === drag.id) {
      const now = performance.now();
      const dx = e.clientX - drag.x0;
      const dy = e.clientY - drag.y0;
      if (!drag.moved && Math.hypot(dx, dy) > 7) drag.moved = true;
      if (drag.moved) {
        const next = drag.ry0 + dx * 0.0095;
        const dt = Math.max((now - drag.lastT) / 1000, 1 / 240);
        velY = velY * 0.4 + ((next - rotY) / dt) * 0.6;
        rotY = next;
        if (e.pointerType === 'mouse') rotX = clamp(drag.rx0 + dy * 0.006, -0.7, 0.7);
      }
      drag.lastT = now;
      toBuffer(e.clientX, e.clientY);
      return;
    }
    if (e.pointerType === 'mouse' && motion) {
      const rect = o.stage.getBoundingClientRect();
      const nx = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      const ny = ((e.clientY - rect.top) / rect.height) * 2 - 1;
      hoverY = clamp(nx, -1, 1) * 0.26;
      hoverX = clamp(ny, -1, 1) * 0.2;
      toBuffer(e.clientX, e.clientY);
      pointerTarget = 0.55;
    }
  };
  const onUp = (e: PointerEvent) => {
    if (!drag.active || e.pointerId !== drag.id) return;
    drag.active = false;
    pointerTarget = 0;
    const quick = performance.now() - drag.t0 < 380;
    if (!drag.moved && quick && e.type === 'pointerup') {
      const rect = o.stage.getBoundingClientRect();
      flip(e.clientX - rect.left < rect.width / 2 ? -1 : 1);
    } else {
      settle();
    }
  };
  const onLeave = (e: PointerEvent) => {
    if (e.pointerType === 'mouse' && !drag.active) {
      hoverX = 0;
      hoverY = 0;
      pointerTarget = 0;
    }
  };
  if (!still) {
    o.stage.addEventListener('pointerdown', onDown);
    window.addEventListener('pointermove', onMove, { passive: true });
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
    o.stage.addEventListener('pointerleave', onLeave);
  }

  // ---- Device tilt ----
  type OrientationCtor = typeof DeviceOrientationEvent & { requestPermission?: () => Promise<'granted' | 'denied'> };
  const Orientation = (typeof DeviceOrientationEvent !== 'undefined' ? DeviceOrientationEvent : undefined) as
    | OrientationCtor
    | undefined;
  const tiltNeedsPermission = typeof Orientation?.requestPermission === 'function';
  let tiltBase: { b: number; g: number } | null = null;
  let tiltOn = false;
  let tiltSeen = false;
  const onOrientation = (e: DeviceOrientationEvent) => {
    if (e.beta == null || e.gamma == null || !motion) return;
    tiltSeen = true;
    let b = e.beta;
    let g = e.gamma;
    const angle = screen.orientation?.angle ?? 0;
    if (angle === 90) [b, g] = [-g, b];
    else if (angle === 270 || angle === -90) [b, g] = [g, -b];
    else if (angle === 180) [b, g] = [-b, -g];
    if (!tiltBase) tiltBase = { b, g };
    tiltBase.b += (b - tiltBase.b) * 0.01;
    tiltBase.g += (g - tiltBase.g) * 0.01;
    tiltX = clamp((b - tiltBase.b) * 0.017, -0.42, 0.42);
    tiltY = clamp((g - tiltBase.g) * 0.021, -0.5, 0.5);
  };
  function listenTilt() {
    if (tiltOn) return;
    tiltOn = true;
    window.addEventListener('deviceorientation', onOrientation);
  }
  // Listen straight away: Android reports without asking, iOS stays silent
  // until enableTilt() gets permission from a tap.
  if (!still && Orientation && motion) listenTilt();

  async function enableTilt(): Promise<boolean> {
    if (!Orientation) return false;
    try {
      if (tiltNeedsPermission) {
        const result = await Orientation.requestPermission!();
        if (result !== 'granted') return false;
      }
      listenTilt();
      return true;
    } catch {
      return false;
    }
  }

  // ---- Frame ----
  let raf = 0;
  let running = false;
  let last = performance.now();
  let slow = 0;
  let frames = 0;

  function update(dt: number) {
    const t = elapsed;
    flowUniforms.uTime.value = t;
    cardUniforms.uTime.value = t;
    const cycle = 7.5;
    const phase = ((t - 0.4) % cycle) / 1.7;
    cardUniforms.uSweep.value = still?.sweep ?? (motion && t > 0.4 && phase < 1 ? phase : 0);

    if (still) {
      flowUniforms.uPresence.value = still.presence ?? 1;
      flowUniforms.uReveal.value = 1;
      return;
    }

    if (introStart < 0) introStart = t;
    const since = t - introStart;
    flowUniforms.uPresence.value = motion ? easeOut((since - 0.25) / 1.5) : 1;
    flowUniforms.uReveal.value = motion ? easeOut(since / 0.9) : 1;

    const idleX = motion ? Math.sin(t * 0.55) * 0.065 + Math.sin(t * 0.21 + 2.0) * 0.03 : 0;
    const idleY = motion ? Math.sin(t * 0.41 + 1.2) * 0.11 + Math.sin(t * 0.17) * 0.05 : 0;
    const targetX = idleX + hoverX + tiltX;
    const targetY = baseY + idleY + hoverY + tiltY;
    const k = 38;
    const d = 9.5;
    if (!(drag.active && drag.mouse && drag.moved)) {
      velX += ((targetX - rotX) * k - velX * d) * dt;
      rotX += velX * dt;
    }
    if (!(drag.active && drag.moved)) {
      velY += ((targetY - rotY) * k - velY * d) * dt;
      rotY += velY * dt;
    }
    pivot.position.y = motion ? Math.sin(t * 0.7) * 0.05 : 0;
    pointerStrength += (pointerTarget - pointerStrength) * Math.min(1, dt * (pointerTarget > pointerStrength ? 10 : 2.6));
    flowUniforms.uPointer.value.set(pointer.x, pointer.y, pointerStrength);
  }
  function render() {
    card.rotation.set(rotX, rotY, 0);
    silhouette();
    renderer.render(scene, camera);
  }

  function frame(now: number) {
    raf = requestAnimationFrame(frame);
    const dt = Math.min((now - last) / 1000, 1 / 20);
    last = now;
    elapsed += dt;
    update(dt);
    render();
    // Drop resolution once if the device struggles.
    if (frames < 240) {
      frames++;
      if (dt > 1 / 40) slow++;
      if (frames === 240 && slow > 80 && maxDpr > 1.25) {
        maxDpr = 1.25;
        layout();
      }
    }
  }

  function start() {
    if (running || still) return;
    running = true;
    last = performance.now();
    raf = requestAnimationFrame(frame);
  }
  function stop() {
    running = false;
    cancelAnimationFrame(raf);
  }

  const resize = new ResizeObserver(() => {
    layout();
    if (!running) render();
  });
  resize.observe(o.stage);
  layout();

  const visible = { page: !document.hidden, stage: true };
  const sync = () => (visible.page && visible.stage ? start() : stop());
  const io = new IntersectionObserver(([entry]) => {
    visible.stage = Boolean(entry?.isIntersecting);
    sync();
  });
  if (!still) io.observe(o.stage);
  const onVisibility = () => {
    visible.page = !document.hidden;
    sync();
  };
  document.addEventListener('visibilitychange', onVisibility);

  o.canvas.addEventListener('webglcontextlost', (e) => {
    e.preventDefault();
    stop();
    o.stage.classList.remove('is-live');
  });

  renderer.compile(scene, camera);
  update(0);
  render();
  o.onReady?.();
  if (!still) sync();

  return {
    tiltNeedsPermission,
    tiltActive: () => tiltSeen,
    setDark(dark) {
      theme = dark ? DARK : LIGHT;
      applyTheme();
      if (!running) render();
    },
    setReducedMotion(reduce) {
      motion = reduce ? 0 : 1;
      flowUniforms.uMotion.value = motion;
      if (!running) render();
    },
    enableTilt,
    flip: () => flip(1),
    dispose() {
      stop();
      resize.disconnect();
      io.disconnect();
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('deviceorientation', onOrientation);
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
      geometry.dispose();
      front.dispose();
      back.dispose();
      renderer.dispose();
    },
  };
}

