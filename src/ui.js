const $ = s => document.querySelector(s);
export const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const money = n => 'Rs ' + Number(n).toLocaleString();
const DELIVERY = Number(import.meta.env.VITE_DELIVERY_FEE || 0);
let cart = JSON.parse(localStorage.getItem('ts_cart') || '[]');
export const hooks = { checkout: null };
export const clearCart = () => { cart = []; save(); };
const unit = p => p.salePrice ?? p.price;
const save = () => { localStorage.setItem('ts_cart', JSON.stringify(cart)); $('#cc').textContent = cart.reduce((a, i) => a + i.qty, 0); };
export function openProduct(p) {
  const m = $('#modal'), out = p.stock === 0;
  const stock = p.stock == null ? 'Stock not specified' : out ? 'Out of stock' : p.stock + ' in stock';
  m.innerHTML = `<div class="card"><button id="mx">← BACK TO SHOWROOM</button>
  ${p.demo ? '<p class="note">DEMO product: placeholder garment, not a real item.</p>' : ''}
  ${p.images?.[0] ? `<img id="mainimg" src="${esc(p.images[0])}" alt="${esc(p.name)}">` : '<img alt="" src="data:image/gif;base64,R0lGODlhAQABAAAAACw=">'}
  ${p.images?.length > 1 ? `<div class="row" style="justify-content:flex-start;overflow-x:auto">${p.images.map((u, n) => `<img data-th="${n}" src="${esc(u)}" loading="lazy" alt="" style="width:64px;aspect-ratio:3/4;flex:none;cursor:pointer">`).join('')}</div>` : ''}
  <h2>${esc(p.name)} ${p.isNew ? '<span class="note" style="border:1px solid var(--g);padding:2px 6px">NEW</span>' : ''} ${p.salePrice != null && p.price ? `<span class="note" style="border:1px solid var(--g);padding:2px 6px">${Math.round((1 - p.salePrice / p.price) * 100)}% OFF</span>` : ''}</h2><p>${esc(p.description || '')}</p>
  <div class="row"><b>${p.salePrice != null ? `<s>${money(p.price)}</s> ${money(p.salePrice)}` : money(p.price)}</b><span class="note">${stock}</span></div>
  ${p.fabric ? `<p class="note">Fabric: ${esc(p.fabric)}</p>` : ''}
  <label>Size <select id="sz">${(p.sizes || []).map(s => `<option>${esc(s)}</option>`).join('')}</select></label>
  ${p.colors?.length ? `<label>Color <select id="cl">${p.colors.map(s => `<option>${esc(s)}</option>`).join('')}</select></label>` : ''}
  <div class="row"><button class="p" id="add" ${out || p.demo ? 'disabled' : ''}>ADD TO CART</button></div></div>`;
  m.hidden = false; $('#mx').onclick = () => m.hidden = true;
  m.querySelectorAll('[data-th]').forEach(t => t.onclick = () => { $('#mainimg').src = t.src; });
  $('#add').onclick = () => { const size = $('#sz')?.value, color = $('#cl')?.value, k = [p.id, size, color].join('|');
    const x = cart.find(i => i.k === k), inCart = cart.filter(i => i.id === p.id).reduce((a, i) => a + i.qty, 0);
    if (p.stock != null && inCart + 1 > p.stock) { $('#add').textContent = 'ONLY ' + p.stock + ' IN STOCK'; return; }
    x ? x.qty++ : cart.push({ k, id: p.id, name: p.name, price: unit(p), size, color, qty: 1 }); save(); m.hidden = true; };
}
function drawCart() {
  const c = $('#cartp'), sub = cart.reduce((a, i) => a + i.price * i.qty, 0);
  c.innerHTML = `<div class="card"><button id="cx">← BACK</button><h2>Cart</h2>${cart.length ? '' : '<p>Your cart is empty.</p>'}
  ${cart.map((i, n) => `<div class="row"><span>${esc(i.name)}<br><span class="note">${esc(i.size || '')} ${esc(i.color || '')}</span></span>
  <span><button data-q="${n}:-1">−</button> ${i.qty} <button data-q="${n}:1">+</button></span><span>${money(i.price * i.qty)}</span></div>`).join('')}
  <div class="row"><span>Subtotal</span><span>${money(sub)}</span></div><div class="row"><span>Delivery</span><span>${money(cart.length ? DELIVERY : 0)}</span></div>
  <div class="row"><b>Total (estimate)</b><b>${money(sub + (cart.length ? DELIVERY : 0))}</b></div>
  <button class="p" id="co" ${cart.length ? '' : 'disabled'}>CHECKOUT</button>
  <p class="note">Cash on Delivery. Prices and stock are confirmed by the server when you place the order.</p></div>`;
  $('#cx').onclick = () => c.hidden = true;
  $('#co').onclick = () => { c.hidden = true; hooks.checkout?.(cart.map(i => ({ ...i })), clearCart, DELIVERY); };
  c.querySelectorAll('[data-q]').forEach(b => b.onclick = () => { const [n, d] = b.dataset.q.split(':').map(Number); cart[n].qty += d; if (cart[n].qty < 1) cart.splice(n, 1); save(); drawCart(); });
}
export function initCart() { save(); $('#cartb').onclick = () => { drawCart(); $('#cartp').hidden = false; }; }
