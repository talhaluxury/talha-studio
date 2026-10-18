import { initializeApp } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';
import { getAuth } from 'firebase/auth';
import { getStorage } from 'firebase/storage';
import { getFunctions } from 'firebase/functions';
const e = import.meta.env;
const cfg = { apiKey: e.VITE_FB_API_KEY, authDomain: e.VITE_FB_AUTH_DOMAIN, projectId: e.VITE_FB_PROJECT_ID, storageBucket: e.VITE_FB_STORAGE_BUCKET, appId: e.VITE_FB_APP_ID };
export const configured = !!cfg.projectId;
const app = configured ? initializeApp(cfg) : null;
export const db = app ? getFirestore(app) : null;
export const auth = app ? getAuth(app) : null;
export const storage = app && cfg.storageBucket ? getStorage(app) : null;
export const fns = app ? getFunctions(app, 'us-central1') : null; // region must match functions/index.js
