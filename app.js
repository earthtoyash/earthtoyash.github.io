
/** @type {HTMLCanvasElement} */
const canvas = window.canvas
const gl = canvas.getContext("webgl2")
const dpr = Math.max(.5, .25*window.devicePixelRatio)
/** @type {Map<string,PointerEvent>} */
const touches = new Map()

const vertexSource = `#version 300 es
#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif

in vec2 position;

void main(void) {
    gl_Position = vec4(position, 0., 1.);
}
`
const fragmentSource = `#version 300 es

#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif

uniform float time;
uniform vec2 resolution;
uniform vec2 touch;
uniform int pointerCount;

out vec4 fragColor;

#define T (mod(.3*time, 100.))
#define S smoothstep
#define mouse (touch/resolution)
#define rot(a) mat2(cos(a),-sin(a),sin(a),cos(a))
#define rep(p,n) (mod(p,n)-.5*n)
#define sunoff vec3(1,2,3)
// 45 degrees
#define INCLANG .78539

float rnd(vec2 p) {
  return fract(sin(dot(p, vec2(12.233, 78.599))) * 45019.422);
}

float noise(vec2 p) {
  p *= 3.;
  vec2 f = fract(p), i = floor(p);
  float
  a = rnd(i),
  b = rnd(i + vec2(1, 0)),
  c = rnd(i + vec2(0, 1)),
  d = rnd(i + vec2(1, 1));

  vec2 u = f * f * (3. - 2. * f);

  return mix(a, b, u.x) +
    (c - a) * u.y * (1. - u.x) +
    (d - b) * u.y * u.x;
}

float smin(float a, float b, float k) {
  float h = clamp(.5 + .5 * (b - a) / k, .0, 1.);

  return mix(b, a, h) - k * h * (1. - h);
}

float disc(vec3 p, vec2 s, float r) {
  vec2 e = vec2(abs(length(p.xz)), abs(p.y)) - s;

  return length(max(e, .0)) +
    min(.0, max(e.x, e.y)) - r;
}

float box(vec3 p, vec3 s, float r) {
  p = abs(p) - s;

  return length(max(p, .0)) +
    min(.0, max(max(p.x, p.y), p.z)) - r;
}

float mspo(vec3 p, vec3 s, float r, float l) {
  const float k = .25;

  float
  d = box(p, s, r),
  res = d,
  f = 1.,
  i = .0;

  for(; i < l; i++) {
    vec3
    a = mod(p * f, 2.) - 1.,
    r = abs(1. - 3. * abs(a));

    f *= 3.;

    float
    da = max(r.x, r.y),
    db = max(r.y, r.z),
    dc = max(r.z, r.x),
    c = (smin(da, smin(db, dc, k), k) - 1.) / f;

    if(c > d) {
      d = c, res = c;
    }
  }

  return res;
}

float rubble(vec3 p, float n) {
  vec3 id = floor(p / n);
  p.xz = rep(p.xz, n);

  return disc(p - vec3(0, -.75, 0) + rnd(id.xz) * 2., vec2(.25, .5), .0);
}

float mat = .0;
float map(vec3 p) {
  vec3 q = p;
  q.yz *= rot(INCLANG);
  q.xz *= rot(INCLANG);

  float
  d = 9e5,
  rbl = rubble(p, 4.),
  spo = mspo(q - vec3(.25, -.125, .25), vec3(1), .05, 3.),
  flr = p.y + (1. + -cos(p.z) * .25) * rnd(vec2(2.23, 8.59));

  d = min(d, rbl + sin((p.x + p.x) * 1.45) * .25);
  d = smin(d, flr, .45);
  d = smin((d + noise(p.xz * .25) * .235) * .5, spo, .025);

  if(d == spo)
    mat = 1.;
  else
    mat = .0;

  return d;
}

vec3 norm(vec3 p) {
  vec2 e = vec2(1e-3, 0);

  return normalize(map(p) - vec3(map(p - e.xyy), map(p - e.yxy), map(p - e.yyx)));
}

float getao(vec3 p, vec3 n, float dist) {
  return clamp(map(p + n * dist) / dist, .0, 1.);
}

float getsss(vec3 p, vec3 rd, float dist, float k) {
  float ddist = dist * k;

  return clamp(map(p + rd * dist) / dist, .0, 1.) +
    clamp(map(p + rd * ddist) / ddist, .0, 1.);
}

float getshadow(vec3 ro, vec3 rd) {
  const float steps = 10., k = 16.;
  float shade = 1.;
  for(float i = 1e-3; i < steps;) {
    float d = map(ro + rd * i);
    if(d < 1e-3) {
      shade = .0;
      break;
    }

    shade = min(shade, k * d / i);

    i += d;
  }

  return shade;
}

void cam(inout vec3 p) {
  if(pointerCount > 0) {
    p.yz *= rot(-clamp(mouse.y, -1., .5) * acos(-1.) + acos(.0));
    p.xz *= rot(-mouse.x * acos(-1.) * 2.);
  } else {
    p.yz *= rot(sin(T) * .5 + .5);
    p.xz *= rot(T * .7);
  }
}

void main(void) {
  vec2 uv = (
    gl_FragCoord.xy - .5 * resolution
  ) / min(resolution.x, resolution.y);

  vec3
  col = vec3(0),
  ro = vec3(0, 0, -exp(sin(T)) - 6.),
  rd = normalize(vec3(uv, 1));

  cam(ro);
  cam(rd);

  vec3
  l = normalize(sunoff),
  p = ro;

  const float steps = 260., maxdist = 20.;
  float i = .0, dd = .0, at = .0;
  for(; i < steps; i++) {
    float d = map(p);
    if(d < 1e-3)
      break;
    if(d > maxdist) {
      dd = maxdist;
      break;
    }

    p += rd * d * .8;
    dd += d;
    at += exp(-length(p - (sunoff * 8.)) * .2);
  }

  vec3
  n = norm(p),
  tint = vec3(1, .95, .9),
  spo = vec3(1, .7, .3),
  cpc = mix(tint, spo, mat);

  float
  fog = 1. - clamp(dd / maxdist, .0, 1.),
  diff = max(.0, dot(l, n)),
  sss = getsss(p, rd, 5., 3.),
  sha = getshadow(p + n * 3e-3, l),
  ao =
    (getao(p, n, 12.) * .5 + .5) *
    (getao(p, n, 1.) * .3 + .7) *
    (getao(p, n, .5));

  col += tint * S(.0, 1., at);
  col += S(.0, 1., cpc * diff * tint * fog * ao) * 2.5;
  col *= S(.0, 1., sha * .5);
  col = mix(col, vec3(sha), pow(S(.0, 1., exp(-sss) * .5), 5.));
  col = 1. - exp(-col * 4.);
  col = pow(col, vec3(1.45));
  fragColor = vec4(col, 1);
}
`
let time
let buffer
let program
let touch
let resolution
let pointerCount
let vertices = []
let touching = false

