import { onRequest } from "firebase-functions/v2/https";
import { setGlobalOptions } from "firebase-functions/v2";
import { createApp } from "../../server.ts";

/**
 * Bridge Firebase Functions runtime config into process.env so the existing
 * Express app (server.ts) can read JWT_SECRET, GEMINI_API_KEY, STORE_BACKEND
 * and NODE_ENV exactly as it does locally / on other platforms.
 *
 * `firebase functions:config:set jwt.secret=...` → functions.config().jwt.secret
 */
setGlobalOptions({ region: "us-central1" });

const cfg = (() => {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { functions } = require("firebase-functions/v2");
    return functions.config() as Record<string, Record<string, string>> | undefined;
  } catch {
    return undefined;
  }
})();

function injectConfig() {
  if (!cfg) return;
  for (const [section, values] of Object.entries(cfg)) {
    if (typeof values !== "object" || values === null) continue;
    for (const [key, val] of Object.entries(values)) {
      const envKey = `${section.toUpperCase()}_${key.toUpperCase()}`;
      if (val && !process.env[envKey]) {
        process.env[envKey] = val;
      }
    }
  }
}

injectConfig();

/**
 * Firebase Cloud Function entry point.
 *
 * Firebase Hosting rewrites /api/** and /healthz to this function.
 * The Express app (server.ts) mounts all /api/* routes, so a single
 * onRequest handler covers the entire API surface.
 */
export const api = onRequest(
  {
    timeoutSeconds: 60,
    memory: "256MiB",
    minInstances: 0,
  },
  createApp()
);
