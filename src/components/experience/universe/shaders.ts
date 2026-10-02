/**
 * GLSL for the case universe. Three custom materials, each one draw call for
 * the whole graph:
 *
 *   NODE      instanced solids with a rim/key light, state-driven energy and a
 *             screen-door dither for files that are still out of focus
 *   HALO      instanced billboards: rings, orbiting ticks, shockwaves
 *   RIBBON    every edge in a single mesh, constant pixel width, animated flow
 *
 * All uniforms are plain numbers/colours so a theme can retune the look
 * without touching shader code.
 */

export const NODE_VERT = /* glsl */ `
attribute vec4 aData;   // x energy, y state (0 locked … 4 failed), z phase, w spawn (0…1)
attribute vec4 aFlags;  // x new, y suspicious, z selected, w hovered
attribute vec3 aColor;
attribute float aPulse;  // 0…1 ripple progress (1 = none)
attribute float aCell;   // index-card face in the atlas (cards only)
uniform float uTime;
uniform float uCardV;    // 1 = paper cards: no tumble, no breathing
uniform vec2 uShrink;    // inside a tunnel: files shrink to nothing as they pass the lens (x..y view depth); 0,0 = off
varying vec3 vNormal;
varying vec3 vView;
varying vec3 vWorld;
varying vec3 vColor;
varying vec4 vData;
varying vec4 vFlags;
varying vec2 vUv;
varying float vCell;

float easeOutBack(float t) {
  float c1 = 1.70158; float c3 = c1 + 1.0;
  return 1.0 + c3 * pow(t - 1.0, 3.0) + c1 * pow(t - 1.0, 2.0);
}

void main() {
  vData = aData; vFlags = aFlags; vColor = aColor; vUv = uv; vCell = aCell;
  float avail = step(1.5, aData.y) * step(aData.y, 2.5);
  float breathe = 1.0 + 0.05 * sin(uTime * 1.8 + aData.z * 6.2831) * avail * (1.0 - uCardV);
  float bump = aPulse < 1.0 ? 0.22 * sin(clamp(aPulse, 0.0, 1.0) * 3.14159) : 0.0;
  // Paper doesn't swell: a selected card is lifted off the cork instead.
  float lift = 1.0 + (0.16 * aFlags.z + 0.08 * aFlags.w) * (1.0 - 0.75 * uCardV) + bump;
  float spawn = aData.w >= 1.0 ? 1.0 : max(0.0, easeOutBack(clamp(aData.w, 0.0, 1.0)));
  vec3 p = position * breathe * lift * spawn;
  p.z += uCardV * (0.55 * aFlags.z + 0.25 * aFlags.w);
  // Anomalies tremble.
  p += aFlags.y * 0.035 * vec3(sin(uTime * 37.0 + aData.z * 40.0), cos(uTime * 31.0 + aData.z * 17.0), sin(uTime * 29.0 + aData.z * 9.0));
  // Slow tumble so solids read as objects, not sprites. Pinned cards stay pinned.
  float a = (1.0 - uCardV) * uTime * (0.12 + 0.1 * aData.z) * (1.0 - 0.7 * step(3.5, aData.y)) * (0.4 + 0.6 * step(0.5, aData.x));
  float c = cos(a), s = sin(a);
  p = vec3(c * p.x + s * p.z, p.y, -s * p.x + c * p.z);
  vec3 n = vec3(c * normal.x + s * normal.z, normal.y, -s * normal.x + c * normal.z);
#ifdef USE_INSTANCING
  mat4 im = instanceMatrix;
#else
  mat4 im = mat4(1.0);
#endif
  if (uShrink.y > 0.0) {
    float cz = -(viewMatrix * modelMatrix * im * vec4(0.0, 0.0, 0.0, 1.0)).z;
    p *= smoothstep(uShrink.x, uShrink.y, cz);
  }
  vec4 wp = modelMatrix * im * vec4(p, 1.0);
  vWorld = wp.xyz;
  vec4 mv = viewMatrix * wp;
  vView = mv.xyz;
  vNormal = normalize(mat3(viewMatrix) * mat3(modelMatrix) * mat3(im) * n);
  gl_Position = projectionMatrix * mv;
}
`;

