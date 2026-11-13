import swc from "unplugin-swc";
import { defineConfig } from "vitest/config";

// Integration specs (*.int-spec.ts) use disposable containers and need a
// running Docker daemon. Kept out of `pnpm test` so unit/e2e runs stay
// Docker-free.
export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    include: ["src/**/*.int-spec.ts"],
    testTimeout: 120_000,
    hookTimeout: 120_000,
  },
  plugins: [swc.vite({ module: { type: "es6" } })],
});
