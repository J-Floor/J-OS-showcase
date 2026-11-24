import { readFileSync } from "node:fs";
import { loadEnv, defineConfig, type Plugin } from "vite";

const REQUIRED = ["VITE_TV_API_URL", "VITE_TV_APP_URL"] as const;

/** The Tizen runtime loads index.html from a file origin, where module scripts are blocked: emit a classic script. */
function tizenPackaging(): Plugin {
	return {
		name: "tizen-packaging",
		transformIndexHtml: {
			order: "post",
			handler: (html) =>
				html
					.replace(
						/<script type="module" crossorigin/g,
						"<script defer"
					)
					.replace(
						/<link rel="stylesheet" crossorigin/g,
						'<link rel="stylesheet"'
					),
		},
		generateBundle() {
			this.emitFile({
				type: "asset",
				fileName: "config.xml",
				source: readFileSync(new URL("config.xml", import.meta.url)),
			});
		},
	};
}

export default defineConfig(({ command, mode }) => {
	if (command === "build" && mode === "check") {
		// CI compile check (`bun run build`): placeholders only, never a release package.
		process.env.VITE_TV_API_URL ??= "https://api.example.com";
		process.env.VITE_TV_APP_URL ??= "https://app.example.com";
	}
	if (command === "build" && mode !== "check") {
		const env = loadEnv(mode, process.cwd(), "VITE_");
		for (const name of REQUIRED) {
			if (!env[name])
				throw new Error(`${name} must be set to build the TV app`);
		}
	}
	return {
		base: "./",
		plugins: [tizenPackaging()],
		build: {
			target: "chrome76",
			modulePreload: false,
			rollupOptions: { output: { format: "iife" } },
		},
		test: {
			environment: "happy-dom",
			setupFiles: ["src/chrome76.setup.ts"],
			globals: true,
			env: {
				VITE_TV_API_URL: "https://api.example.com",
				VITE_TV_APP_URL: "https://app.example.com",
			},
		},
	};
});
