# @guettonenrique/passwordless-auth

Passwordless **email OTP** authentication for HouseVenture in one package
with three entry points:

- **`/functions`** — ready-to-register Firebase Cloud Function factories for
  sending codes, verifying codes, and scheduled cleanup.
- **`/react-native`** — the mobile API layer plus `OtpInput` (auto-fill code
  boxes) and `EmailOtpModal` (the full two-step dialog).
- **`/shared`** — the single source of truth for constants, types, validation,
  and the email template. Pure TypeScript with no SDK imports.

The React Native entry point is optional. The backend functions can be used
without installing the package in the client, allowing the app to own the
email form, OTP input, modal, styling, resend timer, and error handling.

The security model is baked in and tested: HMAC-SHA256 hashed codes keyed with a
server-side secret (never plaintext), timing-safe comparison, single-use codes
deleted inside the verify transaction, a five-attempt brute-force cap, a
60-second resend cooldown, 10-minute expiry, and client-side access to the OTP
collection blocked by rules.

> **v0.1** — first publish. API may still change; breaking changes allowed until 1.0.

---

## Quick start

### Backend

1. **Install** the package: `npm install @guettonenrique/passwordless-auth`.
2. **Register the three functions**:

   ```typescript
   // callable/requestEmailOtp.ts
   import { defineSecret } from "firebase-functions/params";
   import { createRequestEmailOtp } from "@guettonenrique/passwordless-auth/functions";

   exports.requestEmailOtp = createRequestEmailOtp({
     appName: "MyApp",
     secret: defineSecret("OTP_SECRET"),
     enforceAppCheck: false, // flip to true in production once App Check is set up
     sendgrid: {
       apiKey: defineSecret("SENDGRID_API_KEY"),
       fromEmail,
       fromName,
     },
     // Or for testing without SendGrid:
     // sendEmail: async (email) => {
     //   console.log(`[DEV OTP] ${email.to} → ${email.subject}`);
     // },
   });
   ```

   ```typescript
   // callable/verifyEmailOtp.ts
   import { defineSecret } from "firebase-functions/params";
   import { createVerifyEmailOtp } from "@guettonenrique/passwordless-auth/functions";

   exports.verifyEmailOtp = createVerifyEmailOtp({
     secret: defineSecret("OTP_SECRET"),
     enforceAppCheck: false, // flip to true in production once App Check is set up
     provision: async (email) => {
       // Your user provisioning schema.
       const { user } = await resolveOrCreateUser(email, {
         emailVerified: true,
       });
       return user.uid;
     },
   });
   ```

   ```typescript
   // schedule/cleanupExpiredOtps.ts
   import { createCleanupExpiredOtps } from "@guettonenrique/passwordless-auth/functions";

   exports.cleanupExpiredOtps = createCleanupExpiredOtps();
   ```

3. **REQUIRED — Lock down the OTP collection** in your Firestore rules:

   > [!CAUTION]
   > **Required for security.** Because Cloud Functions use the Admin SDK, clients never need access to `auth_otps` (or your custom `collection`). Leaving this collection readable or writable to clients is a critical security risk. This package has no access to deploying Firestore rules, so this crucial step is your responsibility.

   ```javascript
   // Auth OTP documents are maintained exclusively by backend Cloud Functions.
   // Users don't need any kind of access to this collection.
   match /auth_otps/{document=**} {
     allow read, write: if false;
   }
   ```

4. **Deploy both functions and rules**: `firebase deploy --only functions,firestore:rules`

### Mobile

1. **Install** the package: `npm install @guettonenrique/passwordless-auth`.
2. **Add the modal** to your auth screen:

   ```tsx
   import { EmailOtpModal } from '@guettonenrique/passwordless-auth/react-native';

   const [otpVisible, setOtpVisible] = useState(false);

   <TouchableOpacity onPress={() => setOtpVisible(true)}>
     <Text>Continue with email code</Text>
   </TouchableOpacity>

   <EmailOtpModal visible={otpVisible} onClose={() => setOtpVisible(false)} />
   ```

   That's the entire integration. On success the modal closes and your existing `onAuthStateChanged` listener flips the app into the signed-in state — no navigation code needed.

3. **Optional:** use `OtpInput` + the API functions directly if you want to build a custom dialog.

