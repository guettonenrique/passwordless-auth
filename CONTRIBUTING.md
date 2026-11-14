# Contributing

> **WIP**

## Testing the package

```bash
npm install
npm run typecheck   # 3 per-entry tsc passes
npm run lint        # includes the cross-entry boundary rule
npm test            # 70 tests: shared, functions (mocked Firestore/Auth), react-native (+ built-dist smoke)
npm run build       # tsup: ESM+CJS+DTS for each entry
```

**Boundary rule:** `src/shared` may import nothing; `src/functions` may not import `src/react-native` and vice versa. ESLint enforces it on import specifiers; per-entry `tsc` configs keep the type graphs separate.

## Packaging

### Peer dependencies (all declared `optional`)

The package serves **two disjoint runtime environments** from a single npm artifact: Node (Firebase Cloud Functions, via `/functions`) and React Native (via `/react-native` + `/react-native/ui`). Their required host stacks share nothing.

The constraint that shapes the manifest:

- `peerDependencies` is a **single, package-wide field** — there is no per-`exports`-subpath peer declaration.
- Since npm v7, **required** peers are **auto-installed** by default. Declaring the union of both environments as required would force one environment's stack into the other (e.g. pulling `react-native` into a functions project, or `firebase-admin` into a mobile app) and could trip `ERESOLVE` at the root.

So **every peer is marked `optional: true` in `peerDependenciesMeta`** — npm never auto-installs them and never warns about them being missing. The README's per-entry table is therefore the **authoritative contract**; the ranges in `package.json` are the declared compatibility floors and exist for tooling/discoverability and to keep the option open of tightening later.

When adding a new entry or a new peer: update the README table and the `package.json` `peerDependencies`/`peerDependenciesMeta` together, and keep the ranges in lockstep.
