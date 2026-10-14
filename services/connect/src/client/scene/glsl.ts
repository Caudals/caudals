// GLSL for the two draws of the stage: the backdrop (page colour, the card's
// soft shadow and, in dark mode, a faint halo) and the card itself. Colours
// arrive as raw sRGB triples and are mixed in display space, so no
// colour-space conversion is applied in either shader.

const common = /* glsl */ `
mat2 rot(float a) { float c = cos(a), s = sin(a); return mat2(c, s, -s, c); }

float hash12(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

float vnoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash12(i), hash12(i + vec2(1.0, 0.0)), u.x),
             mix(hash12(i + vec2(0.0, 1.0)), hash12(i + vec2(1.0, 1.0)), u.x), u.y);
}

// Signed distance to a convex quad (the projected card), negative inside.
float sdSeg(vec2 p, vec2 a, vec2 b) {
  vec2 pa = p - a;
  vec2 ba = b - a;
  return length(pa - ba * clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0));
}

float sdQuad(vec2 p, vec2 a, vec2 b, vec2 c, vec2 d) {
  float dist = min(min(sdSeg(p, a, b), sdSeg(p, b, c)), min(sdSeg(p, c, d), sdSeg(p, d, a)));
  float s1 = sign((b.x - a.x) * (p.y - a.y) - (b.y - a.y) * (p.x - a.x));
  float s2 = sign((c.x - b.x) * (p.y - b.y) - (c.y - b.y) * (p.x - b.x));
  float s3 = sign((d.x - c.x) * (p.y - c.y) - (d.y - c.y) * (p.x - c.x));
  float s4 = sign((a.x - d.x) * (p.y - d.y) - (a.y - d.y) * (p.x - d.x));
  bool inside = (s1 >= 0.0 && s2 >= 0.0 && s3 >= 0.0 && s4 >= 0.0) || (s1 <= 0.0 && s2 <= 0.0 && s3 <= 0.0 && s4 <= 0.0);
  return inside ? -dist : dist;
}

`;

export const backdropVertex = /* glsl */ `
void main() {
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
`;

// The page colour with the card's shadow: a wide soft one and a tight contact
// one, both following the projected card as it turns.
export const backdropFragment = /* glsl */ `
uniform vec2 uRes;
uniform float uDpr;
uniform vec3 uBg;
uniform vec3 uGlow;
uniform float uGlowAlpha;
uniform vec3 uShadowColor;
uniform float uShadowAlpha;
uniform vec2 uShadowOffset;
uniform float uShadowBlur;
uniform float uFadeTop;
uniform float uFadeBottom;
uniform float uPresence;
uniform float uGrain;
uniform vec2 uQuad[4];
uniform float uQuadRadius;
${common}

float card(vec2 p) {
  return sdQuad(p, uQuad[0], uQuad[1], uQuad[2], uQuad[3]) - uQuadRadius;
}

void main() {
  vec2 frag = gl_FragCoord.xy;
  float fade = smoothstep(0.0, uFadeTop, uRes.y - frag.y) * smoothstep(0.0, uFadeBottom, frag.y);
  float k = uPresence * fade;
  vec3 col = uBg;

  float wide = 1.0 - smoothstep(-uShadowBlur * 0.3, uShadowBlur, card(frag - uShadowOffset) + 3.0 * uDpr);
  float contact = 1.0 - smoothstep(-uShadowBlur * 0.08, uShadowBlur * 0.32, card(frag - uShadowOffset * 0.3));
  col = mix(col, uShadowColor, (wide * 0.75 + contact * 0.45) * uShadowAlpha * k);

  float d = card(frag);
  float glow = exp(-max(d, 0.0) / (56.0 * uDpr)) * smoothstep(-4.0 * uDpr, 0.0, d);
  col = mix(col, uGlow, glow * uGlowAlpha * k);

  col += (hash12(frag) - 0.5) * (1.6 / 255.0) * uGrain;
  gl_FragColor = vec4(col, 1.0);
}
`;

