import js from '@eslint/js';
import react from 'eslint-plugin-react';
import reactHooks from 'eslint-plugin-react-hooks';
import security from 'eslint-plugin-security';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['dist', 'node_modules'] },
  js.configs.recommended,
  ...tseslint.configs.strict,
  security.configs.recommended,
  {
    files: ['**/*.{ts,tsx}'],
    plugins: { react, 'react-hooks': reactHooks },
    settings: { react: { version: '18.3' } },
    rules: {
      ...reactHooks.configs.recommended.rules,
      'react/no-danger': 'error',
      'react/no-danger-with-children': 'error',
      'react/jsx-no-script-url': 'error',
      'react/jsx-no-target-blank': 'error',
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      '@typescript-eslint/no-non-null-assertion': 'error',
      'no-eval': 'error',
      'no-implied-eval': 'error',
      'no-new-func': 'error',
      'no-restricted-globals': ['error', 'sessionStorage', 'localStorage'],
      'no-restricted-properties': [
        'error',
        { object: 'window', property: 'localStorage' },
        { object: 'window', property: 'sessionStorage' },
        { object: 'document', property: 'write' },
      ],
      'no-restricted-syntax': [
        'error',
        { selector: "JSXAttribute[name.name='dangerouslySetInnerHTML']", message: 'dangerouslySetInnerHTML is banned' },
        { selector: "AssignmentExpression[left.property.name='innerHTML']", message: 'innerHTML is banned' },
        { selector: "AssignmentExpression[left.property.name='outerHTML']", message: 'outerHTML is banned' },
      ],
      'security/detect-object-injection': 'off',
    },
  },
  {
    files: ['src/lib/prefs.ts'],
    rules: { 'no-restricted-globals': 'off', 'no-restricted-properties': 'off' },
  },
  {
    files: ['tests/**/*.{ts,tsx}', 'scripts/**/*.mjs'],
    rules: {
      'security/detect-non-literal-fs-filename': 'off',
      'no-restricted-globals': 'off',
      '@typescript-eslint/no-non-null-assertion': 'off',
    },
  },
);
