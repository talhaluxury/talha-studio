import { db } from './firebase.js';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { state } from './auth.js';
import { esc, money } from './ui.js';
const $ = s => document.querySelector(s);
export async function openOrders() { const P = $('#panel');
  P.innerHTML = '<div class="card"><button id="px">← BACK</button><h2>My Orders</h2><p id="ol">Loading...</p></div>'; P.hidden = false; $('#px').onclick = () => P.hidden = true;
  try { const s = await getDocs(query(collection(db, 'orders'), where('uid', '==', state.user.uid)));
    const list = s.docs.map(d => ({ id: d.id, ...d.data() })).sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
    $('#ol').outerHTML = list.length ? list.map(o => `<div class="row" style="align-items:flex-start;border-top:1px solid #333;padding-top:8px"><span><b>#${esc(o.orderNo)}</b><br><span class="note">${esc(o.createdAt?.toDate?.().toLocaleDateString() || '')}<br>${(o.items || []).map(i => `${esc(i.name)} ×${i.qty} ${esc(i.size || '')}`).join('<br>')}</span></span><span style="text-align:right">${money(o.total)}<br><span class="note">${esc(o.status)}</span></span></div>`).join('') : '<p>No orders yet.</p>'; }
  catch (e) { console.error(e); $('#ol').textContent = 'Could not load orders. Check your connection.'; } }
