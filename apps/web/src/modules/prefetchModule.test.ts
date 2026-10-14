// @vitest-environment happy-dom
import { expect, test, vi } from "vitest";

import { descriptorModule, prefetchModule } from "./prefetchModule.ts";
import { modules } from "./registry.ts";
import type { ModuleManifest } from "./types.ts";

function fake(preload: () => Promise<unknown>): {
	manifest: ModuleManifest;
	prefetch: ReturnType<typeof vi.fn>;
} {
	const prefetch = vi.fn();
	const view = Object.assign(() => null, { preload });
	return {
		manifest: {
			id: "x",
			label: "X",
			icon: "x",
			path: "/x",
			subject: "Tasks",
			view,
			prefetch,
		} as unknown as ModuleManifest,
		prefetch,
	};
}

test("preloads the chunk and runs the module prefetch", () => {
	const preload = vi.fn(() => Promise.resolve(() => null));
	const { manifest, prefetch } = fake(preload);
	prefetchModule(manifest);
	expect(preload).toHaveBeenCalledOnce();
	expect(prefetch).toHaveBeenCalledOnce();
});

test("swallows a rejected preload", async () => {
	const { manifest, prefetch } = fake(() =>
		Promise.reject(new Error("offline"))
	);
	expect(() => {
		prefetchModule(manifest);
	}).not.toThrow();
	await Promise.resolve();
	expect(prefetch).toHaveBeenCalledOnce();
});

test("descriptorModule finds the module by route", () => {
	expect(descriptorModule({ route: "/events" })).toBe(
		modules.find((entry) => entry.id === "events")
	);
	expect(descriptorModule({ route: "/nope" })).toBeUndefined();
});
