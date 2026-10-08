/// <reference types="vitest/config" />
import { defineConfig } from "vite";
import solid from "vite-plugin-solid";

export default defineConfig(({ mode }) => ({
	// Disable solid-refresh (HMR) under Vitest — it breaks in the jsdom test
	// environment. Dev and build keep it on. `ssr: true` compiles hydratable
	// output: pages are prerendered at build time (scripts/prerender.mjs).
	plugins: [solid({ hot: mode !== "test", ssr: mode !== "test" })],
	test: {
		environment: "jsdom",
		maxWorkers: "100%",
		setupFiles: ["./src/test-setup.ts"],
		// Inline @ark-ui/solid so Vite (with vite-plugin-solid) transforms its
		// `.jsx` sources. Design-system components (e.g. Button) pull it in, and
		// Node's loader can't handle a bare `.jsx` extension otherwise.
		server: { deps: { inline: ["@ark-ui/solid"] } },
	},
}));
