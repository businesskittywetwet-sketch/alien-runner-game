import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { districtAt, DISTRICT_LEN, DISTRICT_ORDER, ENVS, type DistrictId } from './config';
import { mulberry32 } from './util';
import {
  BOX, CYL, SPH, PLANE,
  basic, box, buildingGeo, lam, makeCar, makeGlowTexture, makeMothership, makeRoadTexture, mesh,
  signTexture, SIGNS, windowTexture,
} from './models';

export const CHUNK = 80;

export interface BuildingRec {
  side: number;
  z0: number;
  z1: number;
  h: number;
}

interface Chunk {
  group: THREE.Group;
  fires: THREE.Vector3[];
  smokes: THREE.Vector3[];
  flashers: THREE.MeshBasicMaterial[];
  buildings: BuildingRec[];
  lamps: THREE.Vector3[];
}

function makePavementTexture(): THREE.CanvasTexture {
  const cv = document.createElement('canvas');
  cv.width = cv.height = 128;
  const c = cv.getContext('2d')!;
  c.fillStyle = '#4a4d55';
  c.fillRect(0, 0, 128, 128);
  for (let y = 0; y < 4; y++)
    for (let x = 0; x < 4; x++) {
      const off = (y % 2) * 16;
      const v = 66 + Math.floor(Math.random() * 22);
      c.fillStyle = `rgb(${v},${v + 2},${v + 7})`;
      c.fillRect(x * 32 + off + 2, y * 32 + 2, 28, 28);
      c.fillStyle = 'rgba(0,0,0,0.22)';
      c.fillRect(x * 32 + off + 2, y * 32 + 27, 28, 2);
    }
  for (let i = 0; i < 400; i++) {
    c.fillStyle = Math.random() < 0.5 ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.1)';
    c.fillRect(Math.random() * 128, Math.random() * 128, 2, 2);
  }
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

const PROFILE: Record<DistrictId, { fog: number; dens: number; ground: number }> = {
  downtown: { fog: 0x141a30, dens: 0.0105, ground: 0x15171d },
  residential: { fog: 0x1d1730, dens: 0.0092, ground: 0x14201a },
  industrial: { fog: 0x2a1810, dens: 0.0112, ground: 0x1c1712 },
  highway: { fog: 0x0e1a34, dens: 0.0068, ground: 0x10141c },
};

const CONE4R = new THREE.ConeGeometry(0.7071, 1, 4).rotateY(Math.PI / 4);
const smoothstep = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

export class World {
  scene: THREE.Scene;
  chunks = new Map<number, Chunk>();
  buildings: BuildingRec[] = [];
  fog: THREE.FogExp2;
  bg = new THREE.Color();
  hemi: THREE.HemisphereLight;
  moon: THREE.DirectionalLight;
  streetLights: THREE.PointLight[] = [];
  fogMul = 1;
  fogTarget = 1;
  lookAhead = 2;
  coneGeo: THREE.BufferGeometry;
  road: THREE.Mesh;
  sideL: THREE.Mesh;
  sideR: THREE.Mesh;
  ground: THREE.Mesh;
  groundMat: THREE.MeshLambertMaterial;
  sky = new THREE.Group();
  mother: THREE.Group;
  motherLights: THREE.MeshBasicMaterial[];
  stars: THREE.Points;
  glowTex = makeGlowTexture();
  glowMats = new Map<number, THREE.MeshBasicMaterial>();
  spriteMats = new Map<number, THREE.SpriteMaterial>();
  lampGeo: THREE.BufferGeometry;
  blinkMat = new THREE.MeshBasicMaterial({ color: 0xff2222 });
  storeMat: THREE.MeshBasicMaterial;
  envTint = new THREE.Color(0);
  envAmt = 0;
  lightningEnabled = false;
  lightning = 0;
  lightningT = 5;
  onThunder?: () => void;
  eventI = 0;
  fires: THREE.Vector3[] = [];
  smokes: THREE.Vector3[] = [];
  flashers: THREE.MeshBasicMaterial[] = [];
  seed = 1;
  tmpC = new THREE.Color();

