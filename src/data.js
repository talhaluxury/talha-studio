import { db } from './firebase.js';
import { collection, getDocs } from 'firebase/firestore';
// Demo data only: shown when Firebase is NOT configured. Flagged demo:true in the UI.
const D = (id, name, section, price, salePrice, extra = {}) => ({ id, name, section, price, salePrice, sizes: ['S', 'M', 'L'], demo: true, ...extra });
export const demo = [
  D('d1', 'Demo Kurta A', 'men', 6500), D('d2', 'Demo Kurta B', 'men', 7200, 5900), D('d3', 'Demo Waistcoat', 'men', 9800),
  D('d4', 'Demo 3-Piece A', 'women', 14500), D('d5', 'Demo Embroidered', 'women', 18900), D('d6', 'Demo Ready-to-wear', 'women', 8900),
  D('d7', 'Demo Unstitched Lawn', 'unstitched', 5200), D('d8', 'Demo Unstitched Wash&Wear', 'unstitched', 4600),
  D('d9', 'Demo Sale Suit', 'sale', 9000, 6300),
  D('d10', 'Demo Stitched Suit', 'stitched', 11200, undefined, { colors: ['Navy'] }), D('d11', 'Demo New Kurta', 'men', 7800, undefined, { isNew: true, colors: ['Cream'] }), D('d12', 'Demo New Lawn', 'unstitched', 5600, undefined, { isNew: true, colors: ['Mint'] })];
export async function loadProducts() {
  if (!db) return { products: demo, demo: true };
  const s = await getDocs(collection(db, 'products')); // throws on network error; caller shows retry
  return { products: s.docs.map(d => ({ id: d.id, ...d.data() })).filter(p => p.active !== false), demo: false };
}
