import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
const GOLD = 0xc9a84c, PAL = [0x1b1b1b, 0xe9e4d8, 0x5a1f2b, 0x20374a, 0x3d4a2f, 0xb9975b, 0x6b5b4b, 0x8a8a8a];
// Rail sections. p = start point, ax = rail axis, len = rail length, ry = garment facing.
const SEC = {
  men: { t: "MEN'S COLLECTION", p: [-5, 3], ax: 'z', len: 12, ry: Math.PI / 2, women: false },
  women: { t: "WOMEN'S COLLECTION", p: [5, 3], ax: 'z', len: 12, ry: -Math.PI / 2, women: true },
  sale: { t: 'SALE', p: [-2, -3], ax: 'x', len: 4, ry: 0 },
  stitched: { t: 'STITCHED SUITS', p: [-2, -7.5], ax: 'x', len: 4, ry: 0 } };
// Colour names a product may carry in Firestore -> real fabric colour.
const COLORS = { navy: 0x20374a, black: 0x1b1b1b, white: 0xe9e4d8, cream: 0xe6dcc3, maroon: 0x5a1f2b, green: 0x3d4a2f, olive: 0x4a5030, grey: 0x8a8a8a, gray: 0x8a8a8a, pink: 0xc98a94, blue: 0x34567a, beige: 0xc4ae86, brown: 0x6b5b4b, red: 0x8b1e2b, mustard: 0xb9975b, sky: 0x8db4d6, mint: 0x9cc5ae, peach: 0xe7b9a0, purple: 0x5b3a6b };
const colorOf = (p, i) => { const c = p?.colors?.[0]; if (typeof c === 'string') { if (/^#?[0-9a-f]{6}$/i.test(c)) return parseInt(c.replace('#', ''), 16); const n = c.toLowerCase(); for (const k in COLORS) if (n.includes(k)) return COLORS[k]; } return PAL[i % PAL.length]; };
const rnd = (a, b) => a + Math.random() * (b - a);
function tex(w, h, draw, rx = 1, ry = 1) { const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(rx, ry); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t; }
const M = (c, rough = .8, metal = 0, o = {}) => new THREE.MeshStandardMaterial({ color: c, roughness: rough, metalness: metal, ...o });
const glow = (c, i = 2) => new THREE.MeshStandardMaterial({ color: 0x111111, emissive: c, emissiveIntensity: i });
const css = h => '#' + new THREE.Color(h).getHexString();
// Woven cloth: fine warp/weft lines + fibre noise. Cached per colour.
const fabC = new Map();
function fabricTex(hex) { if (fabC.has(hex)) return fabC.get(hex);
  const t = tex(256, 256, (x, W, H) => { x.fillStyle = css(hex); x.fillRect(0, 0, W, H);
    for (let i = 0; i < W; i += 2) { x.fillStyle = 'rgba(0,0,0,.07)'; x.fillRect(i, 0, 1, H); x.fillStyle = 'rgba(255,255,255,.05)'; x.fillRect(0, i, W, 1); }
    for (let i = 0; i < 2500; i++) { x.fillStyle = `rgba(${Math.random() < .5 ? '0,0,0' : '255,255,255'},.04)`; x.fillRect(rnd(0, W), rnd(0, H), 1.5, 1.5); } }, 2, 2);
  fabC.set(hex, t); return t; }
// Embroidered border band (gold motifs on the garment colour): hems, necklines.
const bandC = new Map();
function bandTex(hex) { if (bandC.has(hex)) return bandC.get(hex);
  const t = tex(256, 64, (x, W, H) => { x.fillStyle = css(hex); x.fillRect(0, 0, W, H);
    x.strokeStyle = '#d9b95c'; x.fillStyle = '#d9b95c'; x.lineWidth = 2; x.strokeRect(0, 4, W, 0); x.beginPath(); x.moveTo(0, 6); x.lineTo(W, 6); x.moveTo(0, H - 6); x.lineTo(W, H - 6); x.stroke();
    for (let gx = 16; gx < W; gx += 32) { x.beginPath(); x.moveTo(gx, 14); x.quadraticCurveTo(gx + 12, 24, gx, 50); x.quadraticCurveTo(gx - 12, 28, gx, 14); x.stroke();
      x.beginPath(); x.arc(gx, 32, 3, 0, 7); x.fill(); x.fillRect(gx + 14, 30, 4, 4); } }, 2, 1);
  bandC.set(hex, t); return t; }
function label(text, w, fs = 40) { const h = w * .19;
  const t = tex(512, Math.round(512 * .19), (x, W, H) => { x.fillStyle = '#0b0b0b'; x.fillRect(0, 0, W, H); x.strokeStyle = '#c9a84c'; x.lineWidth = 3; x.strokeRect(6, 6, W - 12, H - 12);
    x.fillStyle = '#e8d9a8'; x.font = fs + 'px Georgia'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText(text, W / 2, H / 2 + 2); });
  return new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: t, side: THREE.DoubleSide })); }
