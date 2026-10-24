export const vertexShader = /* glsl */`
varying vec2 vUv;
void main() { vUv = uv; gl_Position = vec4(position, 1.0); }
`;
const common = /* glsl */`
precision highp float;
varying vec2 vUv;
uniform sampler2D uVelocity, uDye;
uniform float uDt, uTime, uAspect, uProgress, uExpansion, uSpread;
uniform vec2 uVelocityTexel, uDyeTexel;
uniform vec4 uFlow, uSubstance;
uniform float uMaterial;
float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p) {
    vec2 i = floor(p), f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x),
        mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y);
}
float field(vec2 p) {
    p += vec2(noise(p * 0.7 + 4.0), noise(p * 0.7 - 8.0)) * 0.75;
    return noise(p) + 0.28 * noise(p * 2.03 + 17.1);
}
vec2 bounded(vec2 uv) { return clamp(uv, uDyeTexel * 0.5, 1.0 - uDyeTexel * 0.5); }
vec2 backtrace(vec2 uv) {
    vec2 velocity = texture2D(uVelocity, uv).xy / vec2(uAspect, 1);
    vec2 mid = uv - velocity * uDt * 0.5;
    velocity = texture2D(uVelocity, clamp(mid, 0.0, 1.0)).xy / vec2(uAspect, 1);
    return bounded((uv - velocity * uDt - 0.5) * exp(-vec2(0.06, 0.25) * uExpansion * uDt) + 0.5);
}
`;
export const seedShader = common + /* glsl */`
uniform sampler2D uText;
void main() {
    vec4 letter = texture2D(uText, vUv);
    gl_FragColor = vec4(letter.rgb * letter.a, letter.a);
}
`;
export const velocityShader = common + /* glsl */`
uniform vec2 uMouse, uMouseFrom, uMouseVelocity;
uniform float uDragging;
void main() {
    vec2 old = texture2D(uVelocity, vUv).xy;
    vec2 velocity = texture2D(uVelocity, clamp(vUv - old / vec2(uAspect, 1) * uDt, 0.0, 1.0)).xy;
    // Explicit viscosity diffuses momentum, independently of pigment diffusion.
    vec2 vh = uVelocityTexel;
    vec2 neighbors = (texture2D(uVelocity, vUv + vec2(vh.x, 0)).xy
        + texture2D(uVelocity, vUv - vec2(vh.x, 0)).xy
        + texture2D(uVelocity, vUv + vec2(0, vh.y)).xy
        + texture2D(uVelocity, vUv - vec2(0, vh.y)).xy) * 0.25;
    velocity = mix(velocity, neighbors, clamp(uFlow.x * uDt * 60.0, 0.0, 0.95));
    vec2 pos = (vUv - 0.5) * vec2(uAspect, 1);
    vec2 p = pos * uFlow.z + vec2(uTime * 0.025, -uTime * 0.019) * uFlow.w + vec2(3.1, 7.8);
    float e = 0.025;
    vec2 curl = vec2(field(p + vec2(0, e)) - field(p - vec2(0, e)),
        field(p - vec2(e, 0)) - field(p + vec2(e, 0))) / (2.0 * e);
    float activation = smoothstep(0.0, 0.18, uProgress);
    float strength = mix(mix(0.058, 0.10, smoothstep(0.4, 0.67, uProgress)), 0.014, smoothstep(0.78, 1.0, uProgress));
    vec2 ambient = curl * strength * activation * uFlow.y;
    float folding = smoothstep(0.58, 0.78, uProgress) * (1.0 - smoothstep(0.82, 1.0, uProgress));
    vec2 vortex = pos - vec2(-0.02 * uAspect, 0.02);
    vec2 second = pos - vec2(0.19 * uAspect, -0.13);
    ambient += uSubstance.w * folding * (vec2(-vortex.y, vortex.x) * exp(-dot(vortex, vortex) / 0.22) * 3.6
        - vec2(-second.y, second.x) * exp(-dot(second, second) / 0.11) * 1.2);
    float density = texture2D(uDye, vUv).a;
    ambient.y += uSubstance.y * density * activation;
    ambient.x += sin(pos.y * 7.0 + uTime * .12) * uSubstance.z * .07 * activation;
    ambient *= uFlow.w;
    velocity = mix(velocity, ambient, 1.0 - exp(-uDt * mix(1.8, 3.5, uFlow.x)));
    // A swept brush avoids disconnected impulses on fast pointer movement.
    vec2 a = (vUv - uMouseFrom) * vec2(uAspect, 1);
    vec2 segment = (uMouse - uMouseFrom) * vec2(uAspect, 1);
    float along = clamp(dot(a, segment) / max(dot(segment, segment), 0.00001), 0.0, 1.0);
    vec2 d = a - segment * along;
    float radius = mix(0.10, 0.15, uDragging);
    float influence = exp(-dot(d, d) / (radius * radius));
    vec2 impulse = uMouseVelocity * vec2(uAspect, 1);
    impulse *= min(1.0, 2.0 / max(length(impulse), 0.001));
    velocity += impulse * influence * uDt * mix(5.0, 9.0, uDragging) * mix(1.1, .45, uFlow.x);
    velocity *= min(1.0, 0.65 / max(length(velocity), 0.001));
    vec2 wall = smoothstep(vec2(0), uVelocityTexel * 3.0, vUv)
        * smoothstep(vec2(0), uVelocityTexel * 3.0, 1.0 - vUv);
    velocity *= wall;
    gl_FragColor = vec4(velocity, 0, 1);
}
`;
export const divergenceShader = common + /* glsl */`
void main() {
    vec2 h = uVelocityTexel;
    float l = texture2D(uVelocity, vUv - vec2(h.x, 0)).x;
    float r = texture2D(uVelocity, vUv + vec2(h.x, 0)).x;
    float b = texture2D(uVelocity, vUv - vec2(0, h.y)).y;
    float t = texture2D(uVelocity, vUv + vec2(0, h.y)).y;
    vec2 c = texture2D(uVelocity, vUv).xy;
    if (vUv.x < h.x) l = -c.x;
    if (vUv.x > 1.0 - h.x) r = -c.x;
    if (vUv.y < h.y) b = -c.y;
    if (vUv.y > 1.0 - h.y) t = -c.y;
    gl_FragColor = vec4(0.5 * (r - l + t - b), 0, 0, 1);
}
`;
export const pressureShader = common + /* glsl */`
uniform sampler2D uPressure, uDivergence;
void main() {
    vec2 h = uVelocityTexel;
    float p = texture2D(uPressure, vUv - vec2(h.x, 0)).r
        + texture2D(uPressure, vUv + vec2(h.x, 0)).r
        + texture2D(uPressure, vUv - vec2(0, h.y)).r
        + texture2D(uPressure, vUv + vec2(0, h.y)).r;
    gl_FragColor = vec4((p - texture2D(uDivergence, vUv).r) * 0.25, 0, 0, 1);
}
`;
export const projectionShader = common + /* glsl */`
uniform sampler2D uPressure;
void main() {
    vec2 h = uVelocityTexel;
    float l = texture2D(uPressure, vUv - vec2(h.x, 0)).r;
    float r = texture2D(uPressure, vUv + vec2(h.x, 0)).r;
    float b = texture2D(uPressure, vUv - vec2(0, h.y)).r;
    float t = texture2D(uPressure, vUv + vec2(0, h.y)).r;
    vec2 v = texture2D(uVelocity, vUv).xy - 0.5 * vec2(r - l, t - b);
    if (vUv.x < h.x || vUv.x > 1.0 - h.x) v.x = 0.0;
    if (vUv.y < h.y || vUv.y > 1.0 - h.y) v.y = 0.0;
    gl_FragColor = vec4(v, 0, 1);
}
`;
export const advectionShader = common + /* glsl */`
void main() { gl_FragColor = texture2D(uDye, backtrace(vUv)); }
`;
export const dyeShader = common + /* glsl */`
uniform sampler2D uForward, uBackward;
uniform float uFillRadius;
void main() {
    vec2 uv = backtrace(vUv), h = uDyeTexel;
    vec4 original = texture2D(uDye, vUv), forward = texture2D(uForward, vUv);
    // Bounded MacCormack correction limits numerical blur without new extrema.
    vec2 base = (floor(uv / h - 0.5) + 0.5) * h;
    vec4 a = texture2D(uDye, bounded(base));
    vec4 b = texture2D(uDye, bounded(base + vec2(h.x, 0)));
    vec4 c = texture2D(uDye, bounded(base + vec2(0, h.y)));
    vec4 d = texture2D(uDye, bounded(base + h));
    vec4 lo = min(min(a, b), min(c, d)), hi = max(max(a, b), max(c, d));
    vec4 corrected = clamp(forward + 0.5 * (original - texture2D(uBackward, vUv)), lo, hi);
    // Do not sharpen the advancing front; it needs a continuous soft density.
    vec4 dye = mix(forward, corrected, smoothstep(0.1, 0.8, forward.a));
    // Expand sparse material farther without over-blurring the occupied color field.
    float frontRadius = mix(uFillRadius, 6.0 * sqrt(uSubstance.x), smoothstep(0.02, 0.85, forward.a));
    float radius = mix(1.0, frontRadius, uSpread);
    vec2 dx = vec2(h.x * radius, 0), dy = vec2(0, h.y * radius);
    vec4 blurred = texture2D(uForward, bounded(vUv + dx))
        + texture2D(uForward, bounded(vUv - dx))
        + texture2D(uForward, bounded(vUv + dy))
        + texture2D(uForward, bounded(vUv - dy));
    blurred += 0.5 * (texture2D(uForward, bounded(vUv + dx + dy))
        + texture2D(uForward, bounded(vUv + dx - dy))
        + texture2D(uForward, bounded(vUv - dx + dy))
        + texture2D(uForward, bounded(vUv - dx - dy)));
    blurred /= 6.0;
    dye = mix(dye, blurred, 1.0 - exp(-uDt * (0.06 * uSubstance.x + 18.0 * uSpread)));
    // Reaction-diffusion grows ONLY existing dye. RGB and density grow together,
    // preserving hue even at the advancing edge. No opacity dissipation at rest.
    float density = min(1.0, dye.a * exp(uDt * 11.0 * uSpread));
    vec3 color = dye.rgb / max(dye.a, 1.0e-20);
    gl_FragColor = vec4(clamp(color, 0.0, 1.0) * density, density);
}
`;
export const displayShader = common + /* glsl */`
uniform float uGrain, uTransparent;
uniform vec2 uViewScale;
uniform vec2 uCanvasSize;
float shadowAt(vec2 uv, vec2 radius) {
    float a = texture2D(uDye, bounded(uv)).a * 4.0;
    a += (texture2D(uDye, bounded(uv + vec2(radius.x, 0))).a
        + texture2D(uDye, bounded(uv - vec2(radius.x, 0))).a
        + texture2D(uDye, bounded(uv + vec2(0, radius.y))).a
        + texture2D(uDye, bounded(uv - vec2(0, radius.y))).a) * 2.0;
    a += texture2D(uDye, bounded(uv + radius)).a
        + texture2D(uDye, bounded(uv - radius)).a
        + texture2D(uDye, bounded(uv + vec2(radius.x, -radius.y))).a
        + texture2D(uDye, bounded(uv + vec2(-radius.x, radius.y))).a;
    return a / 16.0;
}
void main() {
    vec2 uv = (vUv - .5) * uViewScale + .5;
    // A compact reconstruction kernel, never distant palette samples.
    float softness = smoothstep(0.12, 0.8, uProgress);
    vec2 h = uDyeTexel * mix(0.35, mix(2.0, 4.5, step(1.5, uMaterial) * (1.0 - step(2.5, uMaterial))), softness);
    vec4 dye = texture2D(uDye, uv) * 4.0;
    dye += texture2D(uDye, bounded(uv + vec2(h.x, 0)))
        + texture2D(uDye, bounded(uv - vec2(h.x, 0)))
        + texture2D(uDye, bounded(uv + vec2(0, h.y)))
        + texture2D(uDye, bounded(uv - vec2(0, h.y)));
    dye *= 0.125;
    vec3 ink = dye.rgb / max(dye.a, 1.0e-20);
    float coverage = smoothstep(0.015, 0.85, dye.a);
    // The palette stays in the dye; only its presentation starts white.
    // Color appears on the same deforming material as melting begins.
    float reveal = smoothstep(0.015, 0.19, uProgress);
    // Material lighting follows the evolving pigment surface and velocity field.
    vec2 e = uDyeTexel * 3.0;
    vec4 left = texture2D(uDye, bounded(uv - vec2(e.x, 0)));
    vec4 right = texture2D(uDye, bounded(uv + vec2(e.x, 0)));
    vec4 down = texture2D(uDye, bounded(uv - vec2(0, e.y)));
    vec4 up = texture2D(uDye, bounded(uv + vec2(0, e.y)));
    vec3 weights = vec3(.299, .587, .114);
    vec2 grad = vec2(dot(right.rgb - left.rgb, weights), dot(up.rgb - down.rgb, weights));
    vec2 flow = texture2D(uVelocity, uv).xy;
    vec3 normal = normalize(vec3(-grad * 22.0 - flow * 6.0, 1.0));
    float ridge = clamp(length(grad) * 12.0, 0.0, 1.0);
    if (uMaterial > .5 && uMaterial < 1.5) {
        float satin = pow(max(0.0, dot(normal, normalize(vec3(-.5, .8, 1.0)))), 18.0);
        ink = ink * (.93 + .12 * normal.z) + satin * .16;
    } else if (uMaterial > 2.5 && uMaterial < 3.5) {
        ink = ink * (.86 + .14 * normal.z) + ink * ridge * .42;
    } else if (uMaterial > 3.5) {
        vec3 reflection = reflect(vec3(0, 0, -1), normal);
        float band = dot(reflection, normalize(vec3(.4, 1, .2)));
        float darkBand = smoothstep(-.3, -.08, band) * (1.0 - smoothstep(.06, .26, band));
        float strip = exp(-pow((band - .43) * 14.0, 2.0));
        float rim = pow(1.0 - normal.z, 2.0);
        ink = mix(ink * .75 + vec3(.19), ink * .13 + vec3(.025), darkBand * .88);
        ink += vec3(strip * .68 + rim * .3);
    }
    vec3 background = vec3(1.0);
    if (reveal < 1.0) {
        vec2 pixel = 1.0 / uCanvasSize;
        float contact = shadowAt(uv + vec2(0, 2.5) * pixel, pixel * 3.0);
        float ambient = shadowAt(uv + vec2(0, 8.0) * pixel, pixel * 11.0);
        background -= vec3(0.15, 0.14, 0.12) * (contact * 0.45 + ambient * 0.65) * (1.0 - reveal);
    }
    vec3 color = mix(background, mix(vec3(1.0), ink, reveal), coverage);
    float grain = hash(gl_FragCoord.xy) - 0.5;
    float fine = hash(gl_FragCoord.yx + 19.7) - 0.5;
    float broad = noise(vUv * vec2(uAspect, 1) * 38.0) - 0.5;
    color += coverage * reveal * (grain * uGrain + broad * 0.009);
    color += fine / 255.0 * reveal;
    if (uTransparent > .5) {
        // Straight alpha, with no white matte or drop shadow baked into edges.
        color = mix(vec3(1.0), ink, reveal) + reveal * (grain * uGrain + broad * .009 + fine / 255.0);
    }
    gl_FragColor = vec4(clamp(color, 0.0, 1.0), mix(1.0, coverage, uTransparent));
}
`;
