import { api } from "../../../convex/_generated/api";
import { prefetch } from "../../shared/data/queryKeeper.ts";
import { ICONS } from "../../shared/icons.ts";
import { lazyPage } from "../../shared/lazyPage.tsx";
import type { ModuleManifest } from "../types.ts";

export const tasksModule: ModuleManifest = {
	id: "tasks",
	label: "Tasks",
	icon: ICONS.task,
	path: "/tasks",
	subject: "Tasks",
	// Code-split: the page and everything only it imports load on first visit.
	view: lazyPage(() =>
		import("./TasksPage.tsx").then((loaded) => loaded.TasksPage)
	),
	prefetch: () => {
		prefetch(api.tasks.list, {});
		prefetch(api.projects.list, {});
	},
};
