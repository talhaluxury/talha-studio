import { initializeApp } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';
const e = import.meta.env;
const cfg = { apiKey: e.VITE_FB_API_KEY, authDomain: e.VITE_FB_AUTH_DOMAIN, projectId: e.VITE_FB_PROJECT_ID, storageBucket: e.VITE_FB_STORAGE_BUCKET, appId: e.VITE_FB_APP_ID };
export const configured = !!cfg.projectId;
export const db = configured ? getFirestore(initializeApp(cfg)) : null;
