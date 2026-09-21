/* NeuralShader — telón de fondo del hero de la landing.

   Puerto literal del shader que generó Stitch (pantalla «Shader», ANIMATION_3):
   ruido simplex encadenado en tres octavas que dibuja líneas de flujo vascular,
   latiendo a ritmo cardiaco sobre obsidiana, con acentos cian y carmesí.

   Es WebGL a pelo, sin librería: el fragment shader va tal cual salió de Stitch.
   Lo que se añade alrededor es el ciclo de vida que un componente de React
   necesita y una página suelta no: cancelar el frame, soltar el contexto y no
   gastar GPU cuando la pestaña está oculta o el usuario pidió menos movimiento. */

import { useEffect, useRef } from "react";

const VERT = `attribute vec2 a_position;
varying vec2 v_texCoord;
void main() {
  v_texCoord = a_position * 0.5 + 0.5;
  gl_Position = vec4(a_position, 0.0, 1.0);
}`;

const FRAG = `precision highp float;
uniform float u_time;
uniform vec2 u_resolution;
uniform vec2 u_mouse;

// Simplex-like noise helper
vec3 mod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec2 mod289(vec2 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec3 permute(vec3 x) { return mod289(((x*34.0)+1.0)*x); }

float snoise(vec2 v) {
  const vec4 C = vec4(0.211324865405187,  // (3.0-sqrt(3.0))/6.0
                      0.366025403784439,  // 0.5*(sqrt(3.0)-1.0)
                     -0.577350269189626,  // -1.0 + 2.0 * C.x
                      0.024390243902439); // 1.0 / 41.0
  vec2 i  = floor(v + dot(v, C.yy) );
  vec2 x0 = v -   i + dot(i, C.xx);
  vec2 i1;
  i1 = (x0.x > x0.y) ? vec2(1.0, 0.0) : vec2(0.0, 1.0);
  vec4 x12 = x0.xyxy + C.xxzz;
  x12.xy -= i1;
  i = mod289(i);
  vec3 p = permute( permute( i.y + vec3(0.0, i1.y, 1.0 ))
        + i.x + vec3(0.0, i1.x, 1.0 ));
  vec3 m = max(0.5 - vec3(dot(x0,x0), dot(x12.xy,x12.xy), dot(x12.zw,x12.zw)), 0.0);
  m = m*m ;
  m = m*m ;
  vec3 x = 2.0 * fract(p * C.www) - 1.0;
  vec3 h = abs(x) - 0.5;
  vec3 ox = floor(x + 0.5);
  vec3 a0 = x - ox;
  m *= 1.79284291400159 - 0.85373472095314 * ( a0*a0 + h*h );
  vec3 g;
  g.x  = a0.x  * x0.x  + h.x  * x0.y;
  g.yz = a0.yz * x12.xz + h.yz * x12.yw;
  return 130.0 * dot(m, g);
}

void main() {
    vec2 p = (gl_FragCoord.xy * 2.0 - u_resolution) / min(u_resolution.x, u_resolution.y);

    float t = u_time * 0.25;

    // Neural vascular flow simulation
    float n1 = snoise(p * 1.5 + vec2(t * 0.3, t * 0.1));
    float n2 = snoise(p * 3.0 - vec2(t * 0.2, n1 * 0.8));
    float n3 = snoise(p * 6.0 + vec2(n2 * 0.5, t * 0.4));

    float pulse = sin(u_time * 1.8) * 0.5 + 0.5; // Heartbeat / arterial pulsation

    // Vascular stream lines
    float lines = sin(p.x * 2.5 + n1 * 2.0 + t) * cos(p.y * 2.0 + n2 * 2.0 + t * 0.7);
    float glow = smoothstep(0.7, 0.98, abs(lines));

    // Deep dark obsidian base with bioluminescent cyan & neural crimson accents
    vec3 bg = vec3(0.02, 0.035, 0.06); // Deep midnight navy
    vec3 cyanGlow = vec3(0.0, 0.88, 1.0) * glow * (0.35 + 0.25 * pulse);
    vec3 deepBlue = vec3(0.05, 0.2, 0.45) * smoothstep(-0.5, 0.8, n2);
    vec3 crimsonHint = vec3(1.0, 0.15, 0.38) * smoothstep(0.82, 0.98, n3) * (0.6 + 0.4 * pulse);

    vec3 finalColor = bg + deepBlue * 0.4 + cyanGlow + crimsonHint * 0.35;

    // Vignette
    float vig = smoothstep(1.6, 0.2, length(p));
    finalColor *= vig;

    gl_FragColor = vec4(finalColor, 1.0);
}`;

