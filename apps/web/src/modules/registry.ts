import { communityModule } from "./community/index.ts";
import { eventsModule } from "./events/index.ts";
import { inventoryModule } from "./inventory/index.ts";
import { spaceModule } from "./space/index.ts";
import { tasksModule } from "./tasks/index.ts";
import type { ModuleManifest } from "./types.ts";

// Each manifest carries an ability `subject`; the Sidebar shows a module only
// when the current role can "view" it (see Sidebar.tsx), and the routes are
// gated on the same subject (see routing/index.tsx). `tasks` and `inventory`
// are board-only. Order is priority on a phone: the bottom bar shows the first
// four pages and overflows the rest into its more item, so the last overflows
// first.
export const modules: ModuleManifest[] = [
	communityModule,
	spaceModule,
	eventsModule,
	inventoryModule,
	// perk page goes here
	tasksModule,
];
