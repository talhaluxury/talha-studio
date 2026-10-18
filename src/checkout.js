import { fns, configured } from './firebase.js';
import { httpsCallable } from 'firebase/functions';
import { state, openAuth } from './auth.js';
import { esc, money } from './ui.js';
const $ = s => document.querySelector(s);
const info = (html) => { const P = $('#panel'); P.innerHTML = `<div class="card"><button id="px">← BACK</button>${html}</div>`; P.hidden = false; $('#px').onclick = () => P.hidden = true; };
export function openCheckout(cart, onDone, delivery) {
  if (!configured) return info('<h2>Checkout unavailable</h2><p>This store is not connected to Firebase yet, so orders cannot be placed.</p>');
  if (!cart.length) return info('<h2>Your cart is empty</h2>');
  if (!state.user) return openAuth(() => openCheckout(cart, onDone, delivery));
  const sub = cart.reduce((a, i) => a + i.price * i.qty, 0), P = $('#panel');
  P.innerHTML = `<div class="card"><button id="px">← BACK</button><h2>Checkout</h2>
  <div><input id="cn" placeholder="Full name" autocomplete="name" style="width:100%"><input id="cp" placeholder="Phone (0300 1234567)" inputmode="tel" autocomplete="tel" style="width:100%">
  <input id="ca" placeholder="Full delivery address" autocomplete="street-address" style="width:100%"><input id="cc2" placeholder="City" autocomplete="address-level2" style="width:100%"></div>
  <h3>Payment</h3><label><input type="radio" checked disabled> Cash on Delivery</label><br><label class="note"><input type="radio" disabled> Online payment (EasyPaisa / JazzCash): not available yet</label>
  <div class="row"><span>Subtotal (estimate)</span><span>${money(sub)}</span></div><div class="row"><span>Delivery (estimate)</span><span>${money(delivery)}</span></div>
  <p class="note">The final total is calculated by the server from current prices and stock.</p><p id="cerr" class="note" style="color:#e88"></p><button class="p" id="place">PLACE ORDER</button></div>`;
  P.hidden = false; $('#px').onclick = () => P.hidden = true;
  $('#place').onclick = async () => { const b = $('#place'), err = m => $('#cerr').textContent = m; err('');
    const address = { name: $('#cn').value, phone: $('#cp').value, address: $('#ca').value, city: $('#cc2').value };
    if (Object.values(address).some(v => !v.trim())) return err('Please fill in all fields.');
    b.disabled = true; b.textContent = 'PLACING ORDER...';
    try { const r = (await httpsCallable(fns, 'placeOrder')({ items: cart.map(i => ({ id: i.id, size: i.size || '', color: i.color || '', qty: i.qty })), address, payment: 'cod' })).data;
      onDone(); info(`<h2>Order placed</h2><p>Order no. <b>${esc(r.orderNo)}</b></p><p>Total to pay on delivery: <b>${money(r.total)}</b></p><p class="note">You can follow it under ORDERS.</p>`); }
    catch (e) { b.disabled = false; b.textContent = 'PLACE ORDER'; err(e.code === 'functions/unauthenticated' ? 'Please sign in again.' : e.code === 'functions/not-found' || e.code === 'functions/unavailable' ? 'Order service is not reachable. Please try later.' : (e.message || 'Could not place the order.')); } }; }