The package never touches your auth state, navigation, user schema, or email
infrastructure beyond what you explicitly configure.

### Client-owned UI (without `/react-native`)

You can omit the package from the client entirely and call the deployed
Firebase callable functions with the app's existing Firebase dependencies.
The client flow is:

1. Call `requestEmailOtp` with the normalized email.
2. Collect the six-digit code in your own UI.
3. Call `verifyEmailOtp` with the email and code.
4. Read `customToken` from the response.
5. Sign in with Firebase Auth using `signInWithCustomToken`.

With React Native Firebase, the direct implementation looks like this:

```typescript
import { getAuth, signInWithCustomToken } from "@react-native-firebase/auth";
import { getFunctions, httpsCallable } from "@react-native-firebase/functions";

type VerifyOtpResponse = { customToken: string };

const requestEmailOtp = httpsCallable<
  { email: string },
  { status: string; message: string }
>(getFunctions(), "requestEmailOtp");
const verifyEmailOtp = httpsCallable<
  { email: string; code: string },
  VerifyOtpResponse
>(getFunctions(), "verifyEmailOtp");

await requestEmailOtp({ email: email.trim().toLowerCase() });

const result = await verifyEmailOtp({
  email: email.trim().toLowerCase(),
  code: code.trim(),
});

await signInWithCustomToken(getAuth(), result.data.customToken);
```

The callable names and payloads must match the deployed backend functions.
The package's `/shared` entry can still be used separately for shared
constants and validation, but it is not required by the client.

---

## Package overview

### Backend (`/functions`)

Three factory functions return ready-to-deploy Firebase Cloud Functions:

| Factory                    | What it handles                                                                                                                                                                                                               |
| -------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `createRequestEmailOtp`    | Email validation, 60 s resend cooldown, cryptographically secure 6-digit code generation, HMAC-SHA256 hashing (`email:code`), Firestore write, email dispatch (SendGrid default or custom sender), structured error responses |
| `createVerifyEmailOtp`     | Code lookup, timing-safe hash comparison, expiry check, 5-attempt brute-force cap, single-use deletion inside a Firestore transaction, user provisioning (delegated to your hook), Firebase custom token minting              |
| `createCleanupExpiredOtps` | Scheduled (every 15 min) drain-loop that deletes orphaned OTP docs (users who requested but never entered a code)                                                                                                             |

### Mobile (`/react-native`)

The mobile entry point provides the API layer and UI components:

| Export                            | What it does                                                                                                                                                                                   |
| --------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `requestEmailOtp(email)`          | Calls the backend, returns `{ status, message }`                                                                                                                                               |
| `verifyEmailOtp(email, code)`     | Calls the backend, returns the Firebase custom token                                                                                                                                           |
| `signInWithEmailOtp(email, code)` | Verifies + `signInWithCustomToken` — one call, user is signed in                                                                                                                               |
| `<OtpInput />`                    | 6-slot auto-fill code input (paste, iOS `oneTimeCode` / Android `one-time-code`, haptics, auto-submit on completion)                                                                           |
| `<EmailOtpModal />`               | Full two-step dialog (email → code) with cooldown countdown, resend, error banner, double-submit guard. On success the modal closes and your existing `onAuthStateChanged` listener takes over |

### Shared (`/shared`)

Constants, types, email template, and validation utilities. This entry point
is pure TypeScript with no SDK imports, keeping the backend and mobile
contracts in sync.

### Security model

- Codes are HMAC-SHA256 hashed with a server-side secret before storage — plaintext never touches Firestore
- Timing-safe comparison prevents hash-timing attacks
- Single-use: the doc is deleted inside the verify transaction (concurrent verifies → one winner)
- 5-attempt cap per code, then the doc is destroyed
- Atomic 60-second resend cooldown (enforced inside a Firestore transaction), 10-minute code expiry, and hash-verified cleanup on delivery failure
- **Required Firestore rule**: the consuming project must block all client-side access to the OTP collection in `firestore.rules` (only the Admin SDK in Cloud Functions should ever read or write it)
- App Check enforcement is a one-flag option (`enforceAppCheck: true`)

---

## Installation

```bash
npm install @guettonenrique/passwordless-auth
```

Install the peer packages required by the entry point you use (kept out of top-level `peerDependencies` so backend and mobile projects only install their own stack):

