// GLSL for the two draws of the stage: the flow field behind the card and the
// card itself. Colours arrive as raw sRGB triples and are mixed in display
// space, so no colour-space conversion is applied in either shader.

const common = /* glsl */ `
mat2 rot(float a) { float c = cos(a), s = sin(a); return mat2(c, s, -s, c); }

float hash11(float n) { return fract(sin(n * 127.1) * 43758.5453); }

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

float sdRoundBox(vec2 p, vec2 b, float r) {
  vec2 q = abs(p) - b + r;
  return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r;
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

// Superellipse radius: 1.0 on the boundary of a rounded rectangle.
float superR(vec2 c, float n) {
  c = abs(c) + 1e-5;
  return pow(pow(c.x, n) + pow(c.y, n), 1.0 / n);
}
`;

// Simplex noise 3D: Ashima Arts / Stefan Gustavson, MIT licence.
const simplex = /* glsl */ `
vec3 mod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec4 mod289(vec4 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec4 permute(vec4 x) { return mod289(((x * 34.0) + 10.0) * x); }
vec4 taylorInvSqrt(vec4 r) { return 1.79284291400159 - 0.85373472095314 * r; }

float snoise(vec3 v) {
  const vec2 C = vec2(1.0 / 6.0, 1.0 / 3.0);
  const vec4 D = vec4(0.0, 0.5, 1.0, 2.0);
  vec3 i = floor(v + dot(v, C.yyy));
  vec3 x0 = v - i + dot(i, C.xxx);
  vec3 g = step(x0.yzx, x0.xyz);
  vec3 l = 1.0 - g;
  vec3 i1 = min(g.xyz, l.zxy);
  vec3 i2 = max(g.xyz, l.zxy);
  vec3 x1 = x0 - i1 + C.xxx;
  vec3 x2 = x0 - i2 + C.yyy;
  vec3 x3 = x0 - D.yyy;
  i = mod289(i);
  vec4 p = permute(permute(permute(
            i.z + vec4(0.0, i1.z, i2.z, 1.0))
          + i.y + vec4(0.0, i1.y, i2.y, 1.0))
          + i.x + vec4(0.0, i1.x, i2.x, 1.0));
  float n_ = 0.142857142857;
  vec3 ns = n_ * D.wyz - D.xzx;
  vec4 j = p - 49.0 * floor(p * ns.z * ns.z);
  vec4 x_ = floor(j * ns.z);
  vec4 y_ = floor(j - 7.0 * x_);
  vec4 x = x_ * ns.x + ns.yyyy;
  vec4 y = y_ * ns.x + ns.yyyy;
  vec4 h = 1.0 - abs(x) - abs(y);
  vec4 b0 = vec4(x.xy, y.xy);
  vec4 b1 = vec4(x.zw, y.zw);
  vec4 s0 = floor(b0) * 2.0 + 1.0;
  vec4 s1 = floor(b1) * 2.0 + 1.0;
  vec4 sh = -step(h, vec4(0.0));
  vec4 a0 = b0.xzyw + s0.xzyw * sh.xxyy;
  vec4 a1 = b1.xzyw + s1.xzyw * sh.zzww;
  vec3 p0 = vec3(a0.xy, h.x);
  vec3 p1 = vec3(a0.zw, h.y);
  vec3 p2 = vec3(a1.xy, h.z);
  vec3 p3 = vec3(a1.zw, h.w);
  vec4 norm = taylorInvSqrt(vec4(dot(p0, p0), dot(p1, p1), dot(p2, p2), dot(p3, p3)));
  p0 *= norm.x;
  p1 *= norm.y;
  p2 *= norm.z;
  p3 *= norm.w;
  vec4 m = max(0.5 - vec4(dot(x0, x0), dot(x1, x1), dot(x2, x2), dot(x3, x3)), 0.0);
  m = m * m;
  return 105.0 * dot(m * m, vec4(dot(p0, x0), dot(p1, x1), dot(p2, x2), dot(p3, x3)));
}
`;

export const flowVertex = /* glsl */ `
void main() {
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
`;