export const NODE_FRAG = /* glsl */ `
uniform float uTime;
uniform vec3 uFog;
uniform float uFogDensity;
uniform vec3 uWarm;
uniform float uCard;     // 1 = index cards on a wall, 0 = solids
uniform vec3 uPaper;
uniform vec3 uInk;
uniform sampler2D uAtlas; // typed card faces: r ink, g stamp, b redaction
uniform vec2 uGrid;       // atlas columns, rows (0,0 = no atlas yet)
uniform vec2 uNear;       // view depth over which a file close to the lens dissolves
varying vec3 vNormal;
varying vec3 vView;
varying vec3 vWorld;
varying vec3 vColor;
varying vec4 vData;
varying vec4 vFlags;
varying vec2 vUv;
varying float vCell;

float hash(vec2 p) { return fract(sin(dot(p, vec2(41.3, 289.1))) * 43758.5453); }
float box(vec2 p, vec2 a, vec2 b) { return step(a.x, p.x) * step(p.x, b.x) * step(a.y, p.y) * step(p.y, b.y); }

void main() {
  float energy = vData.x;
  float state = vData.y;
  vec3 N = normalize(vNormal);
  vec3 V = normalize(-vView);
  float ndv = clamp(dot(N, V), 0.0, 1.0);
  float fres = pow(1.0 - ndv, 2.2);
  float key = clamp(dot(N, normalize(vec3(0.45, 0.85, 0.55))), 0.0, 1.0);
  float fill = clamp(dot(N, normalize(vec3(-0.6, -0.2, 0.7))), 0.0, 1.0);
  float depth = -vView.z;
  // Anything that drifts close to the lens dissolves instead of filling the screen.
  float near = smoothstep(uNear.x, uNear.y, depth);
  if (near < 0.03) discard;

  vec3 base = vColor;
  vec3 col;
  float isLocked = 1.0 - step(0.5, state);
  float failed = step(3.5, state);
  float dither = hash(floor(gl_FragCoord.xy * 0.5));

  if (uCard > 0.5) {
    // An index card: paper, a header band in the file's state colour, ruled lines, a pin.
    vec3 paper = uPaper * mix(1.0, 0.68, isLocked) * mix(1.0, 0.5, failed);
    float front = step(0.55, N.z);
    float lightK = 0.78 + 0.26 * key;
    col = paper * lightK;
    if (front > 0.5) {
      // Paper tooth and a lamp-side falloff, so a card reads as stock under light, not a flat quad.
      float tooth = hash(floor(vUv * vec2(180.0, 220.0)) + vCell);
      col *= 0.97 + 0.05 * tooth;
      col *= 1.0 - 0.07 * vUv.y * (1.0 - vUv.x);
      float bandM = box(vUv, vec2(0.0, 0.83), vec2(1.0, 0.905));
      col = mix(col, base * (0.7 + 0.5 * energy), bandM * (1.0 - 0.55 * isLocked));
      if (uGrid.x > 0.5) {
        // The typed face for this file (code, title, family, points, stamp, redaction).
        vec2 cell = vec2(mod(vCell, uGrid.x), floor(vCell / uGrid.x));
        vec2 auv = vec2((cell.x + vUv.x) / uGrid.x, 1.0 - (cell.y + (1.0 - vUv.y)) / uGrid.y);
        // A negative LOD bias keeps typed strokes crisp when a card is small on screen.
        vec3 face = texture2D(uAtlas, auv, -0.8).rgb;
        col = mix(col, uInk, face.r * mix(0.92, 0.6, isLocked));
        col = mix(col, vec3(0.04, 0.035, 0.03), face.b * 0.92);
        col = mix(col, vec3(0.16, 0.4, 0.24), face.g * 0.82);
      } else {
        float rule = box(vUv, vec2(0.14, 0.62), vec2(0.86, 0.635)) + box(vUv, vec2(0.14, 0.5), vec2(0.78, 0.515)) + box(vUv, vec2(0.14, 0.38), vec2(0.86, 0.395)) + box(vUv, vec2(0.14, 0.26), vec2(0.6, 0.275));
        col = mix(col, uInk, clamp(rule, 0.0, 1.0) * mix(0.42, 0.14, isLocked));
        float hatch = step(0.5, fract((vUv.x + vUv.y) * 16.0));
        col = mix(col, uInk, isLocked * hatch * box(vUv, vec2(0.1, 0.1), vec2(0.9, 0.78)) * 0.35);
      }
      // The pin.
      float pinD = length((vUv - vec2(0.5, 0.955)) * vec2(1.0, 1.2));
      float pin = smoothstep(0.05, 0.035, pinD);
      col = mix(col, vec3(0.72, 0.1, 0.1) + vec3(0.35) * smoothstep(0.03, 0.0, length(vUv - vec2(0.49, 0.962))), pin);
    }
    col += base * (0.22 * vFlags.z + 0.1 * vFlags.w);
    // Cards never dither: hatching already says "redacted", and noise on paper looks like a fault.
    if (dither > near && vFlags.z < 0.5) discard;
  } else {
    vec3 lit = base * (0.16 + 0.62 * key + 0.22 * fill) * (0.35 + 0.65 * energy);
    lit += uWarm * key * 0.06;
    vec3 rim = base * fres * (0.55 + 1.6 * energy);
    vec3 core = base * pow(ndv, 3.0) * 0.5 * energy;
    col = lit + rim + core;
    col += base * (0.45 * vFlags.z + 0.25 * vFlags.w) * (0.5 + fres);
    // Files that are out of focus are partly obscured: screen-door dither + faint scan bands.
    float keep = mix(0.32, 1.0, smoothstep(0.1, 0.62, energy));
    float band = step(0.5, fract(vWorld.y * 2.2 + uTime * 0.05));
    keep *= mix(1.0, 0.75 + 0.25 * band, isLocked) * near;
    if (dither > keep && vFlags.z < 0.5) discard;
    col = mix(col, vec3(dot(col, vec3(0.3, 0.59, 0.11))) * vec3(1.0, 0.55, 0.62), failed * 0.55);
  }
  // Anomalies flicker toward their warning colour.
  col += vFlags.y * vec3(0.22, 0.14, 0.0) * (0.5 + 0.5 * sin(uTime * 22.0 + vData.z * 30.0));

  float fogAmt = 1.0 - exp(-uFogDensity * uFogDensity * dot(vView, vView) * 1.44);
  col = mix(col, uFog, clamp(fogAmt, 0.0, 0.94));
  gl_FragColor = vec4(col, 1.0);
}
`;

