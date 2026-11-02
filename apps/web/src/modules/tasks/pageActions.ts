import { bindPageKeys, newAction } from "../../shared/actions/sheetActions.tsx";
import type {
	ActionDescriptor,
	PageTarget,
} from "../../shared/actions/shortcuts.ts";

/** The Tasks tab's keys: "New task". */
const TASKS_SCOPE = "tasks-tab";
/** The Projects tab's keys: "Today" and "New project". */
const PROJECTS_SCOPE = "projects-tab";

/** The Tasks tab's "New task" (`N`), for the button and the key alike, live
 *  while `isIdle` (the tab is on screen and no sheet is open: `N` must not
 *  start a second task over the one on screen). */
export function createTasksPageActions(options: {
	openNew: () => void;
	isIdle: () => boolean;
}): ActionDescriptor<PageTarget> {
	const newTask = newAction({ noun: "task", open: options.openNew });
	bindPageKeys(TASKS_SCOPE, [newTask], options.isIdle);
	return newTask;
}

/** The Projects tab's "Today" (`T`) and "New project" (`P`). */
export function createProjectsPageActions(options: {
	jumpToday: () => void;
	openNew: () => void;
	isIdle: () => boolean;
}) {
	const today: ActionDescriptor<PageTarget> = {
		id: "today",
		label: "Today",
		icon: "today",
		hotkey: "T",
		can: () => true,
		run: () => {
			options.jumpToday();
		},
	};
	const newProject = newAction({
		noun: "project",
		hotkey: "P",
		open: options.openNew,
	});
	bindPageKeys(PROJECTS_SCOPE, [today, newProject], options.isIdle);
	return { today, newProject };
}
