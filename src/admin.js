import { db, storage } from './firebase.js';
import { collection, doc, getDocs, setDoc, deleteDoc, updateDoc, query, orderBy, limit, serverTimestamp } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { state } from './auth.js';
import { esc, money } from './ui.js';
const $ = s => document.querySelector(s);
const SECTIONS = ['men', 'women', 'unstitched', 'stitched', 'sale', 'new'], STATUSES = ['processing', 'shipped', 'delivered', 'cancelled'];
let tab = 'dash', products = [], orders = [], dirty = false;
const shell = body => { const P = $('#panel');
  P.innerHTML = `<div class="card" style="max-width:720px"><button id="px">← BACK</button> ${dirty ? '<button id="rl" class="p">RELOAD SHOWROOM</button>' : ''}<h2>Admin Panel</h2>
  <div class="row" style="justify-content:flex-start">${[['dash', 'DASHBOARD'], ['prod', 'PRODUCTS'], ['ord', 'ORDERS']].map(([k, t]) => `<button data-t="${k}" ${tab === k ? 'class="p"' : ''}>${t}</button>`).join('')}</div><div id="ab">${body}</div></div>`;
  P.hidden = false; $('#px').onclick = () => P.hidden = true; $('#rl')?.addEventListener('click', () => location.reload());
  P.querySelectorAll('[data-t]').forEach(b => b.onclick = () => { tab = b.dataset.t; render(); }); };
async function load() { const [ps, os] = await Promise.all([getDocs(collection(db, 'products')), getDocs(query(collection(db, 'orders'), orderBy('createdAt', 'desc'), limit(100)))]);
  products = ps.docs.map(d => ({ id: d.id, ...d.data() })); orders = os.docs.map(d => ({ id: d.id, ...d.data() })); }
export async function openAdmin() { const P = $('#panel');
  if (!state.admin) { P.innerHTML = '<div class="card"><button id="px">← BACK</button><h2>Admin only</h2><p>This account is not an admin.</p></div>'; P.hidden = false; $('#px').onclick = () => P.hidden = true; return; }
  shell('<p>Loading...</p>'); try { await load(); render(); } catch (e) { console.error(e); shell('<p>Could not load data. Check your connection and Firestore rules.</p>'); } }
function render() { if (tab === 'dash') dash(); else if (tab === 'prod') prodList(); else ordList(); }
function dash() { const live = orders.filter(o => o.status !== 'cancelled'), rev = live.reduce((a, o) => a + (o.total || 0), 0), cust = new Set(orders.map(o => o.uid)).size;
  shell(`<div class="row"><span>Products</span><b>${products.length}</b></div><div class="row"><span>Orders (latest 100)</span><b>${orders.length}</b></div><div class="row"><span>Customers (from those orders)</span><b>${cust}</b></div>
  <div class="row"><span>Revenue excl. cancelled (latest 100)</span><b>${money(rev)}</b></div><p class="note">Out of stock: ${products.filter(p => p.stock === 0).map(p => esc(p.name)).join(', ') || 'none'}</p>`); }
function prodList() { shell(`<div class="row"><b>${products.length} products</b><button class="p" id="np">ADD PRODUCT</button></div>${products.map(p => `<div class="row" style="border-top:1px solid #333;padding-top:8px"><span>${esc(p.name)}<br><span class="note">${esc(p.section)} · ${money(p.salePrice ?? p.price)} · stock ${p.stock ?? 'n/a'}${p.active === false ? ' · HIDDEN' : ''}</span></span><span><button data-e="${esc(p.id)}">EDIT</button></span></div>`).join('')}`);
  $('#np').onclick = () => form(null); document.querySelectorAll('[data-e]').forEach(b => b.onclick = () => form(products.find(p => p.id === b.dataset.e))); }
