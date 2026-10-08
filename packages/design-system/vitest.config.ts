import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";
import solid from "vite-plugin-solid";

// A bare specifier: Vite's config loader cannot run `import.meta.resolve` under
// Bun, and `createRequire().resolve` picks jest-dom's CJS build, which cannot
// import Vitest.
const jestDomSetup = "@testing-library/jest-dom/vitest";
const resizeObserverSetup = fileURLToPath(
  new URL("./vitest.setup.ts", import.meta.url),
);
const domStorageSetup = fileURLToPath(
  new URL("./test-dom-storage.ts", import.meta.url),
);

export default defineConfig({
  plugins: [solid({ hot: false })],
  resolve: { conditions: ["development", "browser"] },
  test: {
    environment: "jsdom",
    maxWorkers: "100%",
    globals: true,
    setupFiles: [jestDomSetup, resizeObserverSetup, domStorageSetup],
  },
});