| Entry           | Required in the consuming project                                                                                                                                                                            |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `/functions`    | `firebase-functions >=4`, `firebase-admin >=11`, `@sendgrid/mail >=8` (or pass a custom sender)                                                                                                              |
| `/react-native` | `@react-native-firebase/app + auth + functions >=17`, `react >=18`, `react-native >=0.73`, `react-native-keyboard-controller >=1`, `lucide-react-native >=0.300`; optional: `expo-haptics` (haptic feedback) |

---

## Backend setup (Firebase Cloud Functions, TypeScript)

### 1. Register the three functions

```typescript
// callable/requestEmailOtp.ts
import { defineSecret } from "firebase-functions/params";
import { createRequestEmailOtp } from "@guettonenrique/passwordless-auth/functions";

const otpSecret = defineSecret("OTP_SECRET");
const sendgridKey = defineSecret("SENDGRID_API_KEY");

exports.requestEmailOtp = createRequestEmailOtp({
  appName: "MyApp",
  secret: otpSecret, // a params Secret works directly and is auto-bound on the function
  enforceAppCheck: false, // flip to true in production once App Check is set up
  sendgrid: {
    apiKey: sendgridKey, // a params Secret works directly and is auto-bound on the function
    fromEmail: "no-reply@yourdomain.com",
    fromName: "MyApp Support",
  },
});
```

```typescript
// callable/verifyEmailOtp.ts
import { defineSecret } from "firebase-functions/params";
import { createVerifyEmailOtp } from "@guettonenrique/passwordless-auth/functions";
import { resolveOrCreateUser } from "../utils/yourUserProvisioning";

const otpSecret = defineSecret("OTP_SECRET");

// The one project-specific hook: resolve or create the user, return the uid.
const provision = async (email: string): Promise<string> => {
  const { user } = await resolveOrCreateUser(email, { emailVerified: true });
  return user.uid;
};

exports.verifyEmailOtp = createVerifyEmailOtp({
  secret: otpSecret,
  enforceAppCheck: false, // flip to true in production once App Check is set up
  provision,
});
```

```typescript
// schedule/cleanupExpiredOtps.ts
import { createCleanupExpiredOtps } from "@guettonenrique/passwordless-auth/functions";

// Reaps expired docs (orphans from users who never entered the code).
exports.cleanupExpiredOtps = createCleanupExpiredOtps();
```

`secret` and `apiKey` accept a `defineSecret(...)` object directly — the
factory resolves them per call, which is what makes Firebase secrets work.

**Secrets:** declare `OTP_SECRET` (and `SENDGRID_API_KEY`) in your
`firebase.json` (or use `firebase functions:secrets:set OTP_SECRET`) and
reference them with `defineSecret`. Both `createRequestEmailOtp` and
`createVerifyEmailOtp` must receive the same `OTP_SECRET`.

### 2. REQUIRED: Lock the OTP collection in Firestore rules

> [!CAUTION]
> **Required for security.** Because Cloud Functions use the Admin SDK (which bypasses Security Rules), clients never need access to `auth_otps` (or your custom `collection`). Leaving this collection readable or writable to clients is a critical security risk. This package has no access to deploying Firestore rules, so this crucial step is your responsibility.
>
> **Watch out for wildcard rules:** Firestore evaluates overlapping `match` blocks with `OR` logic (`allow` always wins over `if false`). If your `firestore.rules` contains a broad catch-all rule such as `match /{document=**} { allow read, write: if request.auth != null; }`, adding `allow read, write: if false;` on `/auth_otps/{document=**}` will **not** block authenticated users — you must remove the catch-all rule or explicitly exclude `auth_otps` in its condition.

```javascript
// Auth OTP documents are maintained exclusively by backend Cloud Functions.
// Users don't need any kind of access to this collection.
match /auth_otps/{document=**} {
  allow read, write: if false;
}
```

### 3. Deploy functions and Firestore rules

```bash
firebase deploy --only functions,firestore:rules
```

### Options (all optional, sane defaults)

