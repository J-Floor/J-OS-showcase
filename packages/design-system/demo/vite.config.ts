import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { defineConfig } from "vite";
import solid from "vite-plugin-solid";

const here = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
	root: here,
	plugins: [solid()],
	resolve: {
		alias: {
			// Import components by their public package name, exactly like a consumer.
			"@j-os/design-system": resolve(here, "../src/index.ts"),
		},
	},
});