export const HALO_VERT = /* glsl */ `
attribute vec4 aData;
attribute vec4 aFlags;
attribute vec3 aColor;
attribute float aSize;
attribute float aPulse;
attribute float aRot;   // a pinned card's tilt, so its shadow and outline tilt with it
uniform float uTime;
uniform vec2 uShrink;
varying vec2 vUv;
varying vec3 vColor;
varying vec4 vData;
varying vec4 vFlags;
varying float vSeed;
varying float vPulse;
varying float vDepth;
void main() {
  float cr = cos(-aRot), sr = sin(-aRot);
  vUv = vec2(cr * position.x - sr * position.y, sr * position.x + cr * position.y);
  vColor = aColor; vData = aData; vFlags = aFlags; vPulse = aPulse;
  vSeed = aData.z;
#ifdef USE_INSTANCING
  vec4 center = instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);
#else
  vec4 center = vec4(0.0, 0.0, 0.0, 1.0);
#endif
  vec4 mv = viewMatrix * modelMatrix * center;
  vDepth = -mv.z;
  float spawn = aData.w >= 1.0 ? 1.0 : clamp(aData.w, 0.0, 1.0);
  float size = aSize * (0.35 + 0.65 * spawn);
  if (uShrink.y > 0.0) size *= smoothstep(uShrink.x, uShrink.y, vDepth);
  mv.xy += position.xy * size;
  gl_Position = projectionMatrix * mv;
}
`;