| Option               | Default               | Notes                                                                                                  |
| -------------------- | --------------------- | ------------------------------------------------------------------------------------------------------ |
| `secret`             | `undefined` (SHA-256) | HMAC-SHA256 secret (`string`, getter, or `defineSecret('OTP_SECRET')`); must match on request & verify |
| `collection`         | `'auth_otps'`         | same value must be used on all three factories                                                         |
| `cooldownMs`         | `60_000`              | resend rate limit                                                                                      |
| `expiryMs`           | `600_000`             | code lifetime (10 min)                                                                                 |
| `maxAttempts`        | `5`                   | brute-force cap per code                                                                               |
| `enforceAppCheck`    | `false`               | flip to `true` in production (see below)                                                               |
| `sendEmail`          | SendGrid sender       | custom `(email: OtpEmail) => Promise<void>` to swap providers or log in dev                            |
| `schedule` (cleanup) | `'every 15 minutes'`  | Cloud Scheduler syntax                                                                                 |

**App Check:** start with `enforceAppCheck: false` while wiring up, then enable
it in production once your app ships App Check (React Native: `@react-native-firebase/app-check`).

**Dev mode without SendGrid:**

```typescript
exports.requestEmailOtp = createRequestEmailOtp({
  appName: "MyApp",
  sendEmail: async (email) => {
    console.log(`[DEV OTP] ${email.to} → ${email.subject}`);
  },
});
```

### Error contract (surfaced verbatim to users)

| Code                 | Meaning                                                                           |
| -------------------- | --------------------------------------------------------------------------------- |
| `invalid-argument`   | Bad email, wrong code format, or wrong code (message includes remaining attempts) |
| `not-found`          | No active code or code expired (unified response to avoid state enumeration)      |
| `resource-exhausted` | Cooldown active or attempts exhausted                                             |
| `internal`           | Email delivery failed (doc is auto-cleaned)                                       |

---

## Mobile setup (React Native / Expo)

### 1. Add to your auth screen

```tsx
import { useState } from 'react';
import { EmailOtpModal } from '@guettonenrique/passwordless-auth/react-native';

const [otpVisible, setOtpVisible] = useState(false);

<TouchableOpacity onPress={() => setOtpVisible(true)}>
  <Text>Continue with email code</Text>
</TouchableOpacity>

<EmailOtpModal
  visible={otpVisible}
  onClose={() => setOtpVisible(false)}
  initialEmail={email}   // optional pre-fill
/>
```

That's the whole integration. On success the modal closes and your existing
`onAuthStateChanged` listener flips the app into the signed-in state — no
navigation code needed.

### 2. Or use the pieces yourself

```typescript
import {
  requestEmailOtp, // (email) → { status, message }
  verifyEmailOtp, // (email, code) → customToken
  signInWithEmailOtp, // (email, code) → signs in via signInWithCustomToken
  OtpInput, // 6-slot auto-fill code input
} from "@guettonenrique/passwordless-auth/react-native";
```

`OtpInput` uses one hidden native input (the only way paste + iOS `oneTimeCode`
/ Android `one-time-code` auto-fill work reliably) and calls `onComplete` when
the last digit arrives — wire it to `signInWithEmailOtp` for auto-submit.

### 3. Keep the UI in sync with the backend

If you override `cooldownMs`/`expiryMs` on the backend, pass the matching
`cooldownSeconds` prop to `EmailOtpModal` so the UI countdown mirrors the
server rate limit.

---

## Security recommendations (WIP)

- **Global & IP-based rate limiting:** This package only enforces a **per-email** resend cooldown and a
  **per-code** attempt cap — it does not implement global or IP-based rate limiting. To protect your email quota from automated abuse across many different email addresses, enable `enforceAppCheck: true` in production and configure rate limits or daily send caps at infrastructure/provider level.

- **User provisioning (`provision` callback):** Since this package delegates finding/creating `uid` to your
  app's `provision(email)` function and mints a custom token for that `uid`, make sure your user provisioning logic resolves users by normalized email, sets `emailVerified: true` only after OTP verification, and avoids creating duplicate users or linking existing accounts to unverified identities.

---

## Testing the package

```bash
npm install
npm run typecheck   # 3 per-entry tsc passes
npm run lint        # includes the cross-entry boundary rule
npm test            # 68 tests: shared, functions (mocked Firestore/Auth), react-native
npm run build       # tsup: ESM+CJS+DTS for each entry
```

**Boundary rule:** `src/shared` may import nothing; `src/functions` may not
import `src/react-native` and vice versa. ESLint enforces it on import
specifiers; per-entry `tsc` configs keep the type graphs separate.