// Hang tag showing the REAL product name and price from its record.
function tagMesh(p) { const price = p.salePrice ?? p.price, nm = String(p.name || '').slice(0, 16);
  const t = tex(128, 192, (x, W, H) => { x.fillStyle = '#efe6d0'; x.fillRect(0, 0, W, H); x.strokeStyle = '#c9a84c'; x.lineWidth = 4; x.strokeRect(4, 4, W - 8, H - 8);
    x.fillStyle = '#111'; x.textAlign = 'center'; x.font = '15px Georgia'; x.fillText(nm, W / 2, 70);
    x.font = 'bold 22px Georgia'; x.fillText(price != null ? 'Rs ' + Number(price).toLocaleString() : '', W / 2, 120); if (p.demo) { x.font = '13px Georgia'; x.fillText('DEMO', W / 2, 160); } });
  return new THREE.Mesh(new THREE.PlaneGeometry(.085, .128), new THREE.MeshBasicMaterial({ map: t, side: THREE.DoubleSide })); }
// Shaped kurta silhouettes (shoulders, sleeves, hem), extruded with bevel so they have real thickness.
function kurtaGeo(women) { const s = new THREE.Shape(), hw = women ? .30 : .22, hy = women ? -1.15 : -.88, aw = women ? .19 : .22;
  s.moveTo(-.07, 0); s.lineTo(-.22, -.03); s.lineTo(-.47, -.31); s.lineTo(-.41, -.41); s.lineTo(-aw, -.25); s.lineTo(-hw, hy); s.lineTo(hw, hy);
  s.lineTo(aw, -.25); s.lineTo(.41, -.41); s.lineTo(.47, -.31); s.lineTo(.22, -.03); s.lineTo(.07, 0); s.quadraticCurveTo(0, women ? -.11 : -.07, -.07, 0);
  return new THREE.ExtrudeGeometry(s, { depth: .02, bevelEnabled: true, bevelThickness: .008, bevelSize: .008, bevelSegments: 2, curveSegments: 6 }); }
const KG = { m: kurtaGeo(false), w: kurtaGeo(true) };
function dupatta(w, h, hex) { const geo = new THREE.PlaneGeometry(w, h, 10, 20), pa = geo.attributes.position;
  for (let k = 0; k < pa.count; k++) { const x = pa.getX(k), y = pa.getY(k); pa.setZ(k, Math.sin(x * 14 + y * 4) * .018 + Math.sin(y * 9) * .012); } geo.computeVertexNormals();
  return new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: 0xffffff, map: fabricTex(hex), roughness: .75, side: THREE.DoubleSide })); }
