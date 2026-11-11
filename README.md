# @guettonenrique/passwordless-auth

Passwordless **email-OTP** authentication as one package with two entry points:

- **`/functions`** — three ready-to-register Firebase Cloud Function factories (send code, verify code, scheduled cleanup)
- **`/react-native`** — the mobile API layer plus `OtpInput` (auto-fill code boxes) and `EmailOtpModal` (the full two-step dialog)
- **`/shared`** — the single source of truth for the contract: constants, types, validation, email template. Pure TS, no SDK imports.

The security model is baked in and tested: SHA-256 hashed codes (never plaintext), timing-safe comparison, single-use codes deleted inside the verify transaction, 5-attempt brute-force cap, 60-second resend cooldown, 10-minute expiry, and client-side access to the OTP collection blocked by rules.

> **v0.1** — first publish. API may still change; breaking changes allowed until 1.0.

---

## What the package does

**Backend (`/functions`)** — three factory functions that return ready-to-deploy Firebase Cloud Functions:

| Factory | What it handles |
|---|---|
| `createRequestEmailOtp` | Email validation, 60 s resend cooldown, cryptographically secure 6-digit code generation, SHA-256 hashing (`email:code`), Firestore write, email dispatch (SendGrid default or custom sender), structured error responses |
| `createVerifyEmailOtp` | Code lookup, timing-safe hash comparison, expiry check, 5-attempt brute-force cap, single-use deletion inside a Firestore transaction, user provisioning (delegated to your hook), Firebase custom token minting |
| `createCleanupExpiredOtps` | Scheduled (every 15 min) drain-loop that deletes orphaned OTP docs (users who requested but never entered a code) |

**Mobile (`/react-native`)** — API layer + UI components:

| Export | What it does |
|---|---|
| `requestEmailOtp(email)` | Calls the backend, returns `{ status, message }` |
| `verifyEmailOtp(email, code)` | Calls the backend, returns the Firebase custom token |
| `signInWithEmailOtp(email, code)` | Verifies + `signInWithCustomToken` — one call, user is signed in |
| `<OtpInput />` | 6-slot auto-fill code input (paste, iOS `oneTimeCode` / Android `one-time-code`, haptics, auto-submit on completion) |
| `<EmailOtpModal />` | Full two-step dialog (email → code) with cooldown countdown, resend, error banner, double-submit guard. On success the modal closes and your existing `onAuthStateChanged` listener takes over |

**Shared (`/shared`)** — constants, types, email template, validation utils. Pure TS, no SDK imports. Single source of truth so backend and mobile can't drift.

**Security model (baked in, tested):**

- Codes are SHA-256 hashed before storage — plaintext never touches Firestore
- Timing-safe comparison prevents hash-timing attacks
- Single-use: the doc is deleted inside the verify transaction (concurrent verifies → one winner)
- 5-attempt cap per code, then the doc is destroyed
- 60-second resend cooldown, 10-minute code expiry
- Client-side access to the OTP collection is blocked by Firestore rules (only admin SDK writes)
- App Check enforcement is a one-flag option (`enforceAppCheck: true`)

---

## What you need to do

### Backend (Cloud Functions project)

1. **Install** the package (see below).
2. **Register the three functions** — ~30 lines total:

   ```typescript
   // functions/src/index.ts (or per-function files)
   import {
     createRequestEmailOtp,
     createVerifyEmailOtp,
     createCleanupExpiredOtps,
   } from '@guettonenrique/passwordless-auth/functions';

   exports.requestEmailOtp = createRequestEmailOtp({
     appName: 'MyApp',
     sendgrid: { apiKey: defineSecret('SENDGRID_API_KEY'), fromEmail, fromName },
   });

   exports.verifyEmailOtp = createVerifyEmailOtp({
     provision: async (email) => {
       // Your user schema: resolve or create, return the uid.
       const { user } = await resolveOrCreateUser(email, { emailVerified: true });
       return user.uid;
     },
   });

   exports.cleanupExpiredOtps = createCleanupExpiredOtps();
   ```

   The **only required customization** is the `provision` hook — it owns your user schema (Firestore docs, subscribers, notification settings, etc.). Everything else is config or defaults.