export const cardVertex = /* glsl */ `
varying vec3 vLocal;
varying vec3 vLocalN;
varying vec3 vWorldPos;
varying vec3 vWorldN;
varying vec3 vT;
varying vec3 vB;

void main() {
  vLocal = position;
  vLocalN = normal;
  vec4 world = modelMatrix * vec4(position, 1.0);
  vWorldPos = world.xyz;
  vWorldN = normalize(mat3(modelMatrix) * normal);
  vT = normalize(mat3(modelMatrix) * vec3(1.0, 0.0, 0.0));
  vB = normalize(mat3(modelMatrix) * vec3(0.0, 1.0, 0.0));
  gl_Position = projectionMatrix * viewMatrix * world;
}
`;

// The card: satin black stock under a glossy clear coat, white ink, a
// holographic foil mark, a paper back and graphite edges. It reflects a small
// room fixed around the visitor (ceiling strip lights, a window, a lamp, the
// visitor's own silhouette). uHold turns the card from screen space into the
// room as the phone is held now; uEye does the same for the visitor's eye,
// which stays put while the hand tilts, so reflections move twice the tilt,
// as they do on a real glossy card.
export const cardFragment = /* glsl */ `
uniform sampler2D uFront;
uniform sampler2D uBack;
uniform vec2 uSize;
uniform vec2 uTexel;
uniform mat3 uHold;
uniform mat3 uEye;
uniform vec3 uEyeDir;
uniform float uFoilBoost;
uniform float uBase;
uniform float uRim;
uniform float uCoat;
uniform float uFill;
varying vec3 vLocal;
varying vec3 vLocalN;
varying vec3 vWorldPos;
varying vec3 vWorldN;
varying vec3 vT;
varying vec3 vB;
${common}

// A rectangular light seen along R; returns its coverage and the hit point
// on its plane (for window bars).
float panelAt(vec3 R, vec3 dir, vec2 size, float blur, out vec2 pl) {
  vec3 up = abs(dir.z) < 0.99 ? vec3(0.0, 0.0, 1.0) : vec3(0.0, 1.0, 0.0);
  vec3 tx = normalize(cross(up, dir));
  vec3 ty = cross(dir, tx);
  float dz = dot(R, dir);
  pl = vec2(0.0);
  if (dz <= 0.05) return 0.0;
  pl = vec2(dot(R, tx), dot(R, ty)) / dz;
  vec2 d = abs(pl) - size;
  float sd = length(max(d, 0.0)) + min(max(d.x, d.y), 0.0);
  return 1.0 - smoothstep(-blur * 0.5, blur, sd);
}

// Blurring a light spreads its energy over a larger area, so a rough
// surface sees a dimmer, wider light, not a brighter one.
float spread(vec2 size, float blur) {
  return (size.x * size.y) / ((size.x + blur) * (size.y + blur));
}

float panel(vec3 R, vec3 dir, vec2 size, float blur) {
  vec2 pl;
  return panelAt(R, dir, size, blur, pl) * spread(size, blur);
}

// The room, in coordinates fixed to the visitor: x to their right, y away
// from them, z up. Lights are much brighter than the walls, as in life.
vec3 room(vec3 R, float blur) {
  float l = 0.0;
  // Thin tube lights across the ceiling, behind and overhead, and a broad
  // LED panel further back.
  l += 16.0 * panel(R, normalize(vec3(0.0, -0.40, 0.92)), vec2(1.7, 0.006), blur);
  l += 14.0 * panel(R, normalize(vec3(0.0, 0.14, 0.99)), vec2(1.7, 0.006), blur);
  l += 2.4 * panel(R, normalize(vec3(0.0, -0.74, 0.67)), vec2(0.55, 0.2), blur + 0.02);
  // A window to the left and behind, with its bars.
  vec2 w;
  float win = panelAt(R, normalize(vec3(-0.80, -0.47, 0.37)), vec2(0.42, 0.31), blur + 0.03, w);
  float bars = max(1.0 - smoothstep(0.008, 0.016 + blur, abs(w.x)), 1.0 - smoothstep(0.008, 0.016 + blur, abs(w.y + 0.04)));
  l += 2.4 * win * spread(vec2(0.42, 0.31), blur) * (1.0 - 0.85 * bars * (1.0 - smoothstep(0.05, 0.2, blur))) * (0.85 + 0.15 * smoothstep(-0.31, 0.31, w.y));
  // A small warm lamp to the right.
  float lamp = panel(R, normalize(vec3(0.71, -0.57, 0.42)), vec2(0.045, 0.045), blur);
  vec3 c = vec3(l) * vec3(1.0, 0.985, 0.955) + lamp * vec3(4.2, 3.6, 2.7);
  // Walls and floor are dim; the ceiling is brighter.
  c += mix(vec3(0.010), vec3(0.10, 0.10, 0.096), smoothstep(-0.25, 0.95, R.z)) * uFill;
  // The visitor's own head and shoulders hide the room straight behind them.
  float head = 1.0 - smoothstep(0.17, 0.30, acos(clamp(dot(R, uEyeDir), -1.0, 1.0)));
  return c * (1.0 - 0.8 * head);
}

float luma(vec3 c) {
  return dot(c, vec3(0.299, 0.587, 0.114));
}

vec3 knee(vec3 c) {
  vec3 hi = max(c - 0.8, 0.0);
  return min(c, 0.8) + hi / (1.0 + hi * 2.2);
}

vec3 spectrum(float x) {
  return 0.5 + 0.5 * cos(6.28318 * (x + vec3(0.0, 0.33, 0.67)));
}

// Holographic foil: a brushed metal mirror. It shows the room's lights as
// bright lines tinted by diffraction bands that depend on where the light
// comes from, so the colours slide as the phone tilts.
vec3 foilColour(vec3 Nw, vec3 Vw, vec2 uv, float relief) {
  vec3 R = reflect(-Vw, Nw);
  vec3 sharp = room(R, 0.03);
  vec3 mirror = sharp / (1.0 + sharp);
  float soft = luma(room(R, 0.35));
  vec3 Tw = uHold * vT;
  vec3 Bw = uHold * vB;
  float bands = dot(R, Tw) * 3.4 + dot(R, Bw) * 2.6 + uv.x * 2.1 - uv.y * 1.1 + relief * 2.2;
  float grain = vnoise(uv * vec2(1500.0, 950.0));
  float brushed = vnoise(vec2(uv.x * 2400.0, uv.y * 22.0));
  vec3 silver = vec3(0.68, 0.685, 0.70) * (0.94 + 0.12 * brushed);
  vec3 tint = mix(silver, 0.25 + 0.85 * spectrum(bands), 0.55 * uFoilBoost);
  vec3 col = tint * (0.2 + 0.95 * mirror + 1.6 * soft);
  col += spectrum(bands + 0.15) * (0.05 + 0.6 * soft) * (0.7 + 0.6 * grain) * uFoilBoost;
  return col;
}

// Clear coat: a thin smooth layer that mirrors the room, with the faint
// unevenness of a real lacquer (a print here, a polish swirl there).
vec3 coat(vec3 Nw, vec3 Vw, vec2 uv) {
  vec3 R = reflect(-Vw, Nw);
  float ndv = clamp(dot(Nw, Vw), 0.0, 1.0);
  float f = 0.045 + 0.955 * pow(1.0 - ndv, 5.0);
  float wear = 0.84 + 0.28 * vnoise(uv * vec2(7.0, 4.5));
  // A crisp mirror image plus the soft bloom a bright light leaves around it.
  vec3 mirror = room(R, 0.005) + room(R, 0.06) * 0.35;
  return mirror * f * uCoat * wear;
}

vec3 shadeFront(vec2 uv, vec3 N, vec3 V) {
  vec4 tex = texture2D(uFront, uv);
  float print = tex.r;
  float foil = tex.g;
  vec2 o = uTexel * 2.0;
  float fx = texture2D(uFront, uv + vec2(o.x, 0.0)).g - texture2D(uFront, uv - vec2(o.x, 0.0)).g;
  float fy = texture2D(uFront, uv + vec2(0.0, o.y)).g - texture2D(uFront, uv - vec2(0.0, o.y)).g;
  vec3 n = normalize(N - (vT * fx + vB * fy) * 0.8);
  float g1 = vnoise(uv * vec2(700.0, 440.0));
  float g2 = vnoise(uv * vec2(700.0, 440.0) + 31.0);
  vec3 satin = normalize(n + (vT * (g1 - 0.5) + vB * (g2 - 0.5)) * 0.05);

  vec3 Vw = normalize(uEye * V);
  vec3 Nw = normalize(uHold * satin);
  vec3 R = reflect(-Vw, Nw);

  vec3 col = vec3(uBase, uBase, uBase * 0.94) + room(R, 0.45) * 0.035;
  float edge = min(min(uv.x, 1.0 - uv.x) * 1.5858, min(uv.y, 1.0 - uv.y));
  col += vec3(uRim) * (1.0 - smoothstep(0.0, 0.006, edge)) * (0.6 + luma(room(R, 0.1)));

  float lit = 0.8 + 0.2 * smoothstep(-0.2, 0.9, Nw.z);
  col = mix(col, vec3(0.93, 0.925, 0.895) * lit, print);
  col = mix(col, foilColour(normalize(uHold * n), Vw, uv, fx + fy), foil);

  col += coat(normalize(uHold * N), Vw, uv) * (1.0 - foil * 0.6);
  return knee(col);
}

vec3 shadeBack(vec2 uv, vec3 N, vec3 V) {
  vec4 tex = texture2D(uBack, uv);
  float ink = tex.r;
  float foil = tex.g;
  vec2 o = uTexel * 2.0;
  float fx = texture2D(uBack, uv + vec2(o.x, 0.0)).g - texture2D(uBack, uv - vec2(o.x, 0.0)).g;
  float fy = texture2D(uBack, uv + vec2(0.0, o.y)).g - texture2D(uBack, uv - vec2(0.0, o.y)).g;
  // vT points to the viewer's left on the back, hence the flipped x term.
  vec3 n = normalize(N - (-vT * fx + vB * fy) * 0.8);
  vec3 Vw = normalize(uEye * V);
  vec3 Nw = normalize(uHold * n);
  vec3 R = reflect(-Vw, Nw);

  float fib = vnoise(uv * vec2(240.0, 150.0)) * 0.6 + vnoise(uv * vec2(900.0, 560.0)) * 0.4;
  vec3 paper = vec3(0.958, 0.953, 0.936) * (0.972 + 0.045 * fib);
  float lit = 0.78 + 0.22 * smoothstep(-0.2, 0.9, Nw.z);
  vec3 col = paper * lit + room(R, 0.5) * 0.03;
  col = mix(col, vec3(0.075, 0.074, 0.07) + room(R, 0.18) * 0.02, ink);
  col = mix(col, foilColour(Nw, Vw, uv, fx + fy), foil);
  return knee(col);
}

vec3 shadeEdge(vec3 N, vec3 V) {
  vec3 Vw = normalize(uEye * V);
  vec3 Nw = normalize(uHold * N);
  vec3 R = reflect(-Vw, Nw);
  float fres = pow(1.0 - abs(dot(Nw, Vw)), 2.0);
  return knee(vec3(0.18, 0.18, 0.175) + room(R, 0.14) * 0.7 + vec3(uRim * 1.6) * fres);
}

void main() {
  vec3 N = normalize(vWorldN);
  vec3 V = normalize(cameraPosition - vWorldPos);
  vec2 uv = vLocal.xy / uSize + 0.5;
  vec3 col;
  if (vLocalN.z > 0.5) col = shadeFront(uv, N, V);
  else if (vLocalN.z < -0.5) col = shadeBack(vec2(1.0 - uv.x, uv.y), N, V);
  else col = shadeEdge(N, V);
  gl_FragColor = vec4(col, 1.0);
}
`;