export const HALO_FRAG = /* glsl */ `
uniform float uTime;
uniform vec2 uNear;
varying vec2 vUv;
varying vec3 vColor;
varying vec4 vData;
varying vec4 vFlags;
varying float vSeed;
varying float vPulse;
varying float vDepth;
const float PI = 3.14159265;

float ring(float r, float radius, float w) { return smoothstep(w, 0.0, abs(r - radius)); }

void main() {
  float r = length(vUv);          // 0…1 across the quad
  if (r > 1.0) discard;
  float ang = atan(vUv.y, vUv.x);
  float energy = vData.x;
  float state = vData.y;
  float a = 0.0;

  // Every file carries a hairline ring; how bright says how legible it is.
  a += ring(r, 0.52, 0.018) * (0.18 + 0.5 * energy);

  // Available: orbiting ticks + a slow pulse ring.
  if (state > 1.5 && state < 2.5) {
    float ticks = smoothstep(0.86, 1.0, sin(ang * 12.0 + uTime * 1.2 + vSeed * 6.28));
    a += ring(r, 0.66, 0.02) * ticks * 0.9;
    float pulse = fract(uTime * 0.35 + vSeed);
    a += ring(r, 0.5 + pulse * 0.42, 0.02) * (1.0 - pulse) * 0.5;
  }
  // Completed: a second, steady ring — archived.
  if (state > 2.5 && state < 3.5) {
    a += ring(r, 0.62, 0.012) * 0.55;
    a += ring(r, 0.72, 0.008) * 0.25;
  }
  // Discovered: a soft breathing halo.
  if (state > 0.5 && state < 1.5) {
    a += smoothstep(0.62, 0.3, r) * (0.10 + 0.06 * sin(uTime * 1.3 + vSeed * 6.28));
  }
  // Failed: broken ring.
  if (state > 3.5) {
    float gap = step(0.35, fract(ang / (2.0 * PI) * 7.0));
    a += ring(r, 0.6, 0.02) * gap * 0.7;
  }
  // New: a shockwave that leaves and returns.
  if (vFlags.x > 0.5) {
    float p = fract(uTime * 0.5 + vSeed);
    a += ring(r, 0.4 + p * 0.55, 0.025) * (1.0 - p) * 1.2;
  }
  // Spawn ripple.
  if (vData.w < 1.0) {
    float p = clamp(vData.w, 0.0, 1.0);
    a += ring(r, 0.2 + p * 0.8, 0.04) * (1.0 - p) * 1.6;
  }
  // Event ripple (a solve, a unlock): the world answering something real.
  if (vPulse < 1.0) {
    float p = clamp(vPulse, 0.0, 1.0);
    a += ring(r, 0.3 + p * 0.7, 0.05) * (1.0 - p) * 1.9;
    a += ring(r, 0.3 + p * 0.5, 0.03) * (1.0 - p) * 1.0;
  }
  // Suspicious: unstable amber arc.
  if (vFlags.y > 0.5) {
    float arc = smoothstep(0.3, 0.0, abs(sin(ang * 0.5 + uTime * 3.0 + vSeed * 9.0)));
    a += ring(r, 0.7 + 0.02 * sin(uTime * 25.0), 0.02) * arc * 0.9;
  }
  // Selected: crosshair brackets.
  if (vFlags.z > 0.5) {
    float br = ring(r, 0.8, 0.018);
    float corners = step(0.8, abs(cos(ang * 2.0)));
    a += br * corners * 1.4;
  }
  a += vFlags.w * ring(r, 0.74, 0.02) * 0.7;
  a *= 0.82 * smoothstep(uNear.x + 0.5, uNear.y + 1.0, vDepth);
  gl_FragColor = vec4(vColor * (0.8 + 0.6 * energy), clamp(a, 0.0, 1.0));
}
`;

/**
 * Halo for pinned index cards: rings around paper look like UI, so a card gets
 * what paper gets under a lamp — a soft drop shadow on the cork — plus a state
 * outline in the file's colour (open files beckon, new ones send a ripple, the
 * selected one is framed). Normal blending: shadows must darken a light wall.
 */
