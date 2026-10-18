import { createShowroom } from './showroom.js';
import { loadProducts } from './data.js';
import { openProduct, initCart } from './ui.js';
const $ = s => document.querySelector(s);
async function start() {
  let res;
  try { res = await loadProducts(); } catch (e) { console.error(e); $('#intro').insertAdjacentHTML('afterbegin', '<p>Could not load products. <button onclick="location.reload()">RETRY</button></p>'); return; }
  let glb = null; try { const u = import.meta.env.BASE_URL + 'models/store.glb', h = await fetch(u, { method: 'HEAD' }); if (h.ok && !(h.headers.get('content-type') || '').includes('html')) glb = u; } catch (e) {}
  let sr;
  try { sr = createShowroom($('#c'), res.products, openProduct, { glb }); }
  catch (e) { console.error(e); $('#intro').innerHTML = '<h1>TALHA STUDIO</h1><p>3D view is not supported on this device.</p><ul style="list-style:none;padding:0">' + res.products.map(p => `<li>${p.name}</li>`).join('') + '</ul>'; return; } // minimal fallback list
  initCart();
  const go = skip => { $('#intro').classList.add('hide'); $('#top').style.display = 'flex'; $('#hud').style.display = 'flex'; $('#hint').style.display = 'block'; sr.enter(skip); };
  $('#enter').onclick = () => go(false); $('#skip').onclick = () => go(true);
  $('#home').onclick = () => sr.home(); $('#hh').onclick = () => $('#hint').style.display = 'none';
  document.querySelectorAll('[data-a]').forEach(b => { const k = b.dataset.a;
    b.onpointerdown = () => sr.key(k, true); b.onpointerup = b.onpointerleave = b.onpointercancel = () => sr.key(k, false); });
}
start();