3. **Lock down the OTP collection** in `firestore.rules`:

   ```javascript
   match /auth_otps/{document=**} {
     allow read, write: if false;
   }
   ```

4. **Deploy**: `firebase deploy --only functions,firestore:rules`

### Mobile (React Native / Expo)

1. **Install** the package + the mobile peers (see table below).
2. **Add the modal** to your auth screen — ~10 lines:

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

### That's it. No other changes required.

The package never touches your auth state, navigation, user schema, or email infrastructure beyond what you explicitly configure.

---

## Installation

The package publishes to **GitHub Packages** (private). Each consumer needs a
fine-grained personal access token scoped to this repo with *Contents: Read*
and *Packages: Read*.

`.npmrc` (project root or `~/.npmrc`):

```
@guettonenrique:registry=https://npm.pkg.github.com
//npm.pkg.github.com/:_authToken=<your-fine-grained-PAT>
```

```bash
npm install @guettonenrique/passwordless-auth
```

The runtime SDKs are **not declared as `peerDependencies`** — GitHub Packages
strips `peerDependenciesMeta` from its npm metadata (known limitation, no ETA:
community discussions [#41534](https://github.com/orgs/community/discussions/41534) /
[#51104](https://github.com/orgs/community/discussions/51104)), which makes npm
auto-install the *other* entry's stack into your project (e.g. the whole React
Native stack into a Cloud Functions project). Your project must install what
your side needs (exact tested versions live in this package's
`devDependencies`):

| Entry | Needs installed in the consuming project |
|---|---|
| `/functions` | `firebase-functions >=4`, `firebase-admin >=11`, `@sendgrid/mail >=8` (or pass a custom sender) |
| `/react-native` | `@react-native-firebase/app + auth + functions >=17`, `react >=18`, `react-native >=0.73`, `react-native-keyboard-controller >=1`, `lucide-react-native >=0.300`; optional: `expo-haptics` (haptic feedback) |

---

## Backend setup (Firebase Cloud Functions, TypeScript)

### 1. Register the three functions

```typescript
// functions/src/index.ts
import { defineSecret } from 'firebase-functions/params';
import {
  createRequestEmailOtp,
  createVerifyEmailOtp,
  createCleanupExpiredOtps,
} from '@guettonenrique/passwordless-auth/functions';
import { resolveOrCreateUser } from './utils/yourUserProvisioning';

const sendgridKey = defineSecret('SENDGRID_API_KEY');

// The one project-specific hook: resolve or create the user, return the uid.
const provision = async (email: string): Promise<string> => {
  const { user } = await resolveOrCreateUser(email, { emailVerified: true });
  return user.uid;
};

exports.requestEmailOtp = createRequestEmailOtp({
  appName: 'MyApp',
  // ⚠️ register the secret on the function so the runtime can resolve it:
  // pass `secrets: [sendgridKey]` via onCall options if your deployment
  // requires it — see "Secrets" below.
  sendgrid: {
    apiKey: sendgridKey,            // a params Secret works directly
    fromEmail: 'no-reply@yourdomain.com',
    fromName: 'MyApp Support',
  },
});

exports.verifyEmailOtp = createVerifyEmailOtp({ provision });

// Reaps expired docs (orphans from users who never entered the code).
exports.cleanupExpiredOtps = createCleanupExpiredOtps();
```

`apiKey` accepts a `defineSecret(...)` object directly — the factory resolves
it per call, which is what makes Firebase secrets work.

**Secrets:** declare `SENDGRID_API_KEY` in your `firebase.json` (or use
`firebase functions:secrets:set SENDGRID_API_KEY`) and reference it with
`defineSecret`. The factory reads it through the params API at request time.

### 2. Lock the OTP collection in Firestore rules

```javascript
match /auth_otps/{document=**} {
  allow read, write: if false;   // only the Cloud Functions (admin SDK) may touch it
}
```

### 3. Deploy

```bash
firebase deploy --only functions,firestore:rules
```

### Options (all optional, sane defaults)

| Option | Default | Notes |
|---|---|---|
| `collection` | `'auth_otps'` | same value must be used on all three factories |
| `cooldownMs` | `60_000` | resend rate limit |
| `expiryMs` | `600_000` | code lifetime (10 min) |
| `maxAttempts` | `5` | brute-force cap per code |
| `enforceAppCheck` | `false` | flip to `true` in production (see below) |
| `sendEmail` | SendGrid sender | custom `(email: OtpEmail) => Promise<void>` to swap providers or log in dev |
| `schedule` (cleanup) | `'every 15 minutes'` | Cloud Scheduler syntax |

**App Check:** start with `enforceAppCheck: false` while wiring up, then enable
it in production once your app ships App Check (React Native: `@react-native-firebase/app-check`).

**Dev mode without SendGrid:**

```typescript
exports.requestEmailOtp = createRequestEmailOtp({
  appName: 'MyApp',
  sendEmail: async (email) => {
    console.log(`🔑 [DEV OTP] ${email.to}: ${email.code}`);
  },
});
```

### Error contract (surfaced verbatim to users)

| Code | Meaning |
|---|---|
| `invalid-argument` | Bad email, wrong code format, or wrong code (message includes remaining attempts) |
| `not-found` | No active code for this email |
| `deadline-exceeded` | Code expired |
| `resource-exhausted` | Cooldown active or attempts exhausted |
| `internal` | Email delivery failed (doc is auto-cleaned) |

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
  requestEmailOtp,       // (email) → { status, message }
  verifyEmailOtp,        // (email, code) → customToken
  signInWithEmailOtp,    // (email, code) → signs in via signInWithCustomToken
  OtpInput,              // 6-slot auto-fill code input
} from '@guettonenrique/passwordless-auth/react-native';
```

`OtpInput` uses one hidden native input (the only way paste + iOS `oneTimeCode`
/ Android `one-time-code` auto-fill work reliably) and calls `onComplete` when
the last digit arrives — wire it to `signInWithEmailOtp` for auto-submit.

### 3. Keep the UI in sync with the backend

If you override `cooldownMs`/`expiryMs` on the backend, pass the matching
`cooldownSeconds` prop to `EmailOtpModal` so the UI countdown mirrors the
server rate limit.

---

## Testing the package (contributors)

```bash
npm install
npm run typecheck   # 3 per-entry tsc passes
npm run lint        # includes the cross-entry boundary rule
npm test            # 58 tests: shared, functions (mocked Firestore/Auth), react-native
npm run build       # tsup: ESM+CJS+DTS for each entry
```

**Boundary rule:** `src/shared` may import nothing; `src/functions` may not
import `src/react-native` and vice versa. ESLint enforces it on import
specifiers; per-entry `tsc` configs keep the type graphs separate.

**Publishing** (manual for v0.x; CI-on-tag from 1.0):

`npm login` does **not** work against `npm.pkg.github.com` (GitHub's registry
doesn't implement the interactive login protocol — you'll get a 403). Use a
token instead:

1. Create a **fine-grained PAT**: GitHub → Settings → Developer settings →
   Personal access tokens → Fine-grained tokens → Generate new token.
   Repository access: this repo. Permissions: **Contents: Read and write**,
   **Packages: Read and write**.
2. Publish:

   ```bash
   npm publish --//npm.pkg.github.com/:_authToken="github_pat_XXXX"
   ```

   or persist the token in `~/.npmrc`:

   ```
   @guettonenrique:registry=https://npm.pkg.github.com
   //npm.pkg.github.com/:_authToken=github_pat_XXXX
   ```

3. Verify:

   ```bash
   npm view @guettonenrique/passwordless-auth --registry=https://npm.pkg.github.com
   ```
