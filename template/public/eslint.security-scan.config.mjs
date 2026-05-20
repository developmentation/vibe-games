
import security from 'file://C:/lungfish/phase-1/_harness/HARNESS/.claude/security/blueteam/node_modules/eslint-plugin-security/index.js';
import tsParser from 'file://C:/lungfish/phase-1/_harness/HARNESS/.claude/security/blueteam/node_modules/@typescript-eslint/parser/dist/index.js';

const securityRules = {
  'security/detect-eval-with-expression': 'error',
  'security/detect-non-literal-fs-filename': 'error',
  'security/detect-non-literal-regexp': 'error',
  'security/detect-non-literal-require': 'error',
  // detect-object-injection demoted to 'warn' (was 'error'). Rationale: this
  // rule fires on ANY computed property access (obj[key] where key is a variable),
  // which is idiomatic TypeScript. True object-injection vulnerabilities need
  // an untrusted source AND a privilege-relevant sink; this rule alone produces
  // 50-100+ false positives on a typical mid-sized codebase. Warn-level keeps
  // the signal in the report without inflating HIGH/CRITICAL counts.
  'security/detect-object-injection': 'warn',
  'security/detect-possible-timing-attacks': 'error',
  'security/detect-unsafe-regex': 'error',
  'security/detect-buffer-noassert': 'error',
  'security/detect-child-process': 'error',
  'security/detect-disable-mustache-escape': 'error',
  'security/detect-no-csrf-before-method-override': 'error',
  'security/detect-pseudoRandomBytes': 'error',
};

export default [
  // JavaScript files — default parser
  {
    files: ['**/*.js', '**/*.jsx', '**/*.mjs', '**/*.cjs'],
    ignores: ['**/node_modules/**', '**/dist/**', '**/build/**', '**/*.min.js'],
    plugins: { security },
    rules: securityRules,
  },
  // TypeScript files — use @typescript-eslint/parser so .ts/.tsx don't throw parse errors
  {
    files: ['**/*.ts', '**/*.tsx', '**/*.d.ts'],
    ignores: ['**/node_modules/**', '**/dist/**', '**/build/**'],
    languageOptions: { parser: tsParser, parserOptions: { ecmaVersion: 'latest', sourceType: 'module' } },
    plugins: { security },
    rules: securityRules,
  },
];