export function NeuralShader({ className, style }: { className?: string; style?: React.CSSProperties }) {
  const hostRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    /* El <canvas> se crea aquí, no en el JSX, y se tira en la limpieza.
       `getContext` devuelve SIEMPRE el mismo contexto para un canvas dado, así
       que reutilizar el elemento entre montajes hace que el `loseContext()` del
       primer desmontaje deje ciego al segundo — con StrictMode, que monta dos
       veces en desarrollo, el fondo se quedaba en gris. Un canvas nuevo por
       montaje da un contexto nuevo y mantiene la liberación explícita. */
    const canvas = document.createElement("canvas");
    canvas.setAttribute("aria-hidden", "true");
    canvas.style.cssText = "display:block;width:100%;height:100%";
    host.appendChild(canvas);

    /* Sin `instanceof WebGLRenderingContext`: ese constructor global no existe
       en entornos sin canvas —jsdom, donde corren las pruebas— y comprobarlo
       reventaba con ReferenceError antes de poder descartar el contexto. Se mira
       el objeto en sí, que además cubre el caso de un navegador que se niegue a
       dar más contextos. */
    let gl: WebGLRenderingContext | null = null;
    try {
      gl = (canvas.getContext("webgl") ?? canvas.getContext("experimental-webgl")) as WebGLRenderingContext | null;
    } catch {
      gl = null;
    }
    if (!gl || typeof gl.createShader !== "function") { canvas.remove(); return; }

    const compile = (type: number, src: string) => {
      const s = gl.createShader(type)!;
      gl.shaderSource(s, src);
      gl.compileShader(s);
      return s;
    };
    const vert = compile(gl.VERTEX_SHADER, VERT);
    const frag = compile(gl.FRAGMENT_SHADER, FRAG);
    const prog = gl.createProgram()!;
    gl.attachShader(prog, vert);
    gl.attachShader(prog, frag);
    gl.linkProgram(prog);
    gl.useProgram(prog);

    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    const posLoc = gl.getAttribLocation(prog, "a_position");
    gl.enableVertexAttribArray(posLoc);
    gl.vertexAttribPointer(posLoc, 2, gl.FLOAT, false, 0, 0);

    const uTime = gl.getUniformLocation(prog, "u_time");
    const uRes = gl.getUniformLocation(prog, "u_resolution");
    const uMouse = gl.getUniformLocation(prog, "u_mouse");

    /* El backbuffer sigue al tamaño que le da el layout. Se limita a 1x aunque
       la pantalla sea Retina: es un fondo difuso a pantalla completa y duplicar
       la resolución cuadruplica el coste sin que se note la diferencia. */
    const syncSize = () => {
      const w = canvas.clientWidth || 1280;
      const h = canvas.clientHeight || 720;
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w;
        canvas.height = h;
      }
    };
    syncSize();
    const ro = new ResizeObserver(syncSize);
    ro.observe(canvas);

    // u_mouse en píxeles, como u_resolution (convención de ShaderToy).
    const mouse = { x: canvas.width / 2, y: canvas.height / 2 };
    const onMouseMove = (event: MouseEvent) => {
      const rect = canvas.getBoundingClientRect();
      if (rect.width && rect.height) {
        mouse.x = ((event.clientX - rect.left) / rect.width) * canvas.width;
        mouse.y = (1 - (event.clientY - rect.top) / rect.height) * canvas.height;
      }
    };
    window.addEventListener("mousemove", onMouseMove, { passive: true });

    const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let raf = 0;
    const draw = (ms: number) => {
      gl.viewport(0, 0, canvas.width, canvas.height);
      if (uTime) gl.uniform1f(uTime, ms * 0.001);
      if (uRes) gl.uniform2f(uRes, canvas.width, canvas.height);
      if (uMouse) gl.uniform2f(uMouse, mouse.x, mouse.y);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    };

    const loop = (ms: number) => {
      draw(ms);
      raf = requestAnimationFrame(loop);
    };

    /* Con la pestaña oculta el navegador ya frena rAF, pero al volver conviene
       reanudar explícitamente; y si el usuario pidió menos movimiento se pinta
       un único fotograma y ahí se queda. */
    const start = () => {
      if (still) { draw(0); return; }
      if (!raf) raf = requestAnimationFrame(loop);
    };
    const stop = () => {
      if (raf) { cancelAnimationFrame(raf); raf = 0; }
    };
    const onVisibility = () => (document.hidden ? stop() : start());
    document.addEventListener("visibilitychange", onVisibility);
    start();

    return () => {
      stop();
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("mousemove", onMouseMove);
      ro.disconnect();
      gl.deleteBuffer(buf);
      gl.deleteProgram(prog);
      gl.deleteShader(vert);
      gl.deleteShader(frag);
      // Suelta el contexto: los navegadores permiten pocos WebGL vivos a la vez
      // y la landing comparte página con el visor 3D de la aplicación.
      gl.getExtension("WEBGL_lose_context")?.loseContext();
      canvas.remove();
    };
  }, []);

  return <div ref={hostRef} aria-hidden="true" className={className} style={style} />;
}
