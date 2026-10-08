// The module route paths a user can land on. Mirror of the frontend module
// registry (apps/web/src/modules/*) — keep this in sync when adding, removing,
// or renaming a module. Used to validate `lastPath` so only a real, navigable
// route is ever stored (the client redirects to it on `/` and on 404).
export const MODULE_PATHS = [
	"/community",
	"/space",
	"/events",
	"/tasks",
	"/inventory",
] as const;

export type ModulePath = (typeof MODULE_PATHS)[number];

export function isModulePath(path: string): path is ModulePath {
	return (MODULE_PATHS as readonly string[]).includes(path);
}