function resize() {
    const { innerWidth: width, innerHeight: height } = window

    canvas.width = width * dpr
    canvas.height = height * dpr

    gl.viewport(0, 0, width * dpr, height * dpr)
}

function compile(shader, source) {
    gl.shaderSource(shader, source)
    gl.compileShader(shader)

    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        console.error(gl.getShaderInfoLog(shader))
    }
}

function setup() {
    const vs = gl.createShader(gl.VERTEX_SHADER)
    const fs = gl.createShader(gl.FRAGMENT_SHADER)

    program = gl.createProgram()

    compile(vs, vertexSource)
    compile(fs, fragmentSource)

    gl.attachShader(program, vs)
    gl.attachShader(program, fs)
    gl.linkProgram(program)

    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
        console.error(gl.getProgramInfoLog(program))
    }

    vertices = [-1.0, -1.0, 1.0, -1.0, -1.0, 1.0, -1.0, 1.0, 1.0, -1.0, 1.0, 1.0]

    buffer = gl.createBuffer()

    gl.bindBuffer(gl.ARRAY_BUFFER, buffer)
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(vertices), gl.STATIC_DRAW)

    const position = gl.getAttribLocation(program, "position")

    gl.enableVertexAttribArray(position)
    gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0)

    time = gl.getUniformLocation(program, "time")
    touch = gl.getUniformLocation(program, "touch")
    pointerCount = gl.getUniformLocation(program, "pointerCount")
    resolution = gl.getUniformLocation(program, "resolution")
}

function draw(now) {
    gl.clearColor(0, 0, 0, 1)
    gl.clear(gl.COLOR_BUFFER_BIT)

    gl.useProgram(program)
    gl.bindBuffer(gl.ARRAY_BUFFER, null)
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer)

    gl.uniform1f(time, now * 0.001)
    gl.uniform2f(touch, ...getTouches())
    gl.uniform1i(pointerCount, touches.size)
    gl.uniform2f(resolution, canvas.width, canvas.height)
    gl.drawArrays(gl.TRIANGLES, 0, vertices.length * 0.5)
}

function getTouches() {
    if (!touches.size) {
        return [0, 0]
    }

    for (let [id, t] of touches) {
        const result = [dpr * t.clientX, dpr * (innerHeight - t.clientY)]

        return result
    }
}

function loop(now) {
    draw(now)
    requestAnimationFrame(loop)
}

function init() {
    setup()
    resize()
    loop(0)
}

document.body.onload = init
window.onresize = resize
canvas.onpointerdown = e => {
    touching = true
    touches.set(e.pointerId, e)
}
canvas.onpointermove = e => {
    if (!touching) return
    touches.set(e.pointerId, e)
}
canvas.onpointerup = e => {
    touching = false
    touches.clear()
}
canvas.onpointerout = e => {
    touching = false
    touches.clear()
}

(function () {
    [...document.querySelectorAll(".control")].forEach(button => {
        button.addEventListener("click", function() {
            document.querySelector(".active-btn").classList.remove("active-btn");
            this.classList.add("active-btn");
            document.querySelector(".active").classList.remove("active");
            document.getElementById(button.dataset.id).classList.add("active");
        })
    });
    document.querySelector(".theme-btn").addEventListener("click", () => {
        document.body.classList.toggle("light-mode");
    })
})();

