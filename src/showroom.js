import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
const GOLD = 0xc9a84c, PAL = [0x1b1b1b, 0xe9e4d8, 0x5a1f2b, 0x20374a, 0x3d4a2f, 0xb9975b, 0x6b5b4b, 0x8a8a8a];
const SEC = { men: { t: "MEN'S", p: [-5, 3], ax: 'z', len: 12, ry: Math.PI / 2 }, women: { t: "WOMEN'S", p: [5, 3], ax: 'z', len: 12, ry: -Math.PI / 2 }, sale: { t: 'SALE', p: [-2, -3], ax: 'x', len: 4, ry: 0 } };
const rnd = (a, b) => a + Math.random() * (b - a);
function tex(w, h, draw, rx = 1, ry = 1) { const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(rx, ry); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t; }
const M = (c, rough = .8, metal = 0, o = {}) => new THREE.MeshStandardMaterial({ color: c, roughness: rough, metalness: metal, ...o });
const glow = (c, i = 2) => new THREE.MeshStandardMaterial({ color: 0x111111, emissive: c, emissiveIntensity: i });
function label(text, w, fs = 40) { const h = w * .19;
  const t = tex(512, Math.round(512 * .19), (x, W, H) => { x.fillStyle = '#0b0b0b'; x.fillRect(0, 0, W, H); x.strokeStyle = '#c9a84c'; x.lineWidth = 3; x.strokeRect(6, 6, W - 12, H - 12);
    x.fillStyle = '#e8d9a8'; x.font = fs + 'px Georgia'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText(text, W / 2, H / 2 + 2); });
  return new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: t, side: THREE.DoubleSide })); }