function form(p) { const v = p || { section: 'men', active: true, sizes: ['S', 'M', 'L'], images: [] };
  shell(`<h3>${p ? 'Edit' : 'New'} product</h3><div><input id="fn" placeholder="Name" value="${esc(v.name)}" style="width:100%"><select id="fs">${SECTIONS.map(s => `<option ${v.section === s ? 'selected' : ''}>${s}</option>`).join('')}</select>
  <input id="fp" type="number" min="0" placeholder="Price" value="${esc(v.price)}"><input id="fsp" type="number" min="0" placeholder="Sale price (optional)" value="${esc(v.salePrice)}"><input id="fst" type="number" min="0" step="1" placeholder="Stock (blank = not tracked)" value="${esc(v.stock)}">
  <input id="fz" placeholder="Sizes, comma separated" value="${esc((v.sizes || []).join(', '))}" style="width:100%"><input id="fc" placeholder="Colors, comma separated (Navy, Cream...)" value="${esc((v.colors || []).join(', '))}" style="width:100%"><input id="ff" placeholder="Fabric" value="${esc(v.fabric)}" style="width:100%">
  <textarea id="fd" placeholder="Description" rows="3" style="width:100%;font:inherit;background:#111;color:inherit;border:1px solid #444">${esc(v.description)}</textarea>
  <textarea id="fi" placeholder="Image URLs, one per line" rows="3" style="width:100%;font:inherit;background:#111;color:inherit;border:1px solid #444">${esc((v.images || []).join('\n'))}</textarea>
  ${storage ? '<label class="note">Upload photos (max 5 MB each) <input id="ffl" type="file" accept="image/*" multiple></label>' : '<p class="note">Storage bucket not configured: paste image URLs instead.</p>'}
  <label><input id="fnw" type="checkbox" ${v.isNew ? 'checked' : ''}> New arrival</label> <label><input id="fa" type="checkbox" ${v.active !== false ? 'checked' : ''}> Visible in store</label></div>
  <p id="ferr" class="note" style="color:#e88"></p><div class="row"><button class="p" id="fsv">SAVE</button>${p ? '<button id="fdl">DELETE</button>' : ''}<button id="fcn">CANCEL</button></div>`);
  $('#fcn').onclick = () => prodList(); const err = m => $('#ferr').textContent = m;
  if (p) $('#fdl').onclick = async () => { if (!confirm('Delete this product permanently?')) return; try { await deleteDoc(doc(db, 'products', p.id)); products = products.filter(x => x.id !== p.id); dirty = true; tab = 'prod'; render(); } catch (e) { console.error(e); err('Delete failed.'); } };
  $('#fsv').onclick = async () => { const num = x => x === '' ? null : Number(x), list = x => x.split(',').map(s => s.trim()).filter(Boolean);
    const name = $('#fn').value.trim(), price = num($('#fp').value), sale = num($('#fsp').value), stock = num($('#fst').value);
    if (!name) return err('Name is required.'); if (!(price > 0)) return err('Enter a valid price.'); if (sale != null && !(sale > 0 && sale < price)) return err('Sale price must be above 0 and below the price.');
    if (stock != null && !(Number.isInteger(stock) && stock >= 0)) return err('Stock must be a whole number, 0 or more.');
    const id = p ? p.id : doc(collection(db, 'products')).id, files = [...($('#ffl')?.files || [])];
    if (files.some(f => !f.type.startsWith('image/') || f.size > 5 * 1024 * 1024)) return err('Photos must be images under 5 MB.');
    $('#fsv').disabled = true; $('#fsv').textContent = 'SAVING...'; err('');
    try { const images = $('#fi').value.split('\n').map(s => s.trim()).filter(Boolean);
      for (const f of files) { const r = ref(storage, `products/${id}/${Date.now()}_${f.name.replace(/[^\w.-]/g, '_')}`); await uploadBytes(r, f); images.push(await getDownloadURL(r)); }
      const data = { name, section: $('#fs').value, price, sizes: list($('#fz').value), colors: list($('#fc').value), images, fabric: $('#ff').value.trim(), description: $('#fd').value.trim(), isNew: $('#fnw').checked, active: $('#fa').checked, updatedAt: serverTimestamp() };
      if (sale != null) data.salePrice = sale; if (stock != null) data.stock = stock;
      await setDoc(doc(db, 'products', id), data); const row = { ...data, id, updatedAt: null }; products = p ? products.map(x => x.id === id ? row : x) : [...products, row]; dirty = true; tab = 'prod'; render(); }
    catch (e) { console.error(e); $('#fsv').disabled = false; $('#fsv').textContent = 'SAVE'; err('Save failed: ' + (e.code === 'permission-denied' || e.code === 'storage/unauthorized' ? 'permission denied (are you signed in as admin?)' : 'check your connection.')); } }; }
function ordList() { shell(orders.length ? orders.map(o => `<div style="border-top:1px solid #333;padding:8px 0"><div class="row"><b>#${esc(o.orderNo)}</b><span>${money(o.total)}</span></div>
  <div class="note">${esc(o.createdAt?.toDate?.().toLocaleString() || '')}<br>${esc(o.address?.name)} · ${esc(o.address?.phone)}<br>${esc(o.address?.address)}, ${esc(o.address?.city)}<br>${(o.items || []).map(i => `${esc(i.name)} ×${i.qty} ${esc(i.size || '')} ${esc(i.color || '')}`).join('<br>')}</div>
  <select data-o="${esc(o.id)}">${STATUSES.map(s => `<option ${o.status === s ? 'selected' : ''}>${s}</option>`).join('')}</select></div>`).join('') : '<p>No orders yet.</p>');
  document.querySelectorAll('[data-o]').forEach(s => s.onchange = async () => { try { await updateDoc(doc(db, 'orders', s.dataset.o), { status: s.value }); orders.find(o => o.id === s.dataset.o).status = s.value; } catch (e) { console.error(e); alert('Could not update status.'); render(); } }); }
