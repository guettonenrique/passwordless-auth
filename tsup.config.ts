import { defineConfig } from 'tsup';

// Three entries, both module formats. The package.json "exports" map decides
// which file each consumer actually loads:
//   ./shared        → ESM or CJS (whichever the importer uses)
//   ./functions     → CJS only (Cloud Functions runtime)
//   ./react-native  → ESM only (Metro transforms it)
// Explicit externals — every third-party import is left to the consumer.
// (tsup auto-externals `dependencies`/`peerDependencies` only; this package
// has neither, so relying on that would make the build try to bundle the
// React Native stack from devDependencies and fail.)
const external = [
  // /functions consumers provide
  'firebase-functions',
  'firebase-admin',
  '@sendgrid/mail',
  // /react-native consumers provide
  '@react-native-firebase/app',
  '@react-native-firebase/auth',
  '@react-native-firebase/functions',
  'react',
  'react-native',
  'react-native-keyboard-controller',
];

export default defineConfig({
  entry: {
    'shared/index': 'src/shared/index.ts',
    'functions/index': 'src/functions/index.ts',
    'react-native/index': 'src/react-native/index.ts',
    'react-native/ui/index': 'src/react-native/ui/index.ts',
  },
  format: ['esm', 'cjs'],
  dts: true,
  sourcemap: true,
  clean: true,
  splitting: false,
  external,
});