// Streamlines are the contours of a stream function: uniform flow past the
// card's silhouette (the classic flow around a cylinder, ψ = y(1 − a²/r²),
// with a superellipse radius), plus slowly advected noise that fades to zero
// at the card so its outline stays a streamline. Pulses travel along the lines
// on the matching velocity potential.
export const flowFragment = /* glsl */ `
uniform vec2 uRes;
uniform float uDpr;
uniform float uTime;
uniform float uMotion;
uniform vec2 uCenter;
uniform vec2 uHalf;
uniform float uAngle;
uniform float uPresence;
uniform vec3 uPointer;
uniform vec3 uBg;
uniform vec3 uLine;
uniform vec3 uPulse;
uniform vec3 uGlow;
uniform float uLineAlpha;
uniform float uPulseAlpha;
uniform float uGlowAlpha;
uniform float uSpacing;
uniform float uReveal;
uniform vec3 uShadowColor;
uniform float uShadowAlpha;
uniform vec2 uShadowOffset;
uniform float uShadowBlur;
uniform float uFadeTop;
uniform float uFadeBottom;
uniform vec2 uQuad[4];
uniform float uQuadRadius;
uniform float uGrain;
${common}
${simplex}

void main() {
  vec2 frag = gl_FragCoord.xy;
  float t = uTime;

  // A fingertip opens a small hole in the field: every point is sampled as
  // if it were pushed away from the touch, which squeezes the lines around it.
  vec2 pos = frag;
  float hole = 0.0;
  if (uPointer.z > 0.002) {
    vec2 d = frag - uPointer.xy;
    float rho = length(d);
    float R = 42.0 * uDpr * uPointer.z;
    float mapped = sqrt(max(rho * rho - R * R, 0.0));
    pos = uPointer.xy + d * (mapped / max(rho, 1e-3));
    hole = 1.0 - smoothstep(R, R + 2.5 * uDpr, rho);
  }

  vec2 q = pos - uCenter;
  float flowAngle = -0.11 + 0.045 * sin(t * 0.027 * uMotion);
  vec2 f = rot(-flowAngle) * q;

  // Obstacle radius from the distance to the projected card: 1.0 on a margin
  // around the card, growing like dist / size far away, as for a cylinder.
  float size = max(min(uHalf.x, uHalf.y), 10.0 * uDpr);
  float edge = sdQuad(pos, uQuad[0], uQuad[1], uQuad[2], uQuad[3]) - uQuadRadius - 13.0 * uDpr;
  float r = 1.0 + max(edge, 0.0) / size;
  float k = uPresence / (r * r);
  float psi = f.y * (1.0 - k);

  float far = smoothstep(1.0, 2.3, r);
  vec2 drift = (f - vec2(t * 16.0 * uDpr * uMotion, 0.0)) / (uSpacing * 11.0);
  float tt = t * 0.03 * uMotion;
  float nz = snoise(vec3(drift * 0.8, tt)) * 0.72 + snoise(vec3(drift * 2.1 + 13.0, tt * 1.5)) * 0.28;
  psi += nz * uSpacing * 2.8 * mix(0.08, 1.0, far);

  float v = psi / uSpacing;
  float id = floor(v + 0.5);
  float fw = max(fwidth(v), 1e-5);
  float dist = abs(v - id) / fw;
  float hw = 0.55 * uDpr;
  float line = clamp(hw + 0.5 - dist, 0.0, 1.0);
  line *= smoothstep(2.2 * uDpr, 5.5 * uDpr, 1.0 / fw);
  float rnd = hash11(id + 17.0);
  float lineA = uLineAlpha * mix(0.42, 1.0, rnd);

  float phi = f.x * (1.0 + k);
  float lambda = uSpacing * (30.0 + 34.0 * hash11(id * 1.7 + 3.0));
  float s = (phi - t * 62.0 * uDpr * uMotion) / lambda + rnd * 17.0;
  float u = fract(s);
  float carrier = step(0.58, hash11(id * 3.1 + 5.0));
  float pulse = pow(u, 16.0) * carrier;
  pulse *= clamp((1.0 - u) / max(fwidth(s) * 1.5, 1e-4), 0.0, 1.0);
  float pulseLine = clamp(hw * 1.5 + 0.5 - dist, 0.0, 1.0);

  float outside = mix(1.0, smoothstep(0.0, 1.5 * uDpr, edge), uPresence);
  float fromTop = uRes.y - frag.y;
  float fade = smoothstep(0.0, uFadeTop, fromTop) * smoothstep(0.0, uFadeBottom, frag.y);
  float mask = outside * (1.0 - hole) * fade * uReveal;

  vec3 col = uBg;

  vec2 sp = frag - uShadowOffset;
  float sd = sdQuad(sp, uQuad[0], uQuad[1], uQuad[2], uQuad[3]) - uQuadRadius + 3.0 * uDpr;
  float shadow = 1.0 - smoothstep(-uShadowBlur * 0.3, uShadowBlur, sd);
  col = mix(col, uShadowColor, shadow * uShadowAlpha * uPresence * uReveal * fade);

  float glowD = sdQuad(frag, uQuad[0], uQuad[1], uQuad[2], uQuad[3]) - uQuadRadius;
  float glow = exp(-max(glowD, 0.0) / (70.0 * uDpr)) * smoothstep(-4.0 * uDpr, 0.0, glowD);
  col = mix(col, uGlow, glow * uGlowAlpha * uPresence * uReveal * fade);

  col = mix(col, uLine, line * lineA * mask);
  col = mix(col, uPulse, pulse * pulseLine * uPulseAlpha * mask);

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

export const cardFragment = /* glsl */ `
uniform sampler2D uFront;
uniform sampler2D uBack;
uniform vec2 uSize;
uniform vec2 uTexel;
uniform float uTime;
uniform float uSweep;
uniform float uAmbient;
uniform float uFoilBoost;
uniform float uBase;
uniform float uRim;
varying vec3 vLocal;
varying vec3 vLocalN;
varying vec3 vWorldPos;
varying vec3 vWorldN;
varying vec3 vT;
varying vec3 vB;
${common}

