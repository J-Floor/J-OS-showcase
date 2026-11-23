import { defineConfig } from "vitest/config";
import solid from "vite-plugin-solid";
export default defineConfig({
	plugins: [solid({ ssr: true })],
	resolve: { conditions: ["browser"] },
	test: {
		environment: "jsdom",
		server: { deps: { inline: ["solid-js", "@solidjs/testing-library"] } },
	},
	build: { target: "es2022" },
});
