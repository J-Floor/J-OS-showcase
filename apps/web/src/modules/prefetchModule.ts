import { modules } from "./registry.ts";
import type { ModuleManifest } from "./types.ts";

/** Loads a module's page chunk ahead of a visit. Failures are ignored. */
export function preloadView(module: ModuleManifest): void {
	void module.view.preload().catch(() => {});
}

/** Warms a module's page chunk and list queries ahead of a visit. */
export function prefetchModule(module: ModuleManifest): void {
	preloadView(module);
	module.prefetch?.();
}

/** The module whose page an entity descriptor deep-links into. */
export function descriptorModule(desc: {
	route: string;
}): ModuleManifest | undefined {
	return modules.find((entry) => entry.path === desc.route);
}