export const HALO_CARD_FRAG = /* glsl */ `
uniform float uTime;
varying vec2 vUv;
varying vec3 vColor;
varying vec4 vData;
varying vec4 vFlags;
varying float vSeed;
varying float vPulse;
varying float vDepth;

// Signed distance to a rounded box of half-size b.
float sdBox(vec2 p, vec2 b, float r) { vec2 q = abs(p) - b + r; return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r; }

void main() {
  float state = vData.y;
  float spawn = vData.w >= 1.0 ? 1.0 : clamp(vData.w, 0.0, 1.0);
  // The quad spans 2.6 card-radii; the card is 2.7 × 3.3 → half extents in quad space:
  vec2 half_ = vec2(0.519, 0.635);
  float lifted = vFlags.z;
  vec2 off = vec2(0.035, -0.05) * (1.0 + 2.2 * lifted);
  float d = sdBox(vUv - off, half_, 0.02);
  float shadow = (1.0 - smoothstep(-0.02, 0.07 + 0.08 * lifted, d)) * (0.42 + 0.18 * lifted) * spawn;
  vec3 col = vec3(0.12, 0.07, 0.02);
  float a = shadow;
  float edge = sdBox(vUv, half_ + 0.02, 0.025);
  // Open files: a pulsing outline in the file's colour.
  if (state > 1.5 && state < 2.5) {
    float pulse = 0.55 + 0.45 * sin(uTime * 2.2 + vSeed * 6.28);
    float ring = smoothstep(0.016, 0.0, abs(edge)) * (0.55 + 0.45 * pulse);
    col = mix(col, vColor, ring);
    a = max(a, ring * 0.9);
  }
  // New: a rectangular ripple leaves the card.
  if (vFlags.x > 0.5) {
    float p = fract(uTime * 0.45 + vSeed);
    float w = smoothstep(0.02, 0.0, abs(edge - p * 0.28)) * (1.0 - p);
    col = mix(col, vColor, w);
    a = max(a, w);
  }
  // Event ripple (solve / unlock).
  if (vPulse < 1.0) {
    float p = clamp(vPulse, 0.0, 1.0);
    float w = smoothstep(0.03, 0.0, abs(edge - p * 0.34)) * (1.0 - p);
    col = mix(col, vColor, w);
    a = max(a, w);
  }
  // Selected / hovered: a frame.
  if (vFlags.z > 0.5 || vFlags.w > 0.5) {
    float fr = smoothstep(0.012, 0.0, abs(sdBox(vUv, half_ + 0.055, 0.03))) * (vFlags.z > 0.5 ? 1.0 : 0.6);
    col = mix(col, vColor, fr);
    a = max(a, fr);
  }
  a *= smoothstep(4.0, 12.0, vDepth);
  gl_FragColor = vec4(col, clamp(a, 0.0, 1.0));
}
`;

export const RIBBON_VERT = /* glsl */ `
attribute vec3 aPrev;
attribute vec3 aNext;
attribute float aSide;
attribute float aT;
attribute vec3 aInfo;   // x flow (0 dormant, 1 live, 2 done), y width factor, z seed
attribute float aBirth; // index of the later file: the thread is drawn as the build reaches it
uniform float uWidth;   // pixels
uniform float uPx;      // world units per pixel at depth 1
uniform float uTime;
uniform float uWave;
varying float vT;
varying float vSide;
varying vec3 vInfo;
varying float vDepth;
varying float vBirth;
void main() {
  vT = aT; vSide = aSide; vInfo = aInfo; vBirth = aBirth;
  vec3 p = position;
  vec3 pn = aNext;
  vec3 pp = aPrev;
  if (uWave > 0.0) {
    // Signal edges are waveforms: displace across the path, amplitude tied to flow.
    float amp = uWave * (0.25 + 0.75 * step(0.5, aInfo.x)) * sin(aT * 3.14159);
    vec3 dir = normalize(pn - pp + vec3(0.0001));
    vec3 across = normalize(cross(dir, vec3(0.0, 0.0, 1.0)) + vec3(0.0001));
    p += across * sin(aT * 46.0 - uTime * 5.0 + aInfo.z * 20.0) * amp;
  }
  // Width is applied in VIEW space, so a thread keeps a constant on-screen weight
  // and stays well-formed even when part of it is behind the camera.
  vec4 c = modelViewMatrix * vec4(p, 1.0);
  vec4 n = modelViewMatrix * vec4(pn, 1.0);
  vec4 q = modelViewMatrix * vec4(pp, 1.0);
  vec3 d = n.xyz - q.xyz;
  vec3 side = normalize(cross(d, vec3(0.0, 0.0, 1.0)) + vec3(1e-6));
  float depth = max(-c.z, 0.05);
  vDepth = depth;
  c.xyz += side * aSide * 0.5 * uWidth * uPx * depth * aInfo.y;
  gl_Position = projectionMatrix * c;
}
`;