export function createShowroom(canvas, products, onPick, opts = {}) {
  const low = (navigator.hardwareConcurrency || 4) <= 4;
  const r = new THREE.WebGLRenderer({ canvas, antialias: !low, powerPreference: 'high-performance' });
  r.setPixelRatio(low ? 1 : Math.min(devicePixelRatio, 1.75)); r.toneMapping = THREE.ACESFilmicToneMapping; r.toneMappingExposure = 1.05;
  r.shadowMap.enabled = !low; r.shadowMap.type = THREE.PCFShadowMap;
  const scene = new THREE.Scene(); scene.background = new THREE.Color(0x0a0a0c); scene.fog = new THREE.Fog(0x0a0a0c, 18, 48);
  const pm = new THREE.PMREMGenerator(r); scene.environment = pm.fromScene(new RoomEnvironment(), .04).texture; scene.environmentIntensity = .35; pm.dispose();
  const cam = new THREE.PerspectiveCamera(65, 1, .1, 80); cam.rotation.order = 'YXZ';
  scene.add(new THREE.HemisphereLight(0xfff3e0, 0x1a1a1a, .45));
  for (const z of [7, -1, -9]) { const l = new THREE.PointLight(0xffd9a0, 16, 15); l.position.set(0, 3.6, z); scene.add(l); }
  const sp = new THREE.SpotLight(0xffe2b0, 80, 22, Math.PI / 3, .7, 1.2); sp.position.set(0, 3.9, 3); sp.target.position.set(0, 0, -3); sp.castShadow = !low; sp.shadow.mapSize.set(512, 512); scene.add(sp, sp.target);
  const out = new THREE.PointLight(0xffd9a0, 40, 20); out.position.set(0, 3, 17); scene.add(out);
  const put = (g, m, x, y, z, ry = 0) => { const o = new THREE.Mesh(g, m); o.position.set(x, y, z); o.rotation.y = ry; o.castShadow = o.receiveShadow = true; scene.add(o); return o; };
  const B = (w, h, d) => new THREE.BoxGeometry(w, h, d), obstacles = [];
  const block = (x0, x1, z0, z1) => obstacles.push([x0, x1, z0, z1]);
  // textures
  const marble = tex(512, 512, (x, W, H) => { x.fillStyle = '#1d1c1b'; x.fillRect(0, 0, W, H); x.lineCap = 'round';
    for (let i = 0; i < 40; i++) { x.strokeStyle = `rgba(255,245,225,${rnd(.03, .09)})`; x.lineWidth = rnd(.5, 2); x.beginPath(); const a = rnd(0, W), b = rnd(0, H); x.moveTo(a, b); x.bezierCurveTo(a + rnd(-150, 150), b + rnd(-150, 150), a + rnd(-150, 150), b + rnd(-150, 150), a + rnd(-200, 200), b + rnd(-200, 200)); x.stroke(); }
    x.strokeStyle = '#0a0a0a'; x.lineWidth = 4; x.strokeRect(0, 0, W, H); }, 7, 13);
  const plaster = tex(256, 256, (x, W, H) => { x.fillStyle = '#d8d2c5'; x.fillRect(0, 0, W, H); for (let i = 0; i < 3000; i++) { x.fillStyle = `rgba(${Math.random() < .5 ? '0,0,0' : '255,255,255'},.03)`; x.fillRect(rnd(0, W), rnd(0, H), 2, 2); } }, 6, 1);
  const wood = tex(256, 256, (x, W, H) => { for (let i = 0; i < 16; i++) { const v = rnd(70, 105); x.fillStyle = `rgb(${v + 25},${v},${v - 28})`; x.fillRect(i * 16, 0, 14, H); x.fillStyle = '#0006'; x.fillRect(i * 16 + 14, 0, 2, H); } }, 3, 1);
  const pave = tex(256, 256, (x, W, H) => { x.fillStyle = '#26262a'; x.fillRect(0, 0, W, H); x.strokeStyle = '#18181b'; x.lineWidth = 3; x.strokeRect(0, 0, W, H); }, 8, 8);
  // shell
  const fl = put(new THREE.PlaneGeometry(14, 26), M(0xffffff, .22, .15, { map: marble }), 0, 0, 0, 0); fl.rotation.x = -Math.PI / 2; fl.castShadow = false;
  const ce = put(new THREE.PlaneGeometry(14, 26), M(0x1a1a1a, .9), 0, 4, 0); ce.rotation.x = Math.PI / 2; ce.castShadow = false;
  const wall = M(0xffffff, .95, 0, { map: plaster });
  put(B(.2, 4, 26), wall, -7, 2, 0); put(B(.2, 4, 26), wall, 7, 2, 0); put(B(14, 4, .2), M(0xffffff, .7, 0, { map: wood }), 0, 2, -13);
  for (const sx of [-6.88, 6.88]) { put(B(.05, .03, 26), glow(GOLD, 1.5), sx, 3.55, 0); put(B(.06, .15, 26), M(0x111111, .4), sx, .075, 0); }
  for (const x of [-3, 0, 3]) put(B(.08, .02, 24), glow(0xfff0d0, 2.5), x, 3.97, 0);
  for (const sx of [-5, 5]) for (let z = 3; z > -9; z -= 2.5) put(new THREE.CylinderGeometry(.09, .09, .05, 16), glow(0xfff0d0, 3), sx, 3.97, z);
  // storefront + exterior
  const gm = new THREE.MeshStandardMaterial({ color: 0x9fb7c4, transparent: true, opacity: .14, roughness: .05, metalness: .9 });
  const glass = [-4.25, 4.25].map(x => put(new THREE.PlaneGeometry(5.5, 3.5), gm, x, 1.75, 13)); glass.forEach(g => g.castShadow = false);
  const dark = M(0x111113, .4, .6);
  put(B(14, .6, .3), dark, 0, 3.7, 13); for (const x of [-7, -1.5, 1.5, 7]) put(B(.12, 4, .3), M(GOLD, .3, 1), x, 2, 13);
  const sign = label('TALHA STUDIO', 6, 52); sign.position.set(0, 3.7, 13.2); scene.add(sign);
  const gr = put(new THREE.PlaneGeometry(60, 40), M(0xffffff, .5, 0, { map: pave }), 0, -.01, 33); gr.rotation.x = -Math.PI / 2; gr.castShadow = false; gr.material.map.repeat.set(12, 8);
  for (const sx of [-10.5, 10.5]) put(B(7, 6, 26), M(0x1c1c20, .9), sx, 3, 0);
  // fabric shelves (back wall) + counter + trial room
  const shelf = M(0x1a1a1a, .4, .5); const slots = []; const un = products.filter(p => p.section === 'unstitched');
  for (let lv = 0; lv < 3; lv++) put(B(6.6, .05, .5), shelf, -1.2, .45 + lv * .65, -12.7);
  put(B(.06, 2.1, .5), shelf, -4.5, 1.05, -12.7); put(B(.06, 2.1, .5), shelf, 2.1, 1.05, -12.7); block(-4.6, 2.2, -13, -12.3);
  const items = []; const fabM = c => M(c, .95);
  for (let lv = 0; lv < 3; lv++) for (let c = 0; c < 8; c++) { const i = lv * 8 + c, x = -4.1 + c * .8, y = .48 + lv * .65 + .09, p = un[i];
    const f = put(B(.5, .16 + (p ? 0 : rnd(0, .12)), .34), fabM(PAL[(i * 3) % PAL.length]), x, y, -12.65); if (p) { f.userData.product = p; items.push(f); } }
  put(B(3, 1.05, .8), M(0x151515, .3, .3), 4.7, .525, -11.6); put(B(3.1, .05, .9), M(0xc9a84c, .25, .9), 4.7, 1.07, -11.6); put(B(2.9, .03, .02), glow(GOLD, 2), 4.7, .15, -11.19); block(3.1, 6.3, -12.4, -10.9);
  const lg = label('TALHA STUDIO', 3, 38); lg.position.set(4.7, 2.5, -12.88); scene.add(lg);
  put(B(2.2, 2.6, 2), M(0x2a2a2e, .95), -5.9, 1.3, -11.8); block(-7, -4.7, -13, -10.8);
  const tl = label('TRIAL ROOM', 1.6, 34); tl.position.set(-5.9, 2.8, -10.78); scene.add(tl);
  for (const [sx, ry] of [[6.84, -Math.PI / 2], [-6.84, Math.PI / 2]]) { put(B(1.4, 2.6, .05), M(GOLD, .3, 1), sx, 1.5, 8, ry); put(new THREE.PlaneGeometry(1.2, 2.4), M(0xffffff, .02, 1), sx + (sx > 0 ? -.03 : .03), 1.5, 8, ry); }
  // mannequins (decorative; not products) + display table
  const mannequin = (x, z, col, ry) => { const g = new THREE.Group(), sk = M(0xd9d4cc, .45), mk = (geo, m, y) => { const o = new THREE.Mesh(geo, m); o.position.y = y; o.castShadow = true; g.add(o); };
    mk(new THREE.CylinderGeometry(.3, .3, .03, 24), M(0x0f0f0f, .2, .7), .015); mk(new THREE.CylinderGeometry(.015, .015, .9), M(0x888888, .3, .9), .45);
    mk(new THREE.CylinderGeometry(.19, .15, .7, 20), M(col, .85), 1.3); mk(new THREE.CylinderGeometry(.16, .27, .62, 20), M(col, .85), .68);
    mk(new THREE.CylinderGeometry(.045, .05, .1, 12), sk, 1.69); mk(new THREE.SphereGeometry(.105, 16, 12), sk, 1.8); g.position.set(x, 0, z); g.rotation.y = ry; scene.add(g); block(x - .35, x + .35, z - .35, z + .35); };
  mannequin(-1.9, 6, 0x5a1f2b, .4); mannequin(1.9, 6, 0x20374a, -.4); mannequin(-2.4, -7, 0xe9e4d8, .3);
  put(new THREE.CylinderGeometry(.7, .7, .75, 32), M(0x151515, .3, .4), 0, .375, 6); put(new THREE.CylinderGeometry(.72, .72, .04, 32), M(GOLD, .25, .9), 0, .77, 6); block(-.8, .8, 5.2, 6.8);
  for (let i = 0; i < 4; i++) put(B(.42, .09, .3), fabM(PAL[i + 1]), 0, .84 + i * .09, 6, i * .35);
  // hanging garments
  const metal = M(0xb8b8b8, .2, 1);
  function garment(p, i, x, z, ry) { const g = new THREE.Group(), col = M(PAL[i % PAL.length], .9), add = (geo, m, px, py, rz = 0) => { const o = new THREE.Mesh(geo, m); o.position.set(px, py, 0); o.rotation.z = rz; o.castShadow = true; g.add(o); return o; };
    add(B(.4, .95, .05), col, 0, -.5); add(B(.3, .13, .05), col, .3, -.14, -.5); add(B(.3, .13, .05), col, -.3, -.14, .5);
    add(new THREE.CylinderGeometry(.008, .008, .5, 6), metal, 0, -.04, Math.PI / 2); add(new THREE.CylinderGeometry(.008, .008, .12, 6), metal, 0, .04);
    const ph = new THREE.Mesh(new THREE.PlaneGeometry(.36, .5), new THREE.MeshBasicMaterial()); ph.position.set(0, -.5, .03); ph.visible = false; g.add(ph);
    g.position.set(x, 1.72, z); g.rotation.y = ry; g.userData = { product: p, photo: ph, url: p.images?.[0] }; scene.add(g); items.push(g); }
  const bySec = {}; products.forEach(p => { if (p.section !== 'unstitched') (bySec[SEC[p.section] ? p.section : 'sale'] ||= []).push(p); });
  for (const [k, s] of Object.entries(SEC)) { const [px, pz] = s.p, al = s.ax === 'z', cx = al ? px : px + s.len / 2, cz = al ? pz - s.len / 2 : pz;
    const rail = put(new THREE.CylinderGeometry(.02, .02, s.len), M(GOLD, .25, 1), cx, 1.72, cz); rail.rotation[al ? 'x' : 'z'] = Math.PI / 2;
    for (const e of [0, 1]) put(new THREE.CylinderGeometry(.025, .025, 1.72), metal, al ? px : px + e * s.len, .86, al ? pz - e * s.len : pz);
    block(...(al ? [px - .8, px + .8, pz - s.len, pz] : [px, px + s.len, pz - .8, pz + .8]));
    const lb = label(s.t, 2.2); lb.position.set(cx, 2.75, cz); lb.rotation.y = al ? s.ry : 0; scene.add(lb);
    const list = bySec[k] || [], step = Math.min(.6, s.len / Math.max(list.length, 1));
    list.forEach((p, i) => { const t = step * (i + .5); garment(p, i, al ? px : px + t, al ? pz - t : pz, s.ry); }); }
  const un2 = label('UNSTITCHED FABRICS', 3.4, 32); un2.position.set(-1.2, 2.5, -12.85); scene.add(un2);
  // controls
  const proc = [...scene.children], bd = { x0: -6.4, x1: 6.4, z0: -12.4, z1: 12.4 }, hp = new THREE.Vector3(0, 1.6, 9);
  let yaw = 0, pitch = 0, ready = false, anim = null; const pos = new THREE.Vector3(0, 1.9, 20), keys = {};
  const okAt = (x, z) => x > bd.x0 && x < bd.x1 && z > bd.z0 && z < bd.z1 && !obstacles.some(b => x > b[0] && x < b[1] && z > b[2] && z < b[3]);
  const walk = (f, s) => { const dx = -Math.sin(yaw) * f + Math.cos(yaw) * s, dz = -Math.cos(yaw) * f - Math.sin(yaw) * s; if (okAt(pos.x + dx, pos.z)) pos.x += dx; if (okAt(pos.x, pos.z + dz)) pos.z += dz; };
  let d = null; const rc = new THREE.Raycaster(), v = new THREE.Vector2();
  canvas.addEventListener('pointerdown', e => { if (!ready) return; d = { lx: e.clientX, ly: e.clientY, m: 0 }; canvas.setPointerCapture(e.pointerId); });
  canvas.addEventListener('pointermove', e => { if (!d) return; const dx = e.clientX - d.lx, dy = e.clientY - d.ly; d.lx = e.clientX; d.ly = e.clientY; d.m += Math.abs(dx) + Math.abs(dy); yaw -= dx * .005; if (d.m > 8) walk(-dy * .012, 0); });
  canvas.addEventListener('pointerup', e => { if (d && d.m < 8) { v.set(e.clientX / innerWidth * 2 - 1, -(e.clientY / innerHeight) * 2 + 1); rc.setFromCamera(v, cam);
    const h = rc.intersectObjects(items, true)[0]; if (h) { let o = h.object; while (o && !o.userData.product) o = o.parent; if (o) onPick(o.userData.product); } } d = null; });
  function resize() { r.setSize(innerWidth, innerHeight, false); cam.aspect = innerWidth / innerHeight; cam.updateProjectionMatrix(); }
  addEventListener('resize', resize); resize();
  const tload = new THREE.TextureLoader(); tload.setCrossOrigin('anonymous'); let fr = 0; const clock = new THREE.Clock();
  r.setAnimationLoop(() => { const dt = Math.min(clock.getDelta(), .05);
    if (anim) { anim.t += dt; const k = Math.min(anim.t / 2.6, 1), e = k * k * (3 - 2 * k); pos.z = hp.z + 11 * (1 - e); pos.x = hp.x; pos.y = 1.9 + (1.6 - 1.9) * e; pitch = -.08 * (1 - e); if (k >= 1) { anim = null; ready = true; glass.forEach(g => g.visible = false); } }
    else if (ready) { walk(((keys.f ? 1 : 0) - (keys.b ? 1 : 0)) * 3 * dt, 0); yaw += ((keys.l ? 1 : 0) - (keys.r ? 1 : 0)) * 1.6 * dt; }
    if (++fr % 20 === 0) for (const g of items) { const u = g.userData; if (u.url && !u.req && g.position.distanceTo(pos) < 9) { u.req = 1;
      tload.load(u.url, t => { t.colorSpace = THREE.SRGBColorSpace; u.photo.material.map = t; u.photo.material.needsUpdate = true; u.photo.visible = true; }, undefined, () => {}); } }
    cam.position.copy(pos); cam.rotation.set(pitch, yaw, 0); r.render(scene, cam); });
  if (opts.glb) { const ld = new GLTFLoader(); ld.setMeshoptDecoder(MeshoptDecoder);
    ld.load(opts.glb, gl => { const m = gl.scene; m.updateMatrixWorld(true);
      proc.forEach(o => { if (!o.isLight || o.isPointLight || o.isSpotLight) o.visible = false; }); items.length = 0; obstacles.length = 0; scene.fog = null; scene.add(m);
      const bb = new THREE.Box3().setFromObject(m); bd.x0 = bb.min.x + .5; bd.x1 = bb.max.x - .5; bd.z0 = bb.min.z + .5; bd.z1 = bb.max.z - .5;
      hp.set((bb.min.x + bb.max.x) / 2, 1.6, bb.max.z - 1.5); const sp0 = m.getObjectByName('spawn'); if (sp0) { const w = new THREE.Vector3(); sp0.getWorldPosition(w); hp.set(w.x, 1.6, w.z); }
      const byId = Object.fromEntries(products.map(q => [String(q.id), q]));
      m.traverse(o => { o.castShadow = false; const n = o.name || '';
        if (n.startsWith('product_') && byId[n.slice(8)]) { o.userData.product = byId[n.slice(8)]; items.push(o); }
        if (n.startsWith('collider_')) { const b = new THREE.Box3().setFromObject(o); obstacles.push([b.min.x, b.max.x, b.min.z, b.max.z]); o.visible = false; } });
      if (ready) pos.copy(hp); }, undefined, e => console.error('GLB load failed, using built-in showroom', e)); }
  return { enter(skip) { if (skip || matchMedia('(prefers-reduced-motion: reduce)').matches) { pos.copy(hp); ready = true; glass.forEach(g => g.visible = false); } else anim = { t: 0 }; },
    home() { pos.copy(hp); yaw = 0; pitch = 0; }, key(k, on) { keys[k] = on; } };
}