// A soft rectangular light on the unit sphere, seen along direction R.
float softbox(vec3 R, vec3 dir, vec2 size, float blur) {
  vec3 up = abs(dir.y) < 0.99 ? vec3(0.0, 1.0, 0.0) : vec3(1.0, 0.0, 0.0);
  vec3 tx = normalize(cross(up, dir));
  vec3 ty = cross(dir, tx);
  float dz = dot(R, dir);
  if (dz <= 0.05) return 0.0;
  vec2 pl = vec2(dot(R, tx), dot(R, ty)) / dz;
  vec2 d = abs(pl) - size;
  float sd = length(max(d, 0.0)) + min(max(d.x, d.y), 0.0);
  return 1.0 - smoothstep(-blur * 0.4, blur, sd);
}

// Photo-studio surroundings: a key softbox, two strips and a light that
// sweeps across now and then so the foil wakes up even on a still phone.
vec3 studio(vec3 R, float blur) {
  float l = 0.0;
  l += 1.35 * softbox(R, normalize(vec3(-0.36, 0.42, 0.83)), vec2(0.34, 0.16), blur);
  l += 0.85 * softbox(R, normalize(vec3(0.52, 0.02, 0.85)), vec2(0.05, 0.52), blur);
  l += 0.45 * softbox(R, normalize(vec3(-0.05, -0.55, 0.83)), vec2(0.55, 0.04), blur);
  float sweep = smoothstep(0.0, 0.08, uSweep) * smoothstep(1.0, 0.92, uSweep);
  l += 1.25 * sweep * softbox(R, normalize(vec3(mix(-0.95, 0.95, uSweep), 0.08, 0.62)), vec2(0.035, 0.95), blur);
  float g = R.y * 0.5 + 0.5;
  return vec3(l) + mix(vec3(uAmbient * 0.25), vec3(uAmbient), g);
}

vec3 knee(vec3 c) {
  vec3 hi = max(c - 0.8, 0.0);
  return min(c, 0.8) + hi / (1.0 + hi * 2.2);
}