export function createShowroom(canvas, products, onPick) {
  const coarse = matchMedia('(pointer: coarse)').matches, low = (navigator.hardwareConcurrency || 4) <= 4 || coarse && (navigator.hardwareConcurrency || 4) <= 6;
  const r = new THREE.WebGLRenderer({ canvas, antialias: !low, powerPreference: 'high-performance' });
  const maxPr = low ? 1 : Math.min(devicePixelRatio, 1.75); let pr = maxPr; r.setPixelRatio(pr); r.toneMapping = THREE.ACESFilmicToneMapping; r.toneMappingExposure = 1.05;
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
  const items = []; const link = (g, p, extra = {}) => { g.userData = { product: p, ...extra }; items.push(g); };
  // textures
  const marble = tex(512, 512, (x, W, H) => { x.fillStyle = '#1d1c1b'; x.fillRect(0, 0, W, H); x.lineCap = 'round';
    for (let i = 0; i < 40; i++) { x.strokeStyle = `rgba(255,245,225,${rnd(.03, .09)})`; x.lineWidth = rnd(.5, 2); x.beginPath(); const a = rnd(0, W), b = rnd(0, H); x.moveTo(a, b); x.bezierCurveTo(a + rnd(-150, 150), b + rnd(-150, 150), a + rnd(-150, 150), b + rnd(-150, 150), a + rnd(-200, 200), b + rnd(-200, 200)); x.stroke(); }
    x.strokeStyle = '#0a0a0a'; x.lineWidth = 4; x.strokeRect(0, 0, W, H); }, 7, 13);
  const plaster = tex(256, 256, (x, W, H) => { x.fillStyle = '#d8d2c5'; x.fillRect(0, 0, W, H); for (let i = 0; i < 3000; i++) { x.fillStyle = `rgba(${Math.random() < .5 ? '0,0,0' : '255,255,255'},.03)`; x.fillRect(rnd(0, W), rnd(0, H), 2, 2); } }, 6, 1);
  const wood = tex(256, 256, (x, W, H) => { for (let i = 0; i < 16; i++) { const v = rnd(70, 105); x.fillStyle = `rgb(${v + 25},${v},${v - 28})`; x.fillRect(i * 16, 0, 14, H); x.fillStyle = '#0006'; x.fillRect(i * 16 + 14, 0, 2, H);
    for (let k = 0; k < 14; k++) { x.fillStyle = 'rgba(0,0,0,.06)'; x.fillRect(i * 16 + rnd(0, 12), rnd(0, H), 1, rnd(20, 90)); } } }, 3, 1);
  const pave = tex(256, 256, (x, W, H) => { x.fillStyle = '#26262a'; x.fillRect(0, 0, W, H); x.strokeStyle = '#18181b'; x.lineWidth = 3; x.strokeRect(0, 0, W, H); }, 8, 8);
  // shell
  const fl = put(new THREE.PlaneGeometry(14, 26), M(0xffffff, .22, .15, { map: marble }), 0, 0, 0, 0); fl.rotation.x = -Math.PI / 2; fl.castShadow = false;
  const ce = put(new THREE.PlaneGeometry(14, 26), M(0x1a1a1a, .9), 0, 4, 0); ce.rotation.x = Math.PI / 2; ce.castShadow = false;
  const wall = M(0xffffff, .95, 0, { map: plaster });
  put(B(.2, 4, 26), wall, -7, 2, 0); put(B(.2, 4, 26), wall, 7, 2, 0); put(B(14, 4, .2), M(0xffffff, .7, 0, { map: wood }), 0, 2, -13);
  // wood slat wall panelling (one InstancedMesh for both side walls)
  { const sl = new THREE.InstancedMesh(B(.05, 3, .28), M(0xffffff, .6, 0, { map: wood }), 100), dm = new THREE.Object3D(); let n = 0;
    for (const sx of [-6.86, 6.86]) for (let z = -12; z < 12; z += .55) { if (Math.abs(z - 8) < .85) continue; dm.position.set(sx, 1.5, z); dm.updateMatrix(); sl.setMatrixAt(n++, dm.matrix); }
    sl.count = n; scene.add(sl); }
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
  // ---- folded fabric stacks (rounded, woven texture) + rolled bolts
  const stack = (p, i, x, y, z, ry = 0) => { const g = new THREE.Group(), hex = colorOf(p, i), m = new THREE.MeshStandardMaterial({ color: 0xffffff, map: fabricTex(hex), roughness: .95 }), n = 2 + (i % 2);
    for (let k = 0; k < n; k++) { const o = new THREE.Mesh(new RoundedBoxGeometry(.5 - k * .02, .055, .34, 3, .02), m); o.position.set(rnd(-.012, .012), .03 + k * .058, rnd(-.01, .01)); o.rotation.y = rnd(-.05, .05); o.castShadow = true; g.add(o); }
    const b = new THREE.Mesh(new THREE.PlaneGeometry(.5, .05), new THREE.MeshStandardMaterial({ map: bandTex(hex), roughness: .8 })); b.position.set(0, .03, .172); g.add(b);
    if (p) { const tg = tagMesh(p); tg.scale.setScalar(.7); tg.position.set(.2, .025 + n * .03, .2); tg.rotation.x = -.4; g.add(tg); link(g, p); }
    g.position.set(x, y, z); g.rotation.y = ry; scene.add(g); return g; };
  const bolt = (i, x, y, z) => { const o = new THREE.Mesh(new THREE.CylinderGeometry(.09, .09, .5, 18), new THREE.MeshStandardMaterial({ color: 0xffffff, map: fabricTex(PAL[i % PAL.length]), roughness: .9 })); o.rotation.z = Math.PI / 2; o.position.set(x, y + .09, z); o.castShadow = true; scene.add(o); };
  // fabric shelves (back wall) + counter + trial room
  const shelf = M(0x1a1a1a, .4, .5); const un = products.filter(p => p.section === 'unstitched');
  for (let lv = 0; lv < 3; lv++) put(B(6.6, .05, .5), shelf, -1.2, .45 + lv * .65, -12.7);
  put(B(.06, 2.1, .5), shelf, -4.5, 1.05, -12.7); put(B(.06, 2.1, .5), shelf, 2.1, 1.05, -12.7); block(-4.6, 2.2, -13, -12.3);
  for (let lv = 0; lv < 3; lv++) for (let c = 0; c < 8; c++) { const i = lv * 8 + c, x = -4.1 + c * .8, y = .475 + lv * .65, p = un[i];
    if (!p && c === 7) bolt(i, x, y, -12.65); else stack(p, i, x, y, -12.65); }
  put(B(3, 1.05, .8), M(0x151515, .3, .3), 4.7, .525, -11.6); put(B(3.1, .05, .9), M(0xc9a84c, .25, .9), 4.7, 1.07, -11.6); put(B(2.9, .03, .02), glow(GOLD, 2), 4.7, .15, -11.19); block(3.1, 6.3, -12.4, -10.9);
  const lg = label('TALHA STUDIO', 3, 38); lg.position.set(4.7, 2.5, -12.88); scene.add(lg);
  put(B(2.2, 2.6, 2), M(0x2a2a2e, .95), -5.9, 1.3, -11.8); block(-7, -4.7, -13, -10.8);
  const tl = label('TRIAL ROOM', 1.6, 34); tl.position.set(-5.9, 2.8, -10.78); scene.add(tl);
  for (const [sx, ry] of [[6.84, -Math.PI / 2], [-6.84, Math.PI / 2]]) { put(B(1.4, 2.6, .05), M(GOLD, .3, 1), sx, 1.5, 8, ry); put(new THREE.PlaneGeometry(1.2, 2.4), M(0xffffff, .02, 1), sx + (sx > 0 ? -.03 : .03), 1.5, 8, ry); }
  // ---- mannequins: lathe-turned torso, dressed in woven fabric; optionally linked to a real product
  function mannequin(x, z, ry, women, p, i) { const g = new THREE.Group(), hex = colorOf(p, i), sk = M(0xd9d4cc, .4, .05);
    const fab = new THREE.MeshStandardMaterial({ color: 0xffffff, map: fabricTex(hex), roughness: .88, side: THREE.DoubleSide });
    const mk = (geo, m, px, py, pz = 0) => { const o = new THREE.Mesh(geo, m); o.position.set(px, py, pz); o.castShadow = true; g.add(o); return o; };
    mk(new THREE.CylinderGeometry(.3, .32, .03, 32), M(0x0f0f0f, .2, .7), 0, .015); mk(new THREE.CylinderGeometry(.015, .015, 1.0), M(0x888888, .3, .9), 0, .5);
    const prof = women ? [[.34, .5], [.27, .8], [.2, .98], [.15, 1.12], [.13, 1.26], [.16, 1.4], [.18, 1.5], [.15, 1.58], [.05, 1.64]] : [[.2, .86], [.19, .95], [.16, 1.12], [.15, 1.26], [.17, 1.4], [.19, 1.5], [.16, 1.58], [.05, 1.64]];
    mk(new THREE.LatheGeometry(prof.map(a => new THREE.Vector2(a[0], a[1])), 28), fab, 0, 0).scale.z = .72;
    const bm = new THREE.MeshStandardMaterial({ map: bandTex(hex).clone(), roughness: .8, side: THREE.DoubleSide }); bm.map.repeat.set(6, 1); bm.map.needsUpdate = true; // clone: don't change the shared band texture's repeat
    mk(new THREE.CylinderGeometry(women ? .335 : .205, women ? .335 : .205, women ? .07 : .05, 32, 1, true), bm, 0, women ? .54 : .885).scale.z = .72;
    if (!women) for (const s of [-1, 1]) mk(new THREE.CylinderGeometry(.075, .06, .8, 14), new THREE.MeshStandardMaterial({ color: 0xffffff, map: fabricTex(0xe6dcc3), roughness: .9 }), s * .09, .45);
    for (const s of [-1, 1]) { const a = mk(new THREE.CapsuleGeometry(.042, .42, 4, 10), fab, s * .25, 1.33); a.rotation.z = s * .22; }
    mk(new THREE.CylinderGeometry(.045, .05, .1, 12), sk, 0, 1.68); mk(new THREE.SphereGeometry(.105, 20, 16), sk, 0, 1.79);
    if (women) { const d = dupatta(.5, 1.2, hex === 0xe9e4d8 ? 0xb9975b : 0xe9e4d8); d.position.set(0, 1.0, -.17); g.add(d);
      const sash = dupatta(.13, .75, hex === 0xe9e4d8 ? 0xb9975b : 0xe9e4d8); sash.position.set(.06, 1.3, .17); sash.rotation.z = .6; g.add(sash); }
    g.position.set(x, 0, z); g.rotation.y = ry; scene.add(g); block(x - .35, x + .35, z - .35, z + .35); if (p) link(g, p); }
  const first = k => products.find(p => p.section === k);
  mannequin(-1.9, 6, .4, false, first('men'), 0); mannequin(1.9, 6, -.4, true, first('women'), 2); mannequin(-3.4, -5.5, .3, true, first('stitched'), 1);
  // central display table with folded cloth
  put(new THREE.CylinderGeometry(.7, .7, .75, 32), M(0x151515, .3, .4), 0, .375, 6); put(new THREE.CylinderGeometry(.72, .72, .04, 32), M(GOLD, .25, .9), 0, .77, 6); block(-.8, .8, 5.2, 6.8);
  for (let i = 0; i < 4; i++) { const o = new THREE.Mesh(new RoundedBoxGeometry(.42, .08, .3, 3, .02), new THREE.MeshStandardMaterial({ color: 0xffffff, map: fabricTex(PAL[i + 1]), roughness: .95 })); o.position.set(0, .83 + i * .085, 6); o.rotation.y = i * .35; o.castShadow = true; scene.add(o); }
  // NEW ARRIVALS table: folded stacks, each linked to its product (isNew flag or section 'new')
  { const nw = products.filter(p => p.isNew === true || p.section === 'new').slice(0, 6), tx = .6, tz = -10.2;
    put(new THREE.CylinderGeometry(.9, .9, .75, 36), M(0x151515, .3, .4), tx, .375, tz); put(new THREE.CylinderGeometry(.92, .92, .04, 36), M(GOLD, .25, .9), tx, .77, tz); block(tx - 1, tx + 1, tz - 1, tz + 1);
    nw.forEach((p, k) => { const a = k / Math.max(nw.length, 1) * Math.PI * 2; stack(p, k, tx + Math.cos(a) * .5, .79, tz + Math.sin(a) * .5, -a + Math.PI / 2); });
    put(new THREE.CylinderGeometry(.015, .015, 1.3), M(0x888888, .3, .9), tx, 1.4, tz); const nl = label('NEW ARRIVALS', 1.6, 36); nl.position.set(tx, 2.15, tz); scene.add(nl); }
  // ---- hanging garments on rails
  const metal = M(0xb8b8b8, .2, 1), hookG = new THREE.TorusGeometry(.025, .005, 6, 12, Math.PI * 1.5);
  function garment(p, i, x, z, ry, women) { const g = new THREE.Group(), hex = colorOf(p, i), add = (geo, m, px, py, pz = 0, rz = 0) => { const o = new THREE.Mesh(geo, m); o.position.set(px, py, pz); o.rotation.z = rz; o.castShadow = true; g.add(o); return o; };
    const body = add(women ? KG.w : KG.m, new THREE.MeshStandardMaterial({ color: 0xffffff, map: fabricTex(hex), roughness: .9 }), 0, -.02, -.01); body.rotation.z = 0;
    const hy = women ? -1.09 : -.87, hw = women ? .56 : .43, bm = new THREE.MeshStandardMaterial({ map: bandTex(hex), roughness: .8, side: THREE.DoubleSide });
    const hb = add(new THREE.PlaneGeometry(hw, .1), bm, 0, hy, .02); hb.castShadow = false;
    if (women) { const yk = add(new THREE.PlaneGeometry(.2, .09), bm, 0, -.12, .02); yk.castShadow = false; }
    for (const s of [-1, 1]) add(new THREE.CylinderGeometry(.007, .007, .27, 6), metal, s * .13, -.03, 0, s * Math.PI / 2 - s * .2); // hanger arms
    add(new THREE.CylinderGeometry(.007, .007, .1, 6), metal, 0, .04); add(hookG, metal, 0, .1);
    const tg = tagMesh(p); tg.position.set(.19, -.32, .035); g.add(tg);
    const ph = new THREE.Mesh(new THREE.PlaneGeometry(.17, .23), new THREE.MeshBasicMaterial()); ph.position.set(-.17, -.5, .04); ph.visible = false; g.add(ph); // real product photo card, loaded on approach
    g.position.set(x, 1.72, z); g.rotation.y = ry; scene.add(g); link(g, p, { photo: ph, url: p.images?.[0] }); }
  const bySec = {}; products.forEach(p => { if (p.section === 'unstitched' || p.section === 'new') return; (bySec[SEC[p.section] ? p.section : 'sale'] ||= []).push(p); });
  for (const [k, s] of Object.entries(SEC)) { const [px, pz] = s.p, al = s.ax === 'z', cx = al ? px : px + s.len / 2, cz = al ? pz - s.len / 2 : pz;
    const rail = put(new THREE.CylinderGeometry(.02, .02, s.len), M(GOLD, .25, 1), cx, 1.72, cz); rail.rotation[al ? 'x' : 'z'] = Math.PI / 2;
    for (const e of [0, 1]) put(new THREE.CylinderGeometry(.025, .025, 1.72), metal, al ? px : px + e * s.len, .86, al ? pz - e * s.len : pz);
    block(...(al ? [px - .8, px + .8, pz - s.len, pz] : [px, px + s.len, pz - .8, pz + .8]));
    const lb = label(s.t, 2.4, 30); lb.position.set(cx, 2.75, cz); lb.rotation.y = al ? s.ry : 0; scene.add(lb);
    const list = bySec[k] || [], step = Math.min(.6, s.len / Math.max(list.length, 1));
    list.forEach((p, i) => { const t = step * (i + .5), w = s.women ?? (p.gender === 'women' || p.gender === 'female'); garment(p, i, al ? px : px + t, al ? pz - t : pz, s.ry, w); }); }
  const un2 = label('UNSTITCHED FABRICS', 3.4, 32); un2.position.set(-1.2, 2.5, -12.85); scene.add(un2);
  // ---- controls
  let yaw = 0, pitch = 0, ready = false, anim = null; const pos = new THREE.Vector3(0, 1.9, 20), keys = {};
  const okAt = (x, z) => x > -6.4 && x < 6.4 && z > -12.4 && z < 12.4 && !obstacles.some(b => x > b[0] && x < b[1] && z > b[2] && z < b[3]);
  const walk = (f, s) => { const dx = -Math.sin(yaw) * f + Math.cos(yaw) * s, dz = -Math.cos(yaw) * f - Math.sin(yaw) * s; if (okAt(pos.x + dx, pos.z)) pos.x += dx; if (okAt(pos.x, pos.z + dz)) pos.z += dz; };
  let d = null; const rc = new THREE.Raycaster(), v = new THREE.Vector2();
  canvas.addEventListener('pointerdown', e => { if (!ready) return; d = { lx: e.clientX, ly: e.clientY, m: 0 }; canvas.setPointerCapture(e.pointerId); });
  canvas.addEventListener('pointermove', e => { if (!d) return; const dx = e.clientX - d.lx, dy = e.clientY - d.ly; d.lx = e.clientX; d.ly = e.clientY; d.m += Math.abs(dx) + Math.abs(dy); yaw -= dx * .005; if (d.m > 8) walk(-dy * .012, 0); });
  canvas.addEventListener('pointerup', e => { if (d && d.m < 8) { v.set(e.clientX / innerWidth * 2 - 1, -(e.clientY / innerHeight) * 2 + 1); rc.setFromCamera(v, cam);
    const h = rc.intersectObjects(items, true)[0]; if (h) { let o = h.object; while (o && !o.userData.product) o = o.parent; if (o) onPick(o.userData.product); } } d = null; });
  function resize() { r.setPixelRatio(pr); r.setSize(innerWidth, innerHeight, false); cam.aspect = innerWidth / innerHeight; cam.updateProjectionMatrix(); }
  addEventListener('resize', resize); resize();
  const tload = new THREE.TextureLoader(); tload.setCrossOrigin('anonymous'); let fr = 0, acc = 0, nf = 0; const clock = new THREE.Clock();
  r.setAnimationLoop(() => { const dt = Math.min(clock.getDelta(), .05);
    // adaptive resolution: drop pixel ratio on slow phones, restore when there is headroom
    acc += dt; if (++nf === 45) { const a = acc / nf; if (a > .026 && pr > .6) { pr = Math.max(.6, pr - .15); resize(); } else if (a < .0175 && pr < maxPr) { pr = Math.min(maxPr, pr + .1); resize(); } acc = nf = 0; }
    if (anim) { anim.t += dt; const k = Math.min(anim.t / 2.6, 1), e = k * k * (3 - 2 * k); pos.z = 20 + (9 - 20) * e; pos.y = 1.9 + (1.6 - 1.9) * e; pitch = -.08 * (1 - e); if (k >= 1) { anim = null; ready = true; glass.forEach(g => g.visible = false); } }
    else if (ready) { walk(((keys.f ? 1 : 0) - (keys.b ? 1 : 0)) * 3 * dt, 0); yaw += ((keys.l ? 1 : 0) - (keys.r ? 1 : 0)) * 1.6 * dt; }
    if (++fr % 20 === 0) for (const g of items) { const u = g.userData; if (u.url && u.photo && !u.req && g.position.distanceTo(pos) < 9) { u.req = 1;
      tload.load(u.url, t => { t.colorSpace = THREE.SRGBColorSpace; u.photo.material.map = t; u.photo.material.needsUpdate = true; u.photo.visible = true; }, undefined, () => {}); } }
    cam.position.copy(pos); cam.rotation.set(pitch, yaw, 0); r.render(scene, cam); });
  return { enter(skip) { if (skip || matchMedia('(prefers-reduced-motion: reduce)').matches) { pos.set(0, 1.6, 9); ready = true; glass.forEach(g => g.visible = false); } else anim = { t: 0 }; },
    home() { pos.set(0, 1.6, 9); yaw = 0; pitch = 0; }, key(k, on) { keys[k] = on; } };
}
