import {
  CanvasTexture,
  ExtrudeGeometry,
  Group,
  LinearFilter,
  LinearMipmapLinearFilter,
  Matrix3,
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
import { backdropFragment, backdropVertex, cardFragment, cardVertex } from './glsl.ts';
import { CARD_RATIO, drawBack, drawFront, fontsReady, type FaceData } from './textures.ts';

type Rgb = readonly [number, number, number];
const hex = (h: string): Rgb => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255) as unknown as Rgb;

interface Theme {
  bg: Rgb;
  glow: Rgb;
  shadow: Rgb;
  glowAlpha: number;
  shadowAlpha: number;
  fill: number;
  foilBoost: number;
  base: number;
  rim: number;
  coat: number;
}

const LIGHT: Theme = {
  bg: hex('#fafaf8'),
  glow: hex('#ffffff'),
  shadow: hex('#1c1b18'),
  glowAlpha: 0,
  shadowAlpha: 0.26,
  fill: 1.15,
  foilBoost: 1,
  base: 0.046,
  rim: 0.05,
  coat: 1,
};

const DARK: Theme = {
  bg: hex('#0c0c0b'),
  glow: hex('#f2f1ec'),
  shadow: hex('#000000'),
  glowAlpha: 0.09,
  shadowAlpha: 0.6,
  fill: 0.9,
  foilBoost: 1.1,
  base: 0.082,
  rim: 0.16,
  coat: 1.1,
};

/** A fixed pose for share images rendered by scripts/media.mjs. */
export interface Still {
  rotX?: number;
  rotY?: number;
  /** How the phone is held, in degrees, as DeviceOrientation beta/gamma. */
  beta?: number;
  gamma?: number;
  /** Where the viewer's eye is, as a hold; defaults to the hold itself. */
  eyeBeta?: number;
  eyeGamma?: number;
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
  /** Permission alone is not enough: called once a sensor delivers data. */
  onTiltActive?: () => void;
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
/** A usual way to hold a phone: screen tipped back about 30° from upright. */
const REST = { beta: 58, gamma: 0 };

const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));
const easeOut = (x: number) => 1 - Math.pow(1 - clamp(x, 0, 1), 3);
const RAD = Math.PI / 180;