  constructor(scene: THREE.Scene) {
    this.scene = scene;
    this.fog = new THREE.FogExp2(0x141a30, 0.0105);
    scene.fog = this.fog;
    scene.background = this.bg.setHex(0x141a30);
    // ---- cinematic night lighting ----
    this.hemi = new THREE.HemisphereLight(0x6d82c8, 0x241d1a, 1.3);
    scene.add(this.hemi);
    this.moon = new THREE.DirectionalLight(0xb8c9ff, 1.45);
    this.moon.position.set(-24, 52, 30);
    this.moon.castShadow = true;
    this.moon.shadow.mapSize.set(1024, 1024);
    const shadowCam = this.moon.shadow.camera as THREE.OrthographicCamera;
    shadowCam.left = -46;
    shadowCam.right = 46;
    shadowCam.top = 46;
    shadowCam.bottom = -46;
    shadowCam.near = 1;
    shadowCam.far = 170;
    this.moon.shadow.bias = -0.001;
    this.moon.shadow.normalBias = 0.045;
    scene.add(this.moon, this.moon.target);

    // pooled streetlight point lights: real illumination at a bounded cost
    this.streetLights = [];
    for (let i = 0; i < 6; i++) {
      const l = new THREE.PointLight(0xffb46a, 0, 36, 2);
      l.position.set(0, 8, 99999);
      scene.add(l);
      this.streetLights.push(l);
    }

    const roadTex = makeRoadTexture();
    roadTex.repeat.set(1, 460 / 8);
    this.road = new THREE.Mesh(
      new THREE.PlaneGeometry(12, 460),
      new THREE.MeshStandardMaterial({ map: roadTex, color: 0xd7dae0, roughness: 0.42, metalness: 0.28 }),
    );
    this.road.rotation.x = -Math.PI / 2;
    this.road.receiveShadow = true;
    scene.add(this.road);
    const paveTex = makePavementTexture();
    paveTex.repeat.set(1, 150);
    const sideMat = new THREE.MeshStandardMaterial({ map: paveTex, color: 0xcfd2d8, roughness: 0.86, metalness: 0.03 });
    this.sideL = new THREE.Mesh(BOX, sideMat);
    this.sideL.scale.set(3, 0.16, 460);
    this.sideL.receiveShadow = true;
    this.sideR = new THREE.Mesh(BOX, sideMat);
    this.sideR.scale.set(3, 0.16, 460);
    this.sideR.receiveShadow = true;
    scene.add(this.sideL, this.sideR);
    this.groundMat = new THREE.MeshLambertMaterial({ color: 0x15171d });
    this.ground = new THREE.Mesh(new THREE.PlaneGeometry(700, 560), this.groundMat);
    this.ground.rotation.x = -Math.PI / 2;
    this.ground.position.y = -0.05;
    scene.add(this.ground);

    // sky
    const sp = new Float32Array(600 * 3);
    for (let i = 0; i < 600; i++) {
      const a = Math.random() * Math.PI * 2;
      const e = Math.random() * 1.3 + 0.12;
      const r = 420;
      sp[i * 3] = Math.cos(a) * Math.cos(e) * r;
      sp[i * 3 + 1] = Math.sin(e) * r;
      sp[i * 3 + 2] = Math.sin(a) * Math.cos(e) * r;
    }
    const sg = new THREE.BufferGeometry();
    sg.setAttribute('position', new THREE.BufferAttribute(sp, 3));
    this.stars = new THREE.Points(sg, new THREE.PointsMaterial({ color: 0xffffff, size: 1.6, sizeAttenuation: false, fog: false, transparent: true, opacity: 0.8 }));
    this.sky.add(this.stars);
    const moonMesh = mesh(SPH, new THREE.MeshBasicMaterial({ color: 0xdfe8ff, fog: false }), 34, 34, 34, -150, 190, -330);
    this.sky.add(moonMesh);
    const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.glowTex, color: 0x8aa4ff, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, fog: false, opacity: 0.6 }));
    halo.scale.set(190, 190, 1);
    halo.position.copy(moonMesh.position);
    this.sky.add(halo);
    const m = makeMothership();
    this.mother = m.group;
    this.motherLights = m.lights;
    this.sky.add(this.mother);
    scene.add(this.sky);

    // shared lamp-post geometry (pole + arm), right side variant
    const pole = new THREE.CylinderGeometry(0.13, 0.2, 8.2, 8).translate(0, 4.1, 0);
    const arm = new THREE.BoxGeometry(2.6, 0.14, 0.14).translate(-1.3, 8.1, 0);
    const head = new THREE.BoxGeometry(0.9, 0.18, 0.45).translate(-2.5, 8.0, 0);
    this.lampGeo = mergeGeometries([pole, arm, head])!;
    this.coneGeo = new THREE.ConeGeometry(3.4, 8, 16, 1, true).translate(0, -4, 0);

    const sc = document.createElement('canvas');
    sc.width = 256;
    sc.height = 64;
    const c = sc.getContext('2d')!;
    c.fillStyle = '#10131c';
    c.fillRect(0, 0, 256, 64);
    for (let i = 0; i < 4; i++) {
      c.fillStyle = ['#ffd28a', '#9fd8ff', '#ffb0d8', '#b8ffd0'][i];
      c.fillRect(i * 64 + 4, 6, 56, 46);
      c.fillStyle = ['#ff4d6d', '#2f9bff', '#ffa000', '#8e44ff'][i];
      c.fillRect(i * 64 + 4, 0, 56, 9);
    }
    const stex = new THREE.CanvasTexture(sc);
    stex.colorSpace = THREE.SRGBColorSpace;
    this.storeMat = new THREE.MeshBasicMaterial({ map: stex });
  }

  setEnv(id: string) {
    const e = ENVS.find((x) => x.id === id) ?? ENVS[0];
    this.envTint.setHex(e.tint);
    this.envAmt = e.amt;
    this.lightningEnabled = e.lightning;
  }

  private glowMat(color: number) {
    let m = this.glowMats.get(color);
    if (!m) {
      m = new THREE.MeshBasicMaterial({ map: this.glowTex, color, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false });
      this.glowMats.set(color, m);
    }
    return m;
  }
  private spriteMat(color: number) {
    let m = this.spriteMats.get(color);
    if (!m) {
      m = new THREE.SpriteMaterial({ map: this.glowTex, color, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true });
      this.spriteMats.set(color, m);
    }
    return m;
  }

  reset() {
    for (const [i] of this.chunks) this.removeChunk(i);
    this.chunks.clear();
    this.buildings.length = 0;
    this.fires.length = 0;
    this.smokes.length = 0;
    this.flashers.length = 0;
    this.seed = Math.floor(Math.random() * 100000);
  }

  private removeChunk(i: number) {
    const c = this.chunks.get(i);
    if (!c) return;
    this.scene.remove(c.group);
    this.chunks.delete(i);
  }

  /** nearest building top near the road on a side */
  buildingAt(side: number, z: number): BuildingRec | null {
    let best: BuildingRec | null = null;
    let bd = 1e9;
    for (const b of this.buildings) {
      if (b.side !== side) continue;
      const cz = (b.z0 + b.z1) / 2;
      if (z >= b.z1 && z <= b.z0) return b;
      const d = Math.abs(cz - z);
      if (d < bd) {
        bd = d;
        best = b;
      }
    }
    return best;
  }

  update(dt: number, pz: number, camPos: THREE.Vector3, time: number) {
    const dist = -pz;
    const ci = Math.floor(dist / CHUNK);
    for (let i = ci - 1; i <= ci + this.lookAhead; i++) if (!this.chunks.has(i)) this.buildChunk(i);
    for (const [i] of this.chunks) if (i < ci - 2) this.removeChunk(i);
    this.buildings = [];
    this.fires = [];
    this.smokes = [];
    this.flashers = [];
    for (const c of this.chunks.values()) {
      this.buildings.push(...c.buildings);
      this.fires.push(...c.fires);
      this.smokes.push(...c.smokes);
      this.flashers.push(...c.flashers);
    }

    // street base follows player
    const zc = Math.round((pz - 130) / 8) * 8;
    this.road.position.set(0, 0, zc);
    this.sideL.position.set(-7.5, 0.08, zc);
    this.sideR.position.set(7.5, 0.08, zc);
    this.ground.position.z = zc;

    // moon rig follows the player so shadows stay tight and sharp
    this.moon.position.set(-26, 54, pz + 34);
    this.moon.target.position.set(0, 0, pz - 8);

    // assign the pooled street lights to the nearest lamp posts
    const near: THREE.Vector3[] = [];
    for (const c of this.chunks.values()) for (const l of c.lamps) if (Math.abs(l.z - pz) < 62) near.push(l);
    near.sort((a, b) => Math.abs(a.z - pz) - Math.abs(b.z - pz));
    for (let i = 0; i < this.streetLights.length; i++) {
      const l = this.streetLights[i];
      if (i < near.length) {
        l.position.copy(near[i]);
        l.intensity = 260;
      } else l.intensity = 0;
    }

    // atmosphere
    const d = dist / DISTRICT_LEN;
    const idx = Math.floor(d);
    const t = smoothstep(0.88, 1.0, d - idx);
    const a = PROFILE[DISTRICT_ORDER[((idx % 4) + 4) % 4]];
    const b = PROFILE[DISTRICT_ORDER[(((idx + 1) % 4) + 4) % 4]];
    const col = this.tmpC.setHex(a.fog).lerp(new THREE.Color(b.fog), t);
    col.lerp(this.envTint, this.envAmt);
    col.lerp(new THREE.Color(0x4a0c14), this.eventI * 0.55);
    this.lightning = Math.max(0, this.lightning - dt * 2.5);
    if (this.lightningEnabled) {
      this.lightningT -= dt;
      if (this.lightningT <= 0) {
        this.lightningT = 3 + Math.random() * 6;
        this.lightning = 1;
        setTimeout(() => this.onThunder?.(), 250 + Math.random() * 500);
      }
    }
    col.offsetHSL(0, 0, this.lightning * 0.18 * Math.random());
    this.fog.color.copy(col);
    this.bg.copy(col);
    this.fogMul += (this.fogTarget - this.fogMul) * Math.min(1, dt * 2);
    this.fog.density = (a.dens + (b.dens - a.dens) * t) * this.fogMul;
    this.mother.visible = this.fogTarget > 0.9; // the real, fightable mothership replaces the sky prop in flight
    this.groundMat.color.setHex(a.ground).lerp(new THREE.Color(b.ground), t);
    this.hemi.intensity = 1.15 + this.lightning * 0.8;

    // sky follows
    this.sky.position.set(0, 0, camPos.z);
    const ev = this.eventI;
    this.mother.position.set(40 - ev * 40, 105 - ev * 25, -250 + ev * 90);
    this.mother.rotation.y = time * 0.02;
    for (let i = 0; i < this.motherLights.length; i++) {
      const on = (Math.sin(time * 2 + i * 0.7) > -0.3 ? 1 : 0.25) * (0.7 + ev * 0.3);
      this.motherLights[i].color.setHex(i === this.motherLights.length - 1 ? 0xff3366 : i % 3 ? 0x66ffcc : 0xff3366).multiplyScalar(on);
    }

    // flashers & blinkers
    const ph = Math.floor(time * 5) % 2;
    for (const m of this.flashers) {
      /* alternating police lights */
      const idx2 = this.flashers.indexOf(m);
      const on = (idx2 + ph) % 2 === 0;
      m.color.setHex(idx2 % 2 === 0 ? (on ? 0xff2222 : 0x300808) : on ? 0x2a4cff : 0x080c30);
    }
    this.blinkMat.color.setHex(Math.floor(time * 1.5) % 2 ? 0xff2222 : 0x300606);
  }

  /* ------------------------------ chunk build ------------------------------ */
  private buildChunk(i: number) {
    const rnd = mulberry32(i * 7919 + 13 + this.seed);
    const R = (a: number, b: number) => a + rnd() * (b - a);
    const zs = -i * CHUNK;
    const dd = districtAt(i * CHUNK + CHUNK / 2);
    const grp = new THREE.Group();
    const ch: Chunk = { group: grp, fires: [], smokes: [], flashers: [], buildings: [], lamps: [] };

    // ---- streetlights
    const spacing = dd === 'highway' ? 32 : 26;
    const lampColor = dd === 'industrial' ? 0xffa040 : dd === 'residential' ? 0xffd890 : dd === 'highway' ? 0xc0e0ff : 0xffc070;
    for (let k = Math.ceil((i * CHUNK) / spacing); k * spacing < (i + 1) * CHUNK; k++) {
      const z = -k * spacing;
      for (const s of [-1, 1]) {
        if (rnd() < 0.08) continue; // a few dead lights
        const lamp = new THREE.Mesh(this.lampGeo, lam(0x2c3038));
        lamp.position.set(s * 6.6, 0, z);
        lamp.scale.x = s > 0 ? 1 : -1;
        lamp.castShadow = true;
        grp.add(lamp);
        ch.lamps.push(new THREE.Vector3(s * 4.1, 7.9, z));
        const cone = new THREE.Mesh(this.coneGeo, basic(lampColor, { add: true, opacity: 0.05, side: THREE.DoubleSide }));
        cone.position.set(s * 4.1, 7.95, z);
        cone.renderOrder = 2;
        grp.add(cone);
        const pool = new THREE.Mesh(PLANE, this.glowMat(lampColor));
        pool.rotation.x = -Math.PI / 2;
        pool.scale.set(11, 11, 1);
        pool.position.set(s * 4.1, 0.05, z);
        pool.renderOrder = 1;
        grp.add(pool);
        const spr = new THREE.Sprite(this.spriteMat(lampColor));
        spr.scale.set(3.6, 3.6, 1);
        spr.position.set(s * 4.1, 7.9, z);
        grp.add(spr);
      }
    }

    // ---- buildings & district dressing
    for (const s of [-1, 1]) {
      if (dd === 'highway') {
        // guard rails
        grp.add(box(0.25, 0.9, CHUNK, lam(0x7b828e), s * 6.45, 0.45, zs - CHUNK / 2));
        grp.add(box(0.28, 0.12, CHUNK, basic(0xff9a2e), s * 6.45, 0.7, zs - CHUNK / 2));
        // distant skyline
        for (let j = 0; j < 2; j++) {
          const w = R(18, 30), h = Math.round(R(25, 90) / 3.5) * 3.5, dz = CHUNK / 2 - 4;
          const x = s * (38 + R(0, 30));
          const m = new THREE.Mesh(buildingGeo(w, h, dz), this.bMats(dd, Math.floor(R(0, 3))));
          m.position.set(x, h / 2, zs - (j + 0.5) * (CHUNK / 2));
          grp.add(m);
        }
        if (rnd() < 0.35) this.billboard(grp, s * 13, zs - R(10, 70), s, rnd);
        continue;
      }
      const n = dd === 'downtown' ? 5 : dd === 'residential' ? 6 : 3;
      for (let j = 0; j < n; j++) {
        const slot = CHUNK / n;
        const zc = zs - (j + 0.5) * slot;
        const gap = dd === 'residential' ? 2.5 : R(0, 2.5);
        const depth = slot - gap;
        if (dd === 'downtown') {
          const w = R(12, 20), h = Math.round(R(22, 70) / 3.5) * 3.5;
          const m = new THREE.Mesh(buildingGeo(w, h, depth), this.bMats(dd, Math.floor(R(0, 3))));
          m.position.set(s * (9 + w / 2), h / 2, zc);
          grp.add(m);
          ch.buildings.push({ side: s, z0: zc + depth / 2, z1: zc - depth / 2, h });
          // architectural detail: parapet, setback crown, storefront awning
          grp.add(box(w + 0.5, 0.7, depth + 0.5, lam(0x1b2130), m.position.x, h + 0.35, zc));
          if (h > 33) {
            const uw = w * 0.6;
            const uh = Math.max(10.5, Math.round((h * 0.22) / 3.5) * 3.5);
            const up = new THREE.Mesh(buildingGeo(uw, uh, depth * 0.66), this.bMats(dd, Math.floor(R(0, 3))));
            up.position.set(m.position.x, h + uh / 2, zc);
            grp.add(up);
            grp.add(box(uw + 0.4, 0.5, depth * 0.66 + 0.4, lam(0x252c3d), m.position.x, h + uh + 0.25, zc));
          }
          const aw = box(1.0, 0.14, depth * 0.55, lam(0x8a1f4a, 0x20040f, 1), s * 8.6, 3.7, zc);
          aw.rotation.z = s * 0.5;
          grp.add(aw);
          const store = new THREE.Mesh(PLANE, this.storeMat);
          store.scale.set(depth * 0.96, 3.6, 1);
          store.rotation.y = -s * Math.PI / 2;
          store.position.set(s * 8.97, 1.8, zc);
          grp.add(store);
          if (rnd() < 0.7) {
            const [txt, colr] = SIGNS[Math.floor(R(0, SIGNS.length))];
            const sign = new THREE.Mesh(PLANE, new THREE.MeshBasicMaterial({ map: signTexture(txt, colr) }));
            sign.scale.set(4.6, 1.7, 1);
            sign.rotation.y = -s * Math.PI / 2;
            sign.position.set(s * 8.95, R(5, 12), zc + R(-depth / 4, depth / 4));
            grp.add(sign);
            // wet-asphalt reflection of the neon below
            const refl = new THREE.Mesh(PLANE, basic(parseInt(colr.slice(1), 16), { add: true, opacity: 0.11 }));
            refl.rotation.x = -Math.PI / 2;
            refl.scale.set(3.6, 12, 1);
            refl.position.set(s * 3.4, 0.045, sign.position.z);
            refl.renderOrder = 1;
            grp.add(refl);
          }
          if (rnd() < 0.18) {
            const hy = h * R(0.35, 0.7);
            const hole = new THREE.Mesh(PLANE, basic(0x120804));
            hole.scale.set(6, 6, 1);
            hole.rotation.y = -s * Math.PI / 2;
            hole.position.set(s * 8.94, hy, zc);
            const hg = new THREE.Mesh(PLANE, this.glowMat(0xff6a20));
            hg.scale.set(11, 11, 1);
            hg.rotation.y = -s * Math.PI / 2;
            hg.position.set(s * 8.9, hy - 1, zc);
            grp.add(hole, hg);
            ch.fires.push(new THREE.Vector3(s * 8.6, hy - 2, zc));
            ch.smokes.push(new THREE.Vector3(s * 8.6, hy + 1, zc));
          }
          if (rnd() < 0.5) {
            const b = mesh(SPH, this.blinkMat, 0.7, 0.7, 0.7, s * (9 + w / 2), h + 0.5, zc);
            grp.add(b);
          }
        } else if (dd === 'residential') {
          const w = R(9, 13), h = R(7, 12);
          const setback = R(1, 4);
          const m = new THREE.Mesh(buildingGeo(w, Math.round(h), depth), this.bMats(dd, Math.floor(R(0, 3))));
          const cx = s * (9 + setback + w / 2);
          m.position.set(cx, Math.round(h) / 2, zc);
          grp.add(m);
          ch.buildings.push({ side: s, z0: zc + depth / 2, z1: zc - depth / 2, h: Math.round(h) });
          const roof = mesh(CONE4R, lam(rnd() < 0.5 ? 0x4a2a2a : 0x2a3a4a), w * 1.12, 3.4, depth * 1.12, cx, Math.round(h) + 1.7, zc);
          grp.add(roof);
          grp.add(box(0.1, 0.8, depth, lam(0x6b6458), s * 8.7, 0.4, zc)); // fence
          const porch = new THREE.Sprite(this.spriteMat(0xffd080));
          porch.scale.set(3, 3, 1);
          porch.position.set(s * (9 + setback - 0.2), 2.3, zc);
          grp.add(porch);
          if (rnd() < 0.6) {
            const tz = zc + R(-depth / 3, depth / 3);
            grp.add(mesh(CYL, lam(0x4a3524), 0.45, 3, 0.45, s * 7.7, 1.5, tz));
            grp.add(mesh(SPH, lam(0x1d4a2a), 3.6, 3.4, 3.6, s * 7.7, 4.4, tz));
          }
        } else {
          const w = R(16, 26), h = R(8, 13);
          const m = new THREE.Mesh(buildingGeo(w, Math.round(h), depth), this.bMats(dd, Math.floor(R(0, 3))));
          m.position.set(s * (11 + w / 2), Math.round(h) / 2, zc);
          grp.add(m);
          ch.buildings.push({ side: s, z0: zc + depth / 2, z1: zc - depth / 2, h: Math.round(h) });
          const cols = [0xc0392b, 0x2e86c1, 0xd4ac0d, 0x229954];
          if (rnd() < 0.7) for (let q = 0; q < 3; q++) grp.add(box(2.4, 2.5, 6, lam(cols[Math.floor(R(0, 4))]), s * (8.2 + (q % 2) * 0.1), 1.25 + (q > 1 ? 2.5 : 0), zc + (q % 2 ? 6 : -4) * R(0.5, 1)));
          if (rnd() < 0.55) {
            const sx = s * R(20, 28);
            grp.add(mesh(CYL, lam(0x8a8f99), 2.4, 38, 2.4, sx, 19, zc));
            grp.add(mesh(CYL, lam(0xc0392b), 2.5, 4, 2.5, sx, 36, zc));
            ch.smokes.push(new THREE.Vector3(sx, 39, zc));
          } else if (rnd() < 0.6) {
            grp.add(mesh(CYL, lam(0x6a7078), 9, 9, 9, s * R(20, 28), 4.5, zc));
          }
          if (rnd() < 0.2) {
            ch.fires.push(new THREE.Vector3(s * 9.5, 0.4, zc));
            const fs = new THREE.Sprite(this.spriteMat(0xff6a20));
            fs.scale.set(5, 5, 1);
            fs.position.set(s * 9.5, 1.2, zc);
            grp.add(fs);
          }
        }
      }
      // sidewalk dressing
      if (rnd() < 0.7) {
        const z = zs - R(6, CHUNK - 6);
        const kind = rnd();
        const colors = [0x8e1f1f, 0x1f4d8e, 0x7a7a7a, 0x2a6a3a, 0xd0d0c8, 0x8a6a1a];
        if (kind < 0.3) {
          const { group, flashers } = makeCar(0, 'police');
          group.position.set(s * 7.6, 0, z);
          group.rotation.y = R(-0.4, 0.4);
          grp.add(group);
          ch.flashers.push(...flashers);
        } else if (kind < 0.55) {
          const { group } = makeCar(0, 'burnt');
          group.position.set(s * 7.6, 0, z);
          group.rotation.y = R(-0.3, 0.3);
          grp.add(group);
          ch.fires.push(new THREE.Vector3(s * 7.6, 1.3, z));
          ch.smokes.push(new THREE.Vector3(s * 7.6, 1.8, z));
          const spr = new THREE.Sprite(this.spriteMat(0xff7a2a));
          spr.scale.set(6, 6, 1);
          spr.position.set(s * 7.6, 1.8, z);
          grp.add(spr);
        } else {
          const { group } = makeCar(colors[Math.floor(R(0, colors.length))]);
          group.position.set(s * 7.6, 0, z);
          group.rotation.y = R(-0.2, 0.2);
          grp.add(group);
        }
      }
      if (rnd() < 0.5) grp.add(box(1.2, 1.1, 2.4, lam(0x2f5d3a), s * 7.9, 0.55, zs - R(5, CHUNK - 5))); // dumpster
    }

    // overpass on highway / industrial occasionally
    if ((dd === 'highway' && rnd() < 0.3) || (dd === 'industrial' && rnd() < 0.15)) {
      const z = zs - R(15, 65);
      grp.add(box(40, 1.4, 7, lam(0x3a3e48), 0, 12.5, z));
      grp.add(box(40, 0.6, 0.3, basic(0xffa040), 0, 13.5, z + 3.3));
      for (const s of [-1, 1]) grp.add(box(2, 12, 6, lam(0x30343c), s * 12, 6, z));
    }

    grp.traverse((o) => {
      o.updateMatrix();
      o.matrixAutoUpdate = false;
      const mm = o as THREE.Mesh;
      if (mm.isMesh) {
        const mtl = mm.material as THREE.Material;
        if (mtl && !mtl.transparent) {
          mm.castShadow = true;
          mm.receiveShadow = true;
        }
      }
    });
    this.scene.add(grp);
    this.chunks.set(i, ch);
  }

  private billboard(grp: THREE.Group, x: number, z: number, side: number, rnd: () => number) {
    const [txt, colr] = SIGNS[Math.floor(rnd() * SIGNS.length)];
    grp.add(box(0.5, 12, 0.5, lam(0x2c3038), x, 6, z));
    const p = new THREE.Mesh(PLANE, new THREE.MeshBasicMaterial({ map: signTexture(txt, colr), side: THREE.DoubleSide }));
    p.scale.set(14, 5.2, 1);
    p.rotation.y = -side * 0.35 + Math.PI / 2 * 0;
    p.position.set(x, 13, z);
    grp.add(p);
  }

  private bMats(dd: DistrictId, idx: number): THREE.Material[] {
    const key = `${dd}${idx}`;
    let m = this.matCache.get(key);
    if (!m) {
      const tex = windowTexture(dd, idx);
      const side = new THREE.MeshStandardMaterial({
        map: tex,
        roughness: 0.92,
        metalness: 0.05,
        emissive: 0xffffff,
        emissiveMap: tex,
        emissiveIntensity: 0.68,
      });
      const roof = new THREE.MeshStandardMaterial({ color: 0x0e1118, roughness: 1, metalness: 0 });
      m = [side, side, roof, roof, side, side];
      this.matCache.set(key, m);
    }
    return m;
  }
  private matCache = new Map<string, THREE.Material[]>();
}

