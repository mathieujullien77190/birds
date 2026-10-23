import type { Mat3 } from './homography';

export interface FlatParams {
  /** Homographie sortie → image corrigée (identité pour l'image entière). */
  h: Mat3;
  k1: number;
  /** Largeur / hauteur de l'image de la caméra. */
  aspect: number;
}

export interface FlatRenderer {
  draw: (video: HTMLVideoElement, p: FlatParams) => void;
  dispose: () => void;
}

const VERT = 'attribute vec2 aPos; varying vec2 vUv; void main() { vUv = vec2((aPos.x + 1.0) * 0.5, (1.0 - aPos.y) * 0.5); gl_Position = vec4(aPos, 0.0, 1.0); }';
const FRAG = `precision mediump float;
uniform sampler2D uTex; uniform mat3 uH; uniform float uK; uniform float uAspect; varying vec2 vUv;
void main() {
  vec3 q = uH * vec3(vUv, 1.0);
  vec2 p = q.xy / q.z;
  vec2 c = (p - 0.5) * vec2(uAspect, 1.0);
  c *= 1.0 + uK * dot(c, c);
  vec2 s = c / vec2(uAspect, 1.0) + 0.5;
  if (s.x < 0.0 || s.x > 1.0 || s.y < 0.0 || s.y > 1.0) { gl_FragColor = vec4(0.0, 0.0, 0.0, 1.0); return; }
  gl_FragColor = texture2D(uTex, vec2(s.x, 1.0 - s.y));
}`;

/** Dessine l'image de la caméra dans un canvas WebGL en corrigeant la distorsion de l'objectif puis la perspective (vue de dessus). `null` si WebGL n'est pas disponible. */
export function createFlatRenderer(canvas: HTMLCanvasElement): FlatRenderer | null {
  const gl = canvas.getContext('webgl');
  if (!gl) return null;
  const shader = (type: number, src: string) => { const s = gl.createShader(type); if (!s) return null; gl.shaderSource(s, src); gl.compileShader(s); return gl.getShaderParameter(s, gl.COMPILE_STATUS) ? s : null; };
  const vs = shader(gl.VERTEX_SHADER, VERT), fs = shader(gl.FRAGMENT_SHADER, FRAG), prog = gl.createProgram();
  if (!vs || !fs || !prog) return null;
  gl.attachShader(prog, vs); gl.attachShader(prog, fs); gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) return null;
  gl.useProgram(prog);
  const buf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
  const pos = gl.getAttribLocation(prog, 'aPos');
  gl.enableVertexAttribArray(pos);
  gl.vertexAttribPointer(pos, 2, gl.FLOAT, false, 0, 0);
  const tex = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, tex);
  for (const [k, v] of [[gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE], [gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE], [gl.TEXTURE_MIN_FILTER, gl.LINEAR], [gl.TEXTURE_MAG_FILTER, gl.LINEAR]] as const) gl.texParameteri(gl.TEXTURE_2D, k, v);
  const uH = gl.getUniformLocation(prog, 'uH'), uK = gl.getUniformLocation(prog, 'uK'), uAspect = gl.getUniformLocation(prog, 'uAspect');
  return {
    draw(video, p) {
      if (video.readyState < 2 || !video.videoWidth) return;
      gl.viewport(0, 0, canvas.width, canvas.height);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, video);
      const m = p.h; // WebGL attend les colonnes d'abord
      gl.uniformMatrix3fv(uH, false, [m[0], m[3], m[6], m[1], m[4], m[7], m[2], m[5], m[8]]);
      gl.uniform1f(uK, p.k1);
      gl.uniform1f(uAspect, p.aspect);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    },
    dispose() { gl.deleteTexture(tex); gl.deleteBuffer(buf); gl.deleteProgram(prog); gl.deleteShader(vs); gl.deleteShader(fs); },
  };
}
