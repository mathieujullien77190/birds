// Configuration ESLint (format « flat »). Les outils sont installés à part, dans tools/lint (voir sa description) :
// le projet utilise TypeScript 7, sans API JavaScript, alors que typescript-eslint a besoin de TypeScript 5.
// Installer une fois : npm --prefix tools/lint install — puis : npm run lint
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(fileURLToPath(new URL('./tools/lint/package.json', import.meta.url)));
const tseslint = require('typescript-eslint');
const reactHooks = require('eslint-plugin-react-hooks');

export default tseslint.config(
  { ignores: ['dist/**', 'archives/**', 'pi/**', 'public/**', 'scripts/**', 'tools/**', 'node_modules/**'] },
  {
    // le code 3D (modèle pur, Three.js, vue) et ses tests, plus le simulateur du Pi
    files: ['src/birdhouse/**/*.{ts,tsx}', 'src/features/viewer/**/*.{ts,tsx}', 'tests/**/*.ts'],
    extends: [tseslint.configs.base],
    plugins: { '@typescript-eslint': tseslint.plugin, 'react-hooks': reactHooks },
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
    },
  },
);
