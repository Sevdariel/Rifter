import { defineConfig } from 'eslint/config';
import tseslint from 'typescript-eslint';
import prettier from 'eslint-config-prettier/flat';

export default defineConfig(
  {
    ignores: ['**/node_modules', '**/dist', '**/coverage', '**/.angular', '**/*.spec.ts.snap', 'ToDO'],
  },
  {
    files: ['**/*.ts'],
    extends: [tseslint.configs.recommended],
  },
  prettier,
);
