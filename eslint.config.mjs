import js from '@eslint/js';
import tseslint from 'typescript-eslint';

/**
 * Boundary enforcement: each entry tree may only import from itself and from
 * `shared`. Matching is on the import specifier string (no module resolution
 * needed), which is what makes it reliable for extensionless TS imports.
 */
const zoneRule = (forbiddenGroups, message) => ({
  rules: {
    'no-restricted-imports': [
      'error',
      { patterns: [{ group: forbiddenGroups, message }] },
    ],
  },
});

export default tseslint.config(
  { ignores: ['dist', 'node_modules', 'coverage'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['src/shared/**/*'],
    ...zoneRule(['*/functions/*', './functions/*'], 'shared/ must not import from the functions entry'),
  },
  {
    files: ['src/functions/**/*'],
    ...zoneRule(
      ['*/react-native/*', './react-native/*'],
      'functions/ must not import from the react-native entry'
    ),
  },
  {
    files: ['src/react-native/**/*'],
    ...zoneRule(['*/functions/*', './functions/*'], 'react-native/ must not import from the functions entry'),
  }
);