// Holographic foil: brushed silver at rest that breaks into a moving spectrum
// where it catches a light.
vec3 foilColour(vec3 n, vec3 V, vec2 uv, float relief) {
  vec3 R = reflect(-V, n);
  float hl = dot(studio(R, 0.05), vec3(0.3333));
  float sheen = dot(studio(R, 0.32), vec3(0.3333));
  float phase = dot(R, vec3(2.1, 1.4, 0.6)) + uv.x * 1.7 - uv.y * 1.1 + relief * 2.2;
  vec3 spectrum = 0.5 + 0.5 * cos(6.28318 * (phase + vec3(0.0, 0.33, 0.67)));
  float grain = vnoise(uv * vec2(1500.0, 950.0));
  float brushed = vnoise(vec2(uv.x * 2400.0, uv.y * 22.0));
  vec3 silver = vec3(0.66, 0.665, 0.68) * (0.34 + 0.95 * sheen + 0.06 * brushed);
  silver *= mix(vec3(1.0), 0.75 + 0.5 * spectrum, 0.12);
  vec3 iris = spectrum * uFoilBoost * (0.02 + 1.3 * hl) * (0.7 + 0.6 * grain);
  return silver + iris;
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
  n = normalize(n + (vT * (g1 - 0.5) + vB * (g2 - 0.5)) * 0.05);

  vec3 R = reflect(-V, n);
  float ndv = clamp(dot(n, V), 0.0, 1.0);
  float fres = pow(1.0 - ndv, 5.0);

  // Engraved streamlines around the mark: invisible until they catch light.
  vec2 p = (uv - vec2(0.79, 0.5)) * vec2(1.0, 0.6306);
  vec2 cn = p / vec2(0.17, 0.205);
  float r = superR(cn, 4.0);
  float psi = p.y * (1.0 - 1.0 / max(r * r, 0.05));
  float lv = psi / 0.0105;
  float ld = abs(lv - floor(lv + 0.5)) / max(fwidth(lv), 1e-5);
  float groove = clamp(1.1 - ld, 0.0, 1.0) * smoothstep(1.0, 1.06, r) * smoothstep(1.5, 4.0, 1.0 / max(fwidth(lv), 1e-5));

  vec3 base = vec3(uBase, uBase, uBase * 0.94);
  vec3 col = base + studio(R, 0.34) * (0.035 + 0.24 * fres);
  float edge = min(min(uv.x, 1.0 - uv.x) * 1.5858, min(uv.y, 1.0 - uv.y));
  col += vec3(uRim) * (1.0 - smoothstep(0.0, 0.006, edge)) * (0.5 + 0.5 * fres);
  col += studio(R, 0.08) * groove * 0.16 + vec3(groove * 0.012);

  vec3 inkLit = vec3(0.93, 0.925, 0.895) * (0.86 + 0.14 * dot(n, normalize(vec3(-0.3, 0.45, 0.84))));
  inkLit += studio(R, 0.2) * 0.04;
  col = mix(col, inkLit, print);

  col = mix(col, foilColour(n, V, uv, fx + fy), foil);
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
  vec3 R = reflect(-V, n);

  float fib = vnoise(uv * vec2(240.0, 150.0)) * 0.6 + vnoise(uv * vec2(900.0, 560.0)) * 0.4;
  vec3 paper = vec3(0.958, 0.953, 0.936) * (0.972 + 0.045 * fib);
  float diff = 0.8 + 0.2 * max(dot(n, normalize(vec3(-0.3, 0.45, 0.84))), 0.0);
  vec3 col = paper * diff + studio(R, 0.45) * 0.045;
  col = mix(col, vec3(0.075, 0.074, 0.07) + studio(R, 0.18) * 0.03, ink);
  col = mix(col, foilColour(n, V, uv, fx + fy), foil);
  return knee(col);
}

vec3 shadeEdge(vec3 N, vec3 V) {
  vec3 R = reflect(-V, N);
  float fres = pow(1.0 - abs(dot(N, V)), 2.0);
  return knee(vec3(0.2, 0.2, 0.195) + studio(R, 0.14) * 0.95 + vec3(uRim * 1.6) * fres);
}

void main() {
  vec3 N = normalize(vWorldN);
  if (!gl_FrontFacing) N = -N;
  vec3 V = normalize(cameraPosition - vWorldPos);
  vec2 uv = vLocal.xy / uSize + 0.5;
  vec3 col;
  if (vLocalN.z > 0.5) col = shadeFront(uv, N, V);
  else if (vLocalN.z < -0.5) col = shadeBack(vec2(1.0 - uv.x, uv.y), N, V);
  else col = shadeEdge(N, V);
  gl_FragColor = vec4(col, 1.0);
}
`;
