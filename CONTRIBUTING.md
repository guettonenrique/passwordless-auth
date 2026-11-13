# Contributing

> **WIP**

## Testing the package

```bash
npm install
npm run typecheck   # 3 per-entry tsc passes
npm run lint        # includes the cross-entry boundary rule
npm test            # 69 tests: shared, functions (mocked Firestore/Auth), react-native
npm run build       # tsup: ESM+CJS+DTS for each entry
```

**Boundary rule:** `src/shared` may import nothing; `src/functions` may not import `src/react-native` and vice versa. ESLint enforces it on import specifiers; per-entry `tsc` configs keep the type graphs separate.
