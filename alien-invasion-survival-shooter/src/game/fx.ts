import * as THREE from 'three';
import { makeGlowTexture } from './models';
import type { V3 } from './util';

/** Single draw-call GPU point-sprite particle pool. */
let smokeTex: THREE.CanvasTexture | null = null;
function makeSmokeTexture(): THREE.CanvasTexture {
  const cv = document.createElement('canvas');
  cv.width = cv.height = 128;
  const c = cv.getContext('2d')!;
  c.clearRect(0, 0, 128, 128);
  for (let i = 0; i < 26; i++) {
    const x = 64 + (Math.random() - 0.5) * 64;
    const y = 64 + (Math.random() - 0.5) * 64;
    const r = 14 + Math.random() * 30;
    const g = c.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, 'rgba(255,255,255,0.16)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    c.fillStyle = g;
    c.beginPath();
    c.arc(x, y, r, 0, Math.PI * 2);
    c.fill();
  }
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export class Particles {
  points: THREE.Points;
  max: number;
  pos: Float32Array;
  col: Float32Array;
  size: Float32Array;
  vel: Float32Array;
  life: Float32Array;
  maxLife: Float32Array;
  grow: Float32Array;
  grav: Float32Array;
  base: Float32Array;
  cursor = 0;
  uniforms = { uScale: { value: 600 } };

  constructor(scene: THREE.Scene, max: number, additive: boolean, tex: THREE.Texture) {
    this.max = max;
    this.pos = new Float32Array(max * 3);
    this.col = new Float32Array(max * 4);
    this.size = new Float32Array(max);
    this.vel = new Float32Array(max * 3);
    this.life = new Float32Array(max);
    this.maxLife = new Float32Array(max);
    this.grow = new Float32Array(max);
    this.grav = new Float32Array(max);
    this.base = new Float32Array(max);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('color', new THREE.BufferAttribute(this.col, 4).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('size', new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage));
    const mat = new THREE.ShaderMaterial({
      uniforms: { ...this.uniforms, uMap: { value: tex } },
      vertexShader: `attribute float size; attribute vec4 color; varying vec4 vColor; uniform float uScale;
        void main(){ vColor=color; vec4 mv=modelViewMatrix*vec4(position,1.0); gl_PointSize=size*uScale/max(0.1,-mv.z); gl_Position=projectionMatrix*mv; }`,
      fragmentShader: `uniform sampler2D uMap; varying vec4 vColor;
        void main(){ float a=texture2D(uMap, gl_PointCoord).a; if(a<0.01) discard; gl_FragColor=vec4(vColor.rgb, vColor.a*a); }`,
      transparent: true,
      depthWrite: false,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    });
    this.points = new THREE.Points(geo, mat);
    this.points.frustumCulled = false;
    this.points.renderOrder = 5;
    scene.add(this.points);
  }

  emit(
    x: number, y: number, z: number, vx: number, vy: number, vz: number,
    r: number, g: number, b: number, size: number, life: number, grow = 0, grav = 0, alpha = 1,
  ) {
    const i = this.cursor;
    this.cursor = (this.cursor + 1) % this.max;
    this.pos[i * 3] = x; this.pos[i * 3 + 1] = y; this.pos[i * 3 + 2] = z;
    this.vel[i * 3] = vx; this.vel[i * 3 + 1] = vy; this.vel[i * 3 + 2] = vz;
    this.col[i * 4] = r; this.col[i * 4 + 1] = g; this.col[i * 4 + 2] = b; this.col[i * 4 + 3] = alpha;
    this.base[i] = alpha;
    this.size[i] = size;
    this.life[i] = life;
    this.maxLife[i] = life;
    this.grow[i] = grow;
    this.grav[i] = grav;
  }

  update(dt: number) {
    for (let i = 0; i < this.max; i++) {
      if (this.life[i] <= 0) {
        this.size[i] = 0;
        continue;
      }
      this.life[i] -= dt;
      const k = i * 3;
      this.vel[k + 1] -= this.grav[i] * dt;
      this.pos[k] += this.vel[k] * dt;
      this.pos[k + 1] += this.vel[k + 1] * dt;
      this.pos[k + 2] += this.vel[k + 2] * dt;
      this.size[i] += this.grow[i] * dt;
      const t = Math.max(0, this.life[i] / this.maxLife[i]);
      this.col[i * 4 + 3] = this.base[i] * t;
      if (this.life[i] <= 0) this.size[i] = 0;
    }
    (this.points.geometry.attributes.position as THREE.BufferAttribute).needsUpdate = true;
    (this.points.geometry.attributes.color as THREE.BufferAttribute).needsUpdate = true;
    (this.points.geometry.attributes.size as THREE.BufferAttribute).needsUpdate = true;
  }
}

const col = new THREE.Color();

export class FX {
  glow: Particles;
  smoke: Particles;
  light: THREE.PointLight;
  lightI = 0;
  constructor(scene: THREE.Scene) {
    if (!smokeTex) smokeTex = makeSmokeTexture();
    this.smoke = new Particles(scene, 620, false, smokeTex);
    this.glow = new Particles(scene, 900, true, makeGlowTexture());
    this.light = new THREE.PointLight(0xffaa55, 0, 40, 2);
    scene.add(this.light);
  }
  setScale(s: number) {
    this.glow.uniforms.uScale.value = s;
    this.smoke.uniforms.uScale.value = s;
  }
  update(dt: number) {
    this.glow.update(dt);
    this.smoke.update(dt);
    this.lightI = Math.max(0, this.lightI - dt * 18);
    this.light.intensity = this.lightI;
  }
  flash(p: V3, color: number, intensity: number) {
    this.light.position.set(p.x, p.y + 1, p.z);
    this.light.color.setHex(color);
    this.lightI = Math.max(this.lightI, intensity);
  }
  sparks(p: V3, color: number, n = 8, speed = 6, size = 0.18) {
    col.setHex(color);
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const e = Math.random() * 2 - 0.4;
      const s = speed * (0.4 + Math.random());
      this.glow.emit(p.x, p.y, p.z, Math.cos(a) * s, e * s * 0.7 + 1, Math.sin(a) * s, col.r, col.g, col.b, size, 0.3 + Math.random() * 0.3, -0.2, 14);
    }
  }
  explosion(p: V3, scale = 1, color = 0xff8a30) {
    col.setHex(color);
    const n = Math.floor(26 * scale);
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const e = Math.random() * 2 - 0.6;
      const s = (3 + Math.random() * 9) * scale;
      this.glow.emit(p.x, p.y, p.z, Math.cos(a) * s, e * s * 0.6 + 2, Math.sin(a) * s, col.r, col.g * (0.6 + Math.random() * 0.6), col.b, (0.5 + Math.random() * 0.8) * scale, 0.4 + Math.random() * 0.5, 0.8 * scale, 5);
    }
    for (let i = 0; i < n * 0.6; i++) {
      const a = Math.random() * Math.PI * 2;
      const s = (1 + Math.random() * 4) * scale;
      this.smoke.emit(p.x, p.y + 0.5, p.z, Math.cos(a) * s, 1 + Math.random() * 3, Math.sin(a) * s, 0.12, 0.12, 0.14, (1 + Math.random()) * scale, 1.4 + Math.random(), 2 * scale, -1, 0.7);
    }
    this.glow.emit(p.x, p.y + 0.4, p.z, 0, 0, 0, 1, 0.85, 0.5, 5 * scale, 0.25, 8 * scale, 0, 0.9);
    this.flash(p, 0xff9a40, 40 * Math.min(2, scale));
  }
  muzzle(p: V3, color: number, size = 0.7) {
    col.setHex(color);
    this.glow.emit(p.x, p.y, p.z, 0, 0, 0, col.r, col.g, col.b, size, 0.06, 0, 0, 1);
    this.glow.emit(p.x, p.y, p.z, 0, 0, 0, 1, 1, 1, size * 0.5, 0.05, 0, 0, 1);
  }
  smokePuff(p: V3, size = 1, a = 0.5) {
    this.smoke.emit(p.x + (Math.random() - 0.5) * 0.4, p.y, p.z + (Math.random() - 0.5) * 0.4, (Math.random() - 0.5) * 0.6, 1.5 + Math.random(), (Math.random() - 0.5) * 0.6, 0.1, 0.1, 0.12, size, 2 + Math.random(), size * 0.8, 0, a);
  }
  flame(p: V3, size = 1) {
    this.glow.emit(p.x + (Math.random() - 0.5) * 0.8 * size, p.y, p.z + (Math.random() - 0.5) * 0.8 * size, (Math.random() - 0.5) * 0.5, 2 + Math.random() * 1.5, (Math.random() - 0.5) * 0.5, 1, 0.45 + Math.random() * 0.3, 0.1, 0.9 * size, 0.55, -0.6 * size, 0, 0.8);
  }
  dust(p: V3, n = 4) {
    for (let i = 0; i < n; i++)
      this.smoke.emit(p.x + (Math.random() - 0.5), p.y + 0.1, p.z + (Math.random() - 0.5), (Math.random() - 0.5) * 3, 0.6, (Math.random() - 0.5) * 3, 0.3, 0.3, 0.32, 0.5, 0.6, 1, 0, 0.35);
  }
  trail(p: V3, color: number, size = 0.4) {
    col.setHex(color);
    this.glow.emit(p.x, p.y, p.z, 0, 0, 0, col.r, col.g, col.b, size, 0.25, -size, 0, 0.9);
  }
  ring(p: V3, color: number, size = 3) {
    col.setHex(color);
    this.glow.emit(p.x, p.y, p.z, 0, 0, 0, col.r, col.g, col.b, size, 0.35, size * 6, 0, 0.6);
  }
}
