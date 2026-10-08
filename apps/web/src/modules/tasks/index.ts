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
	view: lazyPage(() => import("./TasksPage.tsx").then((m) => m.TasksPage)),
};
