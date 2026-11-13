# @guettonenrique/passwordless-auth

Passwordless **email OTP** authentication in one package with three entry points:

- **`/functions`** — ready-to-register Firebase Cloud Function factories for sending codes, verifying codes, and scheduled cleanup.
- **`/react-native`** — optional mobile API layer plus `<OtpInput />` (auto-fill code boxes) and `<EmailOtpModal />` (the full two-step dialog).
- **`/shared`** — pure TypeScript constants, types, validation, and the email template, with no SDK imports.

You can use `/functions` without installing the package on the client if you prefer to own your email form, OTP input, styling, and error handling.

> **v0.1** — first publish. API may still change; breaking changes allowed until 1.0.

---

## Getting started

### 1. Install the package

```bash
npm install @guettonenrique/passwordless-auth
```

Install the peer packages required by the entry point you use:

| Entry           | Required in the consuming project                                                                                                                                             |
| --------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/functions`    | `firebase-functions >=4`, `firebase-admin >=11`, `@sendgrid/mail >=8`                                                                                                         |
| `/react-native` | `@react-native-firebase/app + auth + functions >=17`, `react >=18`, `react-native >=0.73`, `react-native-keyboard-controller >=1`; optional: `expo-haptics` (haptic feedback) |

---

### 2. Backend setup (Firebase Cloud Functions)

#### Step 1 — Configure your secrets

Provide `OTP_SECRET` (strongly recommended, see [Security](#security)) and `SENDGRID_API_KEY`. Both `secret` and `sendgrid.apiKey` accept a plain string (e.g., from `process.env`), a getter `() => string`, or a Firebase `defineSecret(...)` param.

Both `createRequestEmailOtp` and `createVerifyEmailOtp` must receive the **same** `OTP_SECRET`.

#### Step 2 — Register the three functions

The example below uses Firebase `defineSecret(...)` (auto-bound and resolved per call), or you can pass plain strings / getters instead.

```typescript
// callable/requestEmailOtp.ts
import { defineSecret } from "firebase-functions/params";
import { createRequestEmailOtp } from "@guettonenrique/passwordless-auth/functions";

const otpSecret = defineSecret("OTP_SECRET");
const sendgridKey = defineSecret("SENDGRID_API_KEY");

exports.requestEmailOtp = createRequestEmailOtp({
  appName: "MyApp",
  secret: otpSecret,
  enforceAppCheck: false,
  sendgrid: {
    apiKey: sendgridKey,
    fromEmail: "no-reply@yourdomain.com",
    fromName: "MyApp Support",
  },
  // Or for local/emulator testing only (never log OTPs in production):
  // sendEmail: async (email) => {
  //   console.log(`[DEV OTP] ${email.to} → ${email.subject}`);
  // },
});
```

```typescript
// callable/verifyEmailOtp.ts
import { defineSecret } from "firebase-functions/params";
import { createVerifyEmailOtp } from "@guettonenrique/passwordless-auth/functions";
import { resolveOrCreateUser } from "@yourUserProvisioningHook";

const otpSecret = defineSecret("OTP_SECRET");

// Resolve or create the user via your provisioning hook, then return their uid.

const provision = async (email: string): Promise<string> => {
  const { user } = await resolveOrCreateUser(email, { emailVerified: true });
  return user.uid;
};

exports.verifyEmailOtp = createVerifyEmailOtp({
  secret: otpSecret,
  enforceAppCheck: false,
  provision,
});
```

```typescript
// schedule/cleanupExpiredOtps.ts
import { createCleanupExpiredOtps } from "@guettonenrique/passwordless-auth/functions";

// Reaps expired docs (orphans from users who never entered the code).
exports.cleanupExpiredOtps = createCleanupExpiredOtps();
```

#### Step 3 — Lock down the OTP collection in Firestore rules (Required)

> [!CAUTION]
> **Required for security.** Because Cloud Functions use the Admin SDK (which bypasses Security Rules), clients never need access to `auth_otps` (or your custom `collection`). Leaving this collection readable or writable to clients is a critical security risk. This package cannot deploy Firestore rules, so this step is your responsibility.
>
> **Watch out for wildcard rules:** Firestore evaluates overlapping `match` blocks with `OR` logic (`allow` always wins over `if false`). If your `firestore.rules` contains a broad catch-all rule such as `match /{document=**} { allow read, write: if request.auth != null; }`, adding `allow read, write: if false;` on `/auth_otps/{document=**}` will **not** block authenticated users — remove the catch-all rule or explicitly exclude `auth_otps` in its condition.

```javascript
// Auth OTP documents are maintained exclusively by backend Cloud Functions.
// Users don't need any kind of access to this collection.
match /auth_otps/{document=**} {
  allow read, write: if false;
}
```

#### Step 4 — Deploy functions and rules

```bash
firebase deploy --only functions,firestore:rules
```

---

### 3. Client setup

Choose either the pre-built `/react-native` entry point or your own UI calling the deployed functions directly.

#### Option A: Using `/react-native` (React Native / Expo)

**Quick integration with `<EmailOtpModal />`:**

```tsx
import { useState } from "react";
import { EmailOtpModal } from "@guettonenrique/passwordless-auth/react-native";