export const RIBBON_FRAG = /* glsl */ `
uniform float uTime;
uniform vec3 uBase;
uniform vec3 uLive;
uniform vec3 uFog;
uniform float uStyle;    // 0 beam, 1 filament, 2 string, 3 wave
uniform float uReveal;   // author build: threads grow from their source as the count passes their birth
varying float vT;
varying float vSide;
varying vec3 vInfo;
varying float vDepth;
varying float vBirth;
void main() {
  float grow = clamp((uReveal - vBirth) / 2.5, 0.0, 1.0);
  if (vT > grow) discard;
  float flow = vInfo.x;
  float edge = 1.0 - abs(vSide);           // soft across the width
  float aa = smoothstep(0.0, 0.55, edge);
  vec3 col = uBase;
  float alpha = 0.22;
  if (flow > 0.5) { col = uLive; alpha = 0.55; }
  if (flow > 1.5) { col = mix(uBase, uLive, 0.5); alpha = 0.4; }
  // Travelling pulse along live threads.
  float speed = uStyle > 2.5 ? 0.9 : 0.55;
  float pulse = smoothstep(0.82, 1.0, sin((vT * 3.0 - uTime * speed + vInfo.z * 10.0) * 6.2831));
  if (flow > 0.5 && flow < 1.5) { alpha += pulse * 0.6; col += uLive * pulse * 0.4; }
  // Dormant threads are dashed: you know the direction, you haven't earned the passage.
  if (flow < 0.5) alpha *= step(0.45, fract(vT * 34.0 + vInfo.z));
  // Strings are drawn solid, like thread: live leads bright, finished runs older and darker, dormant ones faint.
  if (uStyle > 1.5 && uStyle < 2.5) {
    alpha = flow < 0.5 ? 0.42 : flow > 1.5 ? 0.6 : 0.96;
    if (flow > 1.5) col = uBase * 0.72;
  }
  // Filaments are whispers; the story is in the nodes.
  if (uStyle > 0.5 && uStyle < 1.5) alpha *= flow > 1.5 ? 0.4 : 0.7;
  // Fade at the ends so threads emerge from the files, not through them. String is tied off at the pins.
  float ends = uStyle > 1.5 && uStyle < 2.5 ? 1.0 : smoothstep(0.0, 0.08, vT) * smoothstep(1.0, 0.92, vT);
  alpha *= ends * smoothstep(2.0, 9.0, vDepth);
  // The growing tip is bright: you can see the thread being drawn.
  float tip = (1.0 - grow) > 0.001 ? 1.0 - smoothstep(0.0, 0.07, grow - vT) : 0.0;
  col += uLive * tip;
  alpha += tip * 0.55;
  gl_FragColor = vec4(col, alpha * aa);
}
`;

export const BACKDROP_GRID_FRAG = /* glsl */ `
uniform float uTime;
uniform vec3 uLine;
uniform vec3 uBg;
uniform vec3 uFocus;
varying vec3 vWorld;
void main() {
  vec2 g = vWorld.xz;
  vec2 cell = abs(fract(g / 4.0 - 0.5) - 0.5) / fwidth(g / 4.0);
  float line = 1.0 - min(min(cell.x, cell.y), 1.0);
  float d = distance(vWorld.xz, uFocus.xz);
  float fade = smoothstep(90.0, 8.0, d);
  float pulse = 0.5 + 0.5 * sin(d * 0.35 - uTime * 0.8);
  float a = line * fade * (0.28 + 0.12 * pulse);
  gl_FragColor = vec4(uLine, a);
}
`;

export const BACKDROP_NEBULA_FRAG = /* glsl */ `
uniform float uTime;
uniform vec3 uA;
uniform vec3 uB;
varying vec3 vDir;
float h(vec3 p) { return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453); }
float noise(vec3 p) {
  vec3 i = floor(p); vec3 f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(h(i), h(i + vec3(1,0,0)), f.x), mix(h(i + vec3(0,1,0)), h(i + vec3(1,1,0)), f.x), f.y),
             mix(mix(h(i + vec3(0,0,1)), h(i + vec3(1,0,1)), f.x), mix(h(i + vec3(0,1,1)), h(i + vec3(1,1,1)), f.x), f.y), f.z);
}
void main() {
  vec3 d = normalize(vDir);
  float n = noise(d * 3.0 + uTime * 0.02) * 0.6 + noise(d * 7.0 - uTime * 0.03) * 0.3 + noise(d * 15.0) * 0.1;
  float band = smoothstep(0.35, 0.85, n);
  vec3 col = mix(uA, uB, band) * (0.35 + 0.65 * band) ;
  gl_FragColor = vec4(col * 0.55, 1.0);
}
`;
