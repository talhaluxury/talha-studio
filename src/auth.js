import { auth, db } from './firebase.js';
import { doc, getDoc } from 'firebase/firestore';
import { onAuthStateChanged, signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut, sendPasswordResetEmail } from 'firebase/auth';
import { esc } from './ui.js';
const $ = s => document.querySelector(s);
export const state = { user: null, admin: false };
const subs = []; export const onUser = f => subs.push(f);
export function initAuth() { if (!auth) return;
  onAuthStateChanged(auth, async u => { state.user = u; state.admin = false;
    if (u) { try { state.admin = (await u.getIdTokenResult()).claims.admin === true; } catch (e) { console.error(e); }
      if (!state.admin && db) { try { state.admin = (await getDoc(doc(db, 'admins', u.uid))).exists(); } catch (e) { /* not an admin, or offline */ } } } // UI flag only; the real check is in the Firestore/Storage rules
    subs.forEach(f => f(state)); }); }
const MSG = { 'auth/invalid-credential': 'Wrong email or password.', 'auth/user-not-found': 'No account with this email.', 'auth/wrong-password': 'Wrong email or password.', 'auth/email-already-in-use': 'An account with this email already exists.',
  'auth/weak-password': 'Password must be at least 6 characters.', 'auth/invalid-email': 'Please enter a valid email.', 'auth/too-many-requests': 'Too many attempts. Please wait and try again.', 'auth/network-request-failed': 'No internet connection.' };
export const logout = () => signOut(auth);
export function openAuth(then) { const P = $('#panel');
  P.innerHTML = `<div class="card"><button id="ax">← BACK</button><h2>Sign in</h2>
  <div><input id="ae" type="email" placeholder="Email" autocomplete="email" style="width:100%"><input id="ap" type="password" placeholder="Password" autocomplete="current-password" style="width:100%"></div>
  <p id="aerr" class="note" style="color:#e88"></p>
  <div class="row"><button class="p" id="ain">SIGN IN</button><button id="aup">CREATE ACCOUNT</button></div><p><button id="arst" style="border:0;padding:0;text-decoration:underline">Forgot password?</button></p></div>`;
  P.hidden = false; const err = m => $('#aerr').textContent = m, creds = () => [$('#ae').value.trim(), $('#ap').value];
  $('#ax').onclick = () => P.hidden = true;
  const run = async f => { const [e, p] = creds(); if (!e || !p) return err('Enter email and password.'); err(''); try { await f(e, p); P.hidden = true; then?.(); } catch (x) { err(MSG[x.code] || 'Something went wrong. Please try again.'); } };
  $('#ain').onclick = () => run((e, p) => signInWithEmailAndPassword(auth, e, p));
  $('#aup').onclick = () => run((e, p) => createUserWithEmailAndPassword(auth, e, p));
  $('#arst').onclick = async () => { const e = $('#ae').value.trim(); if (!e) return err('Enter your email first.'); try { await sendPasswordResetEmail(auth, e); err('Password reset email sent (check spam too).'); } catch (x) { err(MSG[x.code] || 'Could not send reset email.'); } }; }
export function openAccount() { const P = $('#panel'), u = state.user;
  P.innerHTML = `<div class="card"><button id="ax">← BACK</button><h2>Account</h2><p>${esc(u.email)}</p>${state.admin ? '<p class="note">Admin account</p>' : ''}<button id="lo">SIGN OUT</button></div>`; P.hidden = false;
  $('#ax').onclick = () => P.hidden = true; $('#lo').onclick = async () => { await logout(); P.hidden = true; }; }