const [otpVisible, setOtpVisible] = useState(false);

<TouchableOpacity onPress={() => setOtpVisible(true)}>
  <Text>Continue with email code</Text>
</TouchableOpacity>

<EmailOtpModal
  visible={otpVisible}
  onClose={() => setOtpVisible(false)}
  initialEmail={email} // optional pre-fill
/>
```

On success, the modal signs the user in with Firebase Auth (`signInWithCustomToken`) and closes.

**Custom UI with `<OtpInput />` and API helpers:**

```typescript
import {
  requestEmailOtp, // (email) → { status, message }
  verifyEmailOtp, // (email, code) → customToken
  signInWithEmailOtp, // (email, code) → signs in via signInWithCustomToken
  OtpInput, // 6-slot auto-fill code input
} from "@guettonenrique/passwordless-auth/react-native";
```

`<OtpInput />` uses a single hidden native input and calls `onComplete` when the last digit arrives — wire it to `signInWithEmailOtp` for auto-submit.

#### Option B: Client-owned UI (without `/react-native`)

You can omit the package from the client entirely and call the deployed Firebase callable functions with your app's existing Firebase dependencies:

1. Call `requestEmailOtp` with the normalized email.
2. Collect the six-digit code in your own UI.
3. Call `verifyEmailOtp` with the email and code.
4. Read `customToken` from the response.
5. Sign in with Firebase Auth using `signInWithCustomToken`.

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

The callable names and payloads must match the deployed backend functions. You can still import `/shared` separately for shared constants and validation if desired.

---

## Configuration & reference

### Backend options (all optional, sane defaults)

| Option               | Default               | Notes                                                                                                  |
| -------------------- | --------------------- | ------------------------------------------------------------------------------------------------------ |
| `secret`             | `undefined` (SHA-256) | HMAC-SHA256 secret (`string`, getter, or `defineSecret('OTP_SECRET')`); must match on request & verify |
| `collection`         | `'auth_otps'`         | Same value must be used on all three factories                                                         |
| `cooldownMs`         | `60_000`              | Resend rate limit                                                                                      |
| `expiryMs`           | `600_000`             | Code lifetime (10 min)                                                                                 |
| `maxAttempts`        | `5`                   | Brute-force cap per code                                                                               |
| `enforceAppCheck`    | `false`               | Flip to `true` in production once App Check is configured in your environment                          |
| `sendEmail`          | SendGrid sender       | Custom `(email: OtpEmail) => Promise<void>` to swap providers or log in dev                            |
| `schedule` (cleanup) | `'every 15 minutes'`  | Cloud Scheduler syntax                                                                                 |

**Dev mode without SendGrid** (use this for local/emulator testing only; never log OTPs in production):

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

## Security

### Built-in protections

- Codes are HMAC-SHA256 hashed with a server-side secret before storage — plaintext never touches Firestore.
- Timing-safe comparison prevents hash-timing attacks.
- Single-use: the doc is deleted inside the verify transaction (concurrent verifies → one winner).
- 5-attempt cap per code, then the doc is destroyed.
- Atomic 60-second resend cooldown (enforced inside a Firestore transaction), 10-minute code expiry, and hash-verified cleanup on delivery failure.

### Your responsibilities

- **Firestore rules (Critical):** Make sure to block **every** client-side access to `auth_otps` (or your custom `collection`) in your Firestore rules, and ensure no catch-all wildcard `allow` rule overrides it. This collection should only be managed by backend Cloud Functions via the Admin SDK.
- **User provisioning (`provision` callback):** Since this package delegates finding/creating `uid` to your app's `provision(email)` function and mints a custom token for that `uid`, make sure your user provisioning logic resolves users by normalized email, sets `emailVerified: true` only after OTP verification, and avoids creating duplicate users or linking existing accounts to unverified identities.
- **Global & IP-based rate limiting:** This package enforces a **per-email** resend cooldown and a **per-code** attempt cap, but it does not implement global or IP-based rate limiting. To protect your email quota from automated abuse across many different email addresses, enable `enforceAppCheck: true` in production and configure rate limits or daily send caps at the infrastructure/provider level.

---

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md).