/** Screen space → room, for a phone held at beta/gamma (DeviceOrientation, alpha = 0). */
function holdMatrix(m: Matrix3, beta: number, gamma: number): Matrix3 {
  const cb = Math.cos(beta * RAD);
  const sb = Math.sin(beta * RAD);
  const cg = Math.cos(gamma * RAD);
  const sg = Math.sin(gamma * RAD);
  return m.set(cg, 0, sg, sb * sg, cb, -sb * cg, -cb * sg, sb, cb * cg);
}

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

  const backdropUniforms = {
    uRes: { value: new Vector2(1, 1) },
    uDpr: { value: 1 },
    uBg: { value: new Vector3() },
    uGlow: { value: new Vector3() },
    uGlowAlpha: { value: 0 },
    uShadowColor: { value: new Vector3() },
    uShadowAlpha: { value: 0 },
    uShadowOffset: { value: new Vector2() },
    uShadowBlur: { value: 40 },
    uFadeTop: { value: 1 },
    uFadeBottom: { value: 1 },
    uPresence: { value: 0 },
    uGrain: { value: still?.grain ?? 1 },
    uQuad: { value: [new Vector2(), new Vector2(), new Vector2(), new Vector2()] },
    uQuadRadius: { value: 0 },
  };
  const backdrop = new Mesh(
    new PlaneGeometry(2, 2),
    new ShaderMaterial({
      vertexShader: backdropVertex,
      fragmentShader: backdropFragment,
      uniforms: backdropUniforms,
      depthTest: false,
      depthWrite: false,
    }),
  );
  backdrop.frustumCulled = false;
  backdrop.renderOrder = -1;
  scene.add(backdrop);

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
    uHold: { value: new Matrix3() },
    uEye: { value: new Matrix3() },
    uEyeDir: { value: new Vector3(0, 0, 1) },
    uFoilBoost: { value: theme.foilBoost },
    uBase: { value: theme.base },
    uRim: { value: theme.rim },
    uCoat: { value: theme.coat },
    uFill: { value: theme.fill },
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
    backdropUniforms.uBg.value.set(...theme.bg);
    backdropUniforms.uGlow.value.set(...theme.glow);
    backdropUniforms.uShadowColor.value.set(...theme.shadow);
    backdropUniforms.uGlowAlpha.value = still?.hideCard ? 0 : theme.glowAlpha;
    backdropUniforms.uShadowAlpha.value = still?.hideCard ? 0 : theme.shadowAlpha;
    cardUniforms.uCoat.value = theme.coat;
    cardUniforms.uFill.value = theme.fill;
    cardUniforms.uFoilBoost.value = theme.foilBoost;
    cardUniforms.uBase.value = theme.base;
    cardUniforms.uRim.value = theme.rim;
    renderer.setClearColor(`rgb(${theme.bg.map((c) => Math.round(c * 255)).join(',')})`, 1);
  }
  applyTheme();

  // ---- Layout: the 3D card rests exactly where the flat card sits. ----
  let maxDpr = 2;
  let size = { w: 1, h: 1, dpr: 1 };
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
    size = { w, h, dpr };
    backdropUniforms.uRes.value.set(w * dpr, h * dpr);
    backdropUniforms.uDpr.value = dpr;
    backdropUniforms.uFadeTop.value = Math.min(90, h * 0.2) * dpr;
    backdropUniforms.uFadeBottom.value = Math.min(110, h * 0.26) * dpr;
  }

  // ---- Card pose: still on screen, like a card in the hand, except flips ----
  let rotY = still?.rotY ?? 0;
  let velY = 0;
  let baseY = 0;
  const rotX = still?.rotX ?? 0;

  // ---- How the phone is held: this is what moves the reflections ----
  const hold = { beta: still?.beta ?? REST.beta, gamma: still?.gamma ?? REST.gamma };
  const holdTarget = { ...hold };
  const eye = { beta: still?.eyeBeta ?? hold.beta, gamma: still?.eyeGamma ?? hold.gamma };
  const hover = { beta: 0, gamma: 0 };
  const holdM = new Matrix3();
  const eyeM = new Matrix3();
  const toScreen = new Matrix3();
  const up = new Vector3();

  // ---- Projected card outline for the shadow ----
  const corners = [
    new Vector3(-CARD_W / 2, -CARD_H / 2, 0),
    new Vector3(CARD_W / 2, -CARD_H / 2, 0),
    new Vector3(CARD_W / 2, CARD_H / 2, 0),
    new Vector3(-CARD_W / 2, CARD_H / 2, 0),
  ];
  const tmp = new Vector3();
  const pts: Vector2[] = corners.map(() => new Vector2());
  function silhouette(lift: number) {
    pivot.updateMatrixWorld(true);
    const bw = size.w * size.dpr;
    const bh = size.h * size.dpr;
    corners.forEach((c, i) => {
      tmp.copy(c).applyMatrix4(card.matrixWorld).project(camera);
      pts[i]!.set(((tmp.x + 1) / 2) * bw, ((tmp.y + 1) / 2) * bh);
    });
    const [p0, p1, p2, p3] = pts as [Vector2, Vector2, Vector2, Vector2];
    // Inset the corners by the card's corner radius; the shader adds it back
    // as a rounded offset, so the shadow follows the rounded outline.
    const radius = Math.max(1, 0.0372 * ((p0.distanceTo(p1) + p3.distanceTo(p2)) / 2));
    backdropUniforms.uQuadRadius.value = radius;
    backdropUniforms.uQuad.value.forEach((q, i) => {
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
    // The room is lit from the ceiling. Seen from the phone, "up" moves as
    // the phone tilts, and the shadow falls the other way; a card lifted
    // mid-flip casts a longer, softer shadow.
    up.set(0, 0, 1).applyMatrix3(toScreen.copy(holdM).transpose());
    const reach = 20 * (1 + lift * 0.9) * size.dpr;
    backdropUniforms.uShadowOffset.value.set(-up.x * reach + 4 * size.dpr, -up.y * reach);
    backdropUniforms.uShadowBlur.value = 38 * (1 + lift * 0.8) * size.dpr;
  }

  // ---- Touch: tap or swipe to flip, or turn the card by hand ----
  const drag = { active: false, id: -1, x0: 0, y0: 0, ry0: 0, lastT: 0, t0: 0, moved: false, horizontal: false };

  function setBase(next: number) {
    const before = Math.abs(Math.round(baseY / Math.PI)) % 2;
    const after = Math.abs(Math.round(next / Math.PI)) % 2;
    baseY = next;
    if (before !== after) o.onFlip?.(after === 1);
  }

  function flip(direction = 1) {
    setBase(baseY + Math.PI * direction);
    velY += 2.4 * direction;
  }

  const onDown = (e: PointerEvent) => {
    if (e.button !== 0 || still) return;
    drag.active = true;
    drag.id = e.pointerId;
    drag.x0 = e.clientX;
    drag.y0 = e.clientY;
    drag.ry0 = rotY;
    drag.t0 = drag.lastT = performance.now();
    drag.moved = false;
    drag.horizontal = false;
    o.onInteract?.();
  };
  const onMove = (e: PointerEvent) => {
    if (drag.active && e.pointerId === drag.id) {
      const dx = e.clientX - drag.x0;
      const dy = e.clientY - drag.y0;
      if (!drag.moved && Math.hypot(dx, dy) > 8) {
        drag.moved = true;
        drag.horizontal = Math.abs(dx) > Math.abs(dy);
      }
      if (drag.moved && drag.horizontal) {
        const now = performance.now();
        const next = drag.ry0 + dx * 0.0105;
        const dt = Math.max((now - drag.lastT) / 1000, 1 / 240);
        velY = velY * 0.4 + ((next - rotY) / dt) * 0.6;
        rotY = next;
        drag.lastT = now;
      }
      return;
    }
    if (e.pointerType === 'mouse' && !tiltSeen) {
      // Without a gyroscope, the cursor tips the card under the room lights.
      const rect = o.stage.getBoundingClientRect();
      const inside = e.clientY >= rect.top && e.clientY <= rect.bottom;
      hover.gamma = inside ? clamp(((e.clientX - rect.left) / rect.width) * 2 - 1, -1, 1) * 14 : 0;
      hover.beta = inside ? clamp(((e.clientY - rect.top) / rect.height) * 2 - 1, -1, 1) * -11 : 0;
    }
  };
  const onUp = (e: PointerEvent) => {
    if (!drag.active || e.pointerId !== drag.id) return;
    drag.active = false;
    const quick = performance.now() - drag.t0 < 400;
    if (!drag.moved && quick && e.type === 'pointerup') {
      const rect = o.stage.getBoundingClientRect();
      flip(e.clientX - rect.left < rect.width / 2 ? -1 : 1);
      return;
    }
    if (drag.moved && drag.horizontal) {
      // Finish what the hand started: a flick or a third of a turn flips it.
      const turned = rotY + velY * 0.16 - baseY;
      if (Math.abs(turned) > Math.PI * 0.32) {
        const turns = Math.max(1, Math.round(Math.abs(turned) / Math.PI));
        setBase(baseY + Math.PI * Math.sign(turned) * turns);
      }
    }
  };
  const onLeave = (e: PointerEvent) => {
    if (e.pointerType === 'mouse') {
      hover.beta = 0;
      hover.gamma = 0;
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
  type MotionCtor = typeof DeviceMotionEvent & { requestPermission?: () => Promise<'granted' | 'denied'> };
  const Orientation = (typeof DeviceOrientationEvent !== 'undefined' ? DeviceOrientationEvent : undefined) as
    | OrientationCtor
    | undefined;
  const Motion = (typeof DeviceMotionEvent !== 'undefined' ? DeviceMotionEvent : undefined) as MotionCtor | undefined;
  const tiltNeedsPermission =
    typeof Orientation?.requestPermission === 'function' || typeof Motion?.requestPermission === 'function';
  let tiltOn = false;
  let tiltSeen = false;
  let lastOrientation = -Infinity;

  const applyTilt = (beta: number, gamma: number) => {
    if (!Number.isFinite(beta) || !Number.isFinite(gamma)) return;
    let b = beta;
    let g = gamma;
    // Older iPhone Safari exposes window.orientation rather than ScreenOrientation.
    const angle = screen.orientation?.angle ?? (window as Window & { orientation?: number }).orientation ?? 0;
    if (angle === 90) [b, g] = [-g, b];
    else if (angle === 270 || angle === -90) [b, g] = [g, -b];
    else if (angle === 180) [b, g] = [-b, -g];
    holdTarget.beta = clamp(b, -10, 120);
    holdTarget.gamma = clamp(g, -75, 75);
    if (!tiltSeen) {
      tiltSeen = true;
      hold.beta = eye.beta = holdTarget.beta;
      hold.gamma = eye.gamma = holdTarget.gamma;
      hover.beta = hover.gamma = 0;
      o.onTiltActive?.();
    }
  };
  const onOrientation = (e: DeviceOrientationEvent) => {
    if (e.beta == null || e.gamma == null) return;
    lastOrientation = performance.now();
    applyTilt(e.beta, e.gamma);
  };
  const onMotion = (e: DeviceMotionEvent) => {
    // Some iOS contexts grant access but never report orientation; gravity
    // still gives pitch and roll.
    if (performance.now() - lastOrientation < 600) return;
    const a = e.accelerationIncludingGravity;
    if (a?.x == null || a.y == null || a.z == null || Math.hypot(a.x, a.y, a.z) < 1) return;
    applyTilt(Math.atan2(-a.y, -a.z) / RAD, Math.atan2(a.x, Math.hypot(a.y, a.z)) / RAD);
  };
  function listenTilt() {
    if (tiltOn) return;
    tiltOn = true;
    window.addEventListener('deviceorientation', onOrientation);
    window.addEventListener('devicemotion', onMotion);
  }
  // Listen straight away: Android reports without asking, iOS stays silent
  // until enableTilt() gets permission from a tap.
  if (!still && (Orientation || Motion)) listenTilt();

  async function enableTilt(): Promise<boolean> {
    if (!Orientation && !Motion) return false;
    try {
      // Ask for both before awaiting either: iOS needs the tap's user
      // activation for each request.
      const requests = [Orientation, Motion]
        .filter((ctor) => typeof ctor?.requestPermission === 'function')
        .map((ctor) => ctor!.requestPermission!());
      const results = await Promise.allSettled(requests);
      if (results.length && !results.some((r) => r.status === 'fulfilled' && r.value === 'granted')) return false;
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
  let elapsed = 0;
  let introStart = -1;
  let slow = 0;
  let frames = 0;

  function update(dt: number) {
    const t = elapsed;
    if (still) {
      backdropUniforms.uPresence.value = still.presence ?? 1;
      return;
    }
    if (introStart < 0) introStart = t;
    backdropUniforms.uPresence.value = motion ? easeOut((t - introStart) / 0.9) : 1;

    if (!tiltSeen) {
      // No sensor: the rest pose, the cursor and a hand's slow sway.
      const sway = motion;
      holdTarget.beta = REST.beta + hover.beta + sway * (Math.sin(t * 0.47) * 1.6 + Math.sin(t * 0.19 + 1.1) * 0.9);
      holdTarget.gamma = REST.gamma + hover.gamma + sway * (Math.sin(t * 0.33 + 0.6) * 2.2 + Math.sin(t * 0.13) * 1.1);
    }
    // Smooth the sensor; the eye follows the hand only slowly, so a quick
    // tilt moves the reflections twice as far, as on a real card.
    const k = 1 - Math.exp(-dt * 14);
    hold.beta += (holdTarget.beta - hold.beta) * k;
    hold.gamma += (holdTarget.gamma - hold.gamma) * k;
    const settle = tiltSeen ? 1 - Math.exp(-dt / 5) : 0;
    eye.beta += (hold.beta - eye.beta) * settle;
    eye.gamma += (hold.gamma - eye.gamma) * settle;

    // Flip spring; while a finger turns the card, the finger leads.
    if (!(drag.active && drag.moved && drag.horizontal)) {
      velY += ((baseY - rotY) * 42 - velY * 10.5) * dt;
      rotY += velY * dt;
    }
  }

  function render() {
    const lift = Math.sin(clamp(Math.abs(rotY - baseY), 0, Math.PI));
    pivot.position.z = lift * 0.9;
    card.rotation.set(rotX, rotY, 0);
    holdMatrix(holdM, hold.beta, hold.gamma);
    holdMatrix(eyeM, eye.beta, eye.gamma);
    cardUniforms.uHold.value.copy(holdM);
    cardUniforms.uEye.value.copy(eyeM);
    cardUniforms.uEyeDir.value.set(0, 0, 1).applyMatrix3(eyeM).normalize();
    silhouette(lift);
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
      window.removeEventListener('devicemotion', onMotion);
      o.stage.removeEventListener('pointerdown', onDown);
      o.stage.removeEventListener('pointerleave', onLeave);
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
