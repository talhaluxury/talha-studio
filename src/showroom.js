import * as THREE from 'three';
const SECTIONS = { // rail: start point, direction axis, length, garment facing
  men: { label: "MEN'S", p: [-5, 0, 3], axis: 'z', dir: -1, len: 12 },
  women: { label: "WOMEN'S", p: [5, 0, 3], axis: 'z', dir: -1, len: 12 },
  unstitched: { label: 'UNSTITCHED FABRICS', p: [-4, 0, -10], axis: 'x', dir: 1, len: 8 },
  sale: { label: 'SALE', p: [-2, 0, -3], axis: 'x', dir: 1, len: 4 } };
const PAL = [0x1b1b1b, 0xe9e4d8, 0x5a1f2b, 0x20374a, 0x3d4a2f, 0xc9a84c, 0x6b5b4b, 0x8a8a8a];
function label(text, w = 3) {
  const c = document.createElement('canvas'); c.width = 512; c.height = 96; const x = c.getContext('2d');
  x.fillStyle = '#0b0b0b'; x.fillRect(0, 0, 512, 96); x.strokeStyle = '#c9a84c'; x.strokeRect(4, 4, 504, 88);
  x.fillStyle = '#f4f1ea'; x.font = '40px Georgia'; x.textAlign = 'center'; x.fillText(text, 256, 62);
  return new THREE.Mesh(new THREE.PlaneGeometry(w, w * 96 / 512), new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(c) }));
}
export function createShowroom(canvas, products, onPick) {
  const low = (navigator.hardwareConcurrency || 4) <= 4;
  const r = new THREE.WebGLRenderer({ canvas, antialias: !low });
  r.setPixelRatio(low ? 1 : Math.min(devicePixelRatio, 1.5));
  const scene = new THREE.Scene(); scene.background = new THREE.Color(0x0b0b0b); scene.fog = new THREE.Fog(0x0b0b0b, 14, 34);
  const cam = new THREE.PerspectiveCamera(65, 1, 0.1, 60); cam.rotation.order = 'YXZ';
  scene.add(new THREE.HemisphereLight(0xfff1dd, 0x222222, 1.2));
  for (const z of [6, -2, -9]) { const l = new THREE.PointLight(0xffd9a0, 28, 16); l.position.set(0, 3.6, z); scene.add(l); }
  const M = (c, rough = .8) => new THREE.MeshStandardMaterial({ color: c, roughness: rough });
  const add = (g, m, x, y, z) => { const o = new THREE.Mesh(g, m); o.position.set(x, y, z); scene.add(o); return o; };
  const floor = add(new THREE.PlaneGeometry(14, 26), M(0x2a2622, .35), 0, 0, 0); floor.rotation.x = -Math.PI / 2;
  const ceil = add(new THREE.PlaneGeometry(14, 26), M(0x151515), 0, 4, 0); ceil.rotation.x = Math.PI / 2;
  const wm = M(0xd8d2c4);
  add(new THREE.BoxGeometry(.2, 4, 26), wm, -7, 2, 0); add(new THREE.BoxGeometry(.2, 4, 26), wm, 7, 2, 0);
  add(new THREE.BoxGeometry(14, 4, .2), wm, 0, 2, -13);
  const glass = add(new THREE.PlaneGeometry(14, 4), new THREE.MeshBasicMaterial({ color: 0x9fb7c4, transparent: true, opacity: .15 }), 0, 2, 13);
  const sign = label('TALHA STUDIO', 6); sign.position.set(0, 3.3, 13.1); scene.add(sign);
  const obstacles = []; // [minX,maxX,minZ,maxZ]
  const bySec = {}; products.forEach(p => (bySec[p.section || 'sale'] ||= []).push(p));
  const items = [], gGeo = new THREE.BoxGeometry(.4, 1, .07), rGeo = new THREE.CylinderGeometry(.02, .02, 1);
  for (const [k, s] of Object.entries(SECTIONS)) {
    const [px, , pz] = s.p, along = s.axis === 'z';
    const rail = add(rGeo, M(0xc9a84c, .3), px + (along ? 0 : s.len / 2), 1.7, pz + (along ? -s.len / 2 : 0));
    rail.scale.y = s.len; rail.rotation[along ? 'x' : 'z'] = Math.PI / 2;
    obstacles.push(along ? [px - .8, px + .8, pz - s.len, pz] : [px, px + s.len, pz - .8, pz + .8]);
    const lb = label(s.label, 2.2); lb.position.set(along ? px + (px < 0 ? .1 : -.1) : px + s.len / 2, 2.8, along ? pz - s.len / 2 : pz + .1);
    if (along) lb.rotation.y = px < 0 ? Math.PI / 2 : -Math.PI / 2; scene.add(lb);
    const list = bySec[k] || [], step = Math.min(.6, s.len / Math.max(list.length, 1));
    list.forEach((p, i) => {
      const o = new THREE.Mesh(gGeo, M(PAL[i % PAL.length])); const t = step * (i + .5);
      o.position.set(along ? px : px + t, 1.15, along ? pz - t : pz); if (along) o.rotation.y = Math.PI / 2;
      o.userData.product = p; scene.add(o); items.push(o);
    });
  }
  let yaw = 0, pitch = 0, pos = new THREE.Vector3(0, 1.6, 18), ready = false, anim = null; const keys = {};
  const okAt = (x, z) => x > -6.4 && x < 6.4 && z > -12.4 && z < 12.4 && !obstacles.some(b => x > b[0] && x < b[1] && z > b[2] && z < b[3]);
  function walk(f, s) { const dx = -Math.sin(yaw) * f + Math.cos(yaw) * s, dz = -Math.cos(yaw) * f - Math.sin(yaw) * s;
    if (okAt(pos.x + dx, pos.z)) pos.x += dx; if (okAt(pos.x, pos.z + dz)) pos.z += dz; }
  let d = null; const rc = new THREE.Raycaster(), v = new THREE.Vector2();
  canvas.addEventListener('pointerdown', e => { if (!ready) return; d = { lx: e.clientX, ly: e.clientY, m: 0 }; canvas.setPointerCapture(e.pointerId); });
  canvas.addEventListener('pointermove', e => { if (!d) return; const dx = e.clientX - d.lx, dy = e.clientY - d.ly; d.lx = e.clientX; d.ly = e.clientY; d.m += Math.abs(dx) + Math.abs(dy);
    yaw -= dx * .005; if (d.m > 8) walk(-dy * .012, 0); });
  canvas.addEventListener('pointerup', e => { if (d && d.m < 8) { v.set(e.clientX / innerWidth * 2 - 1, -(e.clientY / innerHeight) * 2 + 1); rc.setFromCamera(v, cam);
    const h = rc.intersectObjects(items)[0]; if (h) onPick(h.object.userData.product); } d = null; });
  function resize() { r.setSize(innerWidth, innerHeight, false); cam.aspect = innerWidth / innerHeight; cam.updateProjectionMatrix(); }
  addEventListener('resize', resize); resize();
  const clock = new THREE.Clock();
  r.setAnimationLoop(() => { const dt = Math.min(clock.getDelta(), .05);
    if (anim) { anim.t += dt; const k = Math.min(anim.t / 2, 1), e = k * k * (3 - 2 * k); pos.z = 18 + (9 - 18) * e; if (k >= 1) { anim = null; ready = true; glass.visible = false; } }
    else if (ready) { walk(((keys.f ? 1 : 0) - (keys.b ? 1 : 0)) * 3 * dt, 0); yaw += ((keys.l ? 1 : 0) - (keys.r ? 1 : 0)) * 1.6 * dt; }
    cam.position.copy(pos); cam.rotation.set(pitch, yaw, 0); r.render(scene, cam); });
  return {
    enter(skip) { if (matchMedia('(prefers-reduced-motion: reduce)').matches || skip) { pos.z = 9; ready = true; glass.visible = false; } else anim = { t: 0 }; },
    home() { pos.set(0, 1.6, 9); yaw = 0; }, key(k, on) { keys[k] = on; } };
}
