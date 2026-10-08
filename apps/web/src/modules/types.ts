import type { Component } from "solid-js";

import type { Subject } from "../lib/ability.tsx";

/** Shape every module manifest follows; the registry renders one route + sidebar
 * entry per manifest. */
export type ModuleManifest = {
	id: string;
	label: string;
	/** Material Symbols ligature shown in the (collapsed) sidebar. */
	icon: string;
	path: string;
	/** Ability subject; the sidebar shows the module when the user can "view" it. */
	subject: Subject;
	view: Component;
};
