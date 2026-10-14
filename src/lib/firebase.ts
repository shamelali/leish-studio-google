/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { initializeApp, getApps, getApp } from 'firebase/app';
import { 
  getAuth, 
  signInWithPopup, 
  GoogleAuthProvider, 
  onAuthStateChanged, 
  signOut,
  User 
} from 'firebase/auth';
import { getFirestore, doc, getDocFromServer } from 'firebase/firestore';
// Firebase config: prefer env vars (set in Vercel dashboard / CI secrets).
// In production VITE_FIREBASE_* must be configured; without them Firebase will not
// initialise and the app runs in degraded mode (workspace features disabled).
// The local firebase-applet-config.json is kept on disk for local dev only and is
// gitignored so it won't be deployed.
let firebaseConfig;  // declared here so TS knows the name
try {
  // @ts-ignore
  if (import.meta.env.VITE_FIREBASE_API_KEY) {
    firebaseConfig = {
      // @ts-ignore
      apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
      // @ts-ignore
      authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
      // @ts-ignore
      projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
      // @ts-ignore
      storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
      // @ts-ignore
      messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
      // @ts-ignore
      appId: import.meta.env.VITE_FIREBASE_APP_ID,
      // @ts-ignore
      measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID,
    };
  }
} catch {}

const firebaseConfigured = Boolean(firebaseConfig?.apiKey && firebaseConfig?.projectId && firebaseConfig?.appId);
const app = firebaseConfigured ? (getApps().length ? getApp() : initializeApp(firebaseConfig)) : null;

// Firebase is optional for the local JSON-backed marketplace. Do not create an
// app with an empty config: that causes auth/invalid-api-key during startup.
export const auth = app ? getAuth(app) : null;
export const db = app ? getFirestore(app) : null;

// Configure Google Auth Provider with requested Google Workspace scopes
export const googleProvider = new GoogleAuthProvider();
googleProvider.addScope('https://www.googleapis.com/auth/drive.readonly');
googleProvider.addScope('https://www.googleapis.com/auth/drive.file');
googleProvider.addScope('https://www.googleapis.com/auth/gmail.send');
googleProvider.addScope('https://www.googleapis.com/auth/gmail.readonly');
googleProvider.addScope('https://www.googleapis.com/auth/documents.readonly');
googleProvider.addScope('https://www.googleapis.com/auth/forms.responses.readonly');
googleProvider.addScope('https://www.googleapis.com/auth/tasks');
googleProvider.addScope('https://www.googleapis.com/auth/contacts.readonly');
googleProvider.addScope('https://www.googleapis.com/auth/chat.spaces');
// The Workspace UI lists and creates masterclass courses, so the full courses
// scope is the minimum Classroom permission that covers both actions.
googleProvider.addScope('https://www.googleapis.com/auth/classroom.courses');

// In-memory token cache (never stored in localStorage/sessionStorage)
let cachedAccessToken: string | null = null;
let isSigningIn = false;

// Test connection on startup per firebase skill guidelines
async function testFirestoreConnection() {
  if (!db) return;
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
  } catch (error: any) {
    if (error instanceof Error && error.message.includes('the client is offline')) {
      console.warn('[Firebase] Firestore client offline check:', error.message);
    }
  }
}
testFirestoreConnection();

/**
 * Initialize Auth Listener
 */
export const initAuth = (
  onAuthSuccess?: (user: User, token: string) => void,
  onAuthFailure?: () => void
) => {
  if (!auth) {
    onAuthFailure?.();
    return () => {};
  }
  return onAuthStateChanged(auth, async (user: User | null) => {
    if (user) {
      if (cachedAccessToken) {
        if (onAuthSuccess) onAuthSuccess(user, cachedAccessToken);
      } else if (!isSigningIn) {
        // User exists from Firebase session; token can be requested upon user action
        if (onAuthSuccess && cachedAccessToken) {
          onAuthSuccess(user, cachedAccessToken);
        }
      }
    } else {
      cachedAccessToken = null;
      if (onAuthFailure) onAuthFailure();
    }
  });
};

/**
 * Google Sign In via popup
 */
export const googleSignIn = async (): Promise<{ user: User; accessToken: string } | null> => {
  if (!auth) return null;
  try {
    isSigningIn = true;
    const result = await signInWithPopup(auth, googleProvider);
    const credential = GoogleAuthProvider.credentialFromResult(result);
    if (!credential?.accessToken) {
      // Still return user even if provider token is restricted
      cachedAccessToken = await result.user.getIdToken();
      return { user: result.user, accessToken: cachedAccessToken };
    }

    cachedAccessToken = credential.accessToken;
    return { user: result.user, accessToken: cachedAccessToken };
  } catch (error: any) {
    console.error('[Firebase Auth] Sign in error:', error);
    throw error;
  } finally {
    isSigningIn = false;
  }
};

/**
 * Get in-memory Access Token
 */
export const getAccessToken = async (): Promise<string | null> => {
  return cachedAccessToken;
};

/**
 * Sign out and clear cached token
 */
export const logoutFirebase = async () => {
  if (auth) await signOut(auth);
  cachedAccessToken = null;
};
