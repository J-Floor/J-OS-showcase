import { WifiContent } from "./WifiContent.tsx";

// Note: apps/web has no playground harness (the `Demo`-registry Playground
// under packages/design-system only globs its own `src/components/**`), so
// nothing currently loads this file. It exists as a manual, runnable example
// of `WifiContent` in isolation, mirroring the shape of a design-system demo.
// Named (not default) export: apps/web's eslint config, unlike the design
// system's, doesn't ignore `*.demo.tsx` from `import-x/no-default-export`.
export const demo = {
	title: "WifiContent",
	render: (p: { ssid: string; password: string }) => (
		<WifiContent ssid={p.ssid} password={p.password} />
	),
	controls: {
		ssid: { type: "text", default: "J floor" },
		password: { type: "text", default: "demo-pass" },
	},
} as const;
