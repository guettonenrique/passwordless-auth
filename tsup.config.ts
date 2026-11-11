import { defineConfig } from 'tsup';

// Three entries, both module formats. The package.json "exports" map decides
// which file each consumer actually loads:
//   ./shared        → ESM or CJS (whichever the importer uses)
//   ./functions     → CJS only (Cloud Functions runtime)
//   ./react-native  → ESM only (Metro transforms it)
export default defineConfig({
  entry: {
    'shared/index': 'src/shared/index.ts',
    'functions/index': 'src/functions/index.ts',
    'react-native/index': 'src/react-native/index.ts',
  },
  format: ['esm', 'cjs'],
  dts: true,
  sourcemap: true,
  clean: true,
  splitting: false,
});
