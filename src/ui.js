const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const money = n => 'Rs ' + Number(n).toLocaleString();
const DELIVERY = Number(import.meta.env.VITE_DELIVERY_FEE || 0);
let cart = JSON.parse(localStorage.getItem('ts_cart') || '[]');
const unit = p => p.salePrice ?? p.price;
const save = () => { localStorage.setItem('ts_cart', JSON.stringify(cart)); $('#cc').textContent = cart.reduce((a, i) => a + i.qty, 0); };
export function openProduct(p) {
  const m = $('#modal'), out = p.stock === 0;
  const stock = p.stock == null ? 'Stock not specified' : out ? 'Out of stock' : p.stock + ' in stock';
  m.innerHTML = `<div class="card"><button id="mx">← BACK TO SHOWROOM</button>
  ${p.demo ? '<p class="note">DEMO product: placeholder garment, not a real item.</p>' : ''}
  ${p.images?.[0] ? `<img src="${esc(p.images[0])}" loading="lazy" alt="${esc(p.name)}">` : '<img alt="" src="data:image/gif;base64,R0lGODlhAQABAAAAACw=">'}
  <h2>${esc(p.name)}</h2><p>${esc(p.description || '')}</p>
  <div class="row"><b>${p.salePrice != null ? `<s>${money(p.price)}</s> ${money(p.salePrice)}` : money(p.price)}</b><span class="note">${stock}</span></div>
  ${p.fabric ? `<p class="note">Fabric: ${esc(p.fabric)}</p>` : ''}
  <label>Size <select id="sz">${(p.sizes || []).map(s => `<option>${esc(s)}</option>`).join('')}</select></label>
  ${p.colors?.length ? `<label>Color <select id="cl">${p.colors.map(s => `<option>${esc(s)}</option>`).join('')}</select></label>` : ''}
  <div class="row"><button class="p" id="add" ${out || p.demo ? 'disabled' : ''}>ADD TO CART</button></div></div>`;
  m.hidden = false; $('#mx').onclick = () => m.hidden = true;
  $('#add').onclick = () => { const size = $('#sz')?.value, color = $('#cl')?.value, k = [p.id, size, color].join('|');
    const x = cart.find(i => i.k === k); x ? x.qty++ : cart.push({ k, id: p.id, name: p.name, price: unit(p), size, color, qty: 1 }); save(); m.hidden = true; };
}
function drawCart() {
  const c = $('#cartp'), sub = cart.reduce((a, i) => a + i.price * i.qty, 0);
  c.innerHTML = `<div class="card"><button id="cx">← BACK</button><h2>Cart</h2>${cart.length ? '' : '<p>Your cart is empty.</p>'}
  ${cart.map((i, n) => `<div class="row"><span>${esc(i.name)}<br><span class="note">${esc(i.size || '')} ${esc(i.color || '')}</span></span>
  <span><button data-q="${n}:-1">−</button> ${i.qty} <button data-q="${n}:1">+</button></span><span>${money(i.price * i.qty)}</span></div>`).join('')}
  <div class="row"><span>Subtotal</span><span>${money(sub)}</span></div><div class="row"><span>Delivery</span><span>${money(cart.length ? DELIVERY : 0)}</span></div>
  <div class="row"><b>Total (estimate)</b><b>${money(sub + (cart.length ? DELIVERY : 0))}</b></div>
  <button class="p" disabled>CHECKOUT, NOT YET IMPLEMENTED</button>
  <p class="note">Checkout needs a trusted backend (Cloud Function) to validate prices and stock. See README.</p></div>`;
  $('#cx').onclick = () => c.hidden = true;
  c.querySelectorAll('[data-q]').forEach(b => b.onclick = () => { const [n, d] = b.dataset.q.split(':').map(Number); cart[n].qty += d; if (cart[n].qty < 1) cart.splice(n, 1); save(); drawCart(); });
}
export function initCart() { save(); $('#cartb').onclick = () => { drawCart(); $('#cartp').hidden = false; }; }
