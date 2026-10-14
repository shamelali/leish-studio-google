# Firestore setup guide

This guide configures the **server-side** Firestore backend. It does not
perform a live migration or change production data. Keep `STORE_BACKEND=json`
until the Firestore adapter has been tested against a disposable project or
the local emulator.

## Environment

Set these variables only in the server/deployment environment:

```dotenv
STORE_BACKEND=firestore
FIREBASE_PROJECT_ID=your-gcp-project-id
# Optional for local development:
# FIRESTORE_EMULATOR_HOST=127.0.0.1:8080
```

The Firebase Admin SDK uses Application Default Credentials (ADC). In a
Google-managed runtime, use the runtime service account. For local development
or another server environment, set `GOOGLE_APPLICATION_CREDENTIALS` to the
absolute path of a server-only service-account JSON file:

```dotenv
GOOGLE_APPLICATION_CREDENTIALS=/absolute/path/to/service-account.json
```

Do not commit the credential file, paste its contents into `.env` or logs, or
expose it through any `VITE_*` variable. `FIREBASE_PROJECT_ID` is explicit so
the server cannot accidentally connect to a similarly named project.

## Local emulator

From the project root, install dependencies once, then start the Firestore
emulator with the disposable `leish-local` project ID (keep this terminal open):

```bash
pnpm install
pnpm run emulator:firestore
```

The package script pins Firebase CLI `13.35.1` for repeatable emulator startup.

In a second terminal, from the same project root, **explicitly** seed the
running emulator from the existing `db_store.json` development store:

```bash
pnpm run seed:firestore
```

The seed command sets `FIRESTORE_EMULATOR_HOST=127.0.0.1:8080` (without
`http://`) and `FIREBASE_PROJECT_ID=leish-local`. The script requires these
exact values, uses no credentials, and refuses a nonempty emulator instead of
overwriting data. Stop and restart the emulator without a data import to seed
again. This command is never run by app startup or production deployment.
The JSON file includes demo users and bcrypt password hashes; use only local
development data here. To run the server against the seeded emulator, use a
third terminal:

```bash
STORE_BACKEND=firestore FIREBASE_PROJECT_ID=leish-local FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 pnpm run dev
```

The emulator is the preferred first verification target. No credentials are
needed with the emulator, but the server still requires the explicit project ID.

## Rules and client access

The web client does not need direct Firestore access for this application. Keep
Firestore client rules deny-by-default, for example:

```text
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /{document=**} {
      allow read, write: if false;
    }
  }
}
```

The Firebase Admin SDK used by the API is not restricted by client security
rules; protect the API with its existing authentication and authorization
checks and keep credentials server-only.

## Switching back

Set `STORE_BACKEND=json` (or remove the variable) to use the existing local
JSON store. This guide intentionally provides no migration or live-change
procedure. Back up and separately plan any future data migration before
changing a deployed backend.
