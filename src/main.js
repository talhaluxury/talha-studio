import { createShowroom } from './showroom.js';
import { loadProducts } from './data.js';
import { openProduct, initCart, hooks } from './ui.js';
import { auth } from './firebase.js';
import { initAuth, onUser, openAuth, openAccount, state } from './auth.js';
import { openCheckout } from './checkout.js';
import { openOrders } from './orders.js';
import { openAdmin } from './admin.js';
const $ = s => document.querySelector(s);
async function start() {
  let res;
  try { res = await loadProducts(); } catch (e) { console.error(e); $('#intro').insertAdjacentHTML('afterbegin', '<p>Could not load products. <button onclick="location.reload()">RETRY</button></p>'); return; }
  let sr;
  try { sr = createShowroom($('#c'), res.products, openProduct); }
  catch (e) { console.error(e); $('#intro').innerHTML = '<h1>TALHA STUDIO</h1><p>3D view is not supported on this device.</p><ul style="list-style:none;padding:0">' + res.products.map(p => `<li>${p.name}</li>`).join('') + '</ul>'; return; } // minimal fallback list
  initCart(); hooks.checkout = openCheckout;
  if (!auth) $('#acc').hidden = true; // Firebase not configured: no accounts
  onUser(() => { $('#acc').textContent = state.user ? 'ACCOUNT' : 'SIGN IN'; $('#ordb').hidden = !state.user; $('#adm').hidden = !state.admin; });
  $('#acc').onclick = () => state.user ? openAccount() : openAuth(); $('#ordb').onclick = openOrders; $('#adm').onclick = openAdmin; initAuth();
  const go = skip => { $('#intro').classList.add('hide'); $('#top').style.display = 'flex'; $('#hud').style.display = 'flex'; $('#hint').style.display = 'block'; sr.enter(skip); };
  $('#enter').onclick = () => go(false); $('#skip').onclick = () => go(true);
  $('#home').onclick = () => sr.home(); $('#hh').onclick = () => $('#hint').style.display = 'none';
  document.querySelectorAll('[data-a]').forEach(b => { const k = b.dataset.a;
    b.onpointerdown = () => sr.key(k, true); b.onpointerup = b.onpointerleave = b.onpointercancel = () => sr.key(k, false); });
}
start();
