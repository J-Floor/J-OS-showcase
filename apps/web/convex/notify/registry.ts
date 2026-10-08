import { v, type Infer } from "convex/values";

import { doorAlert } from "./kinds/doorAlert.ts";
import { eventEndingSoon } from "./kinds/eventEndingSoon.ts";
import { eventStartingSoon } from "./kinds/eventStartingSoon.ts";
import { guestAccessChanged } from "./kinds/guestAccessChanged.ts";
import { guestExpired } from "./kinds/guestExpired.ts";
import { guestExpiringSoon } from "./kinds/guestExpiringSoon.ts";
import { lifecycleAlert } from "./kinds/lifecycleAlert.ts";
import { newApplication } from "./kinds/newApplication.ts";
import { projectAssigned } from "./kinds/projectAssigned.ts";
import { taskAssigned } from "./kinds/taskAssigned.ts";
import type { AnyKindDef } from "./types.ts";

/** Every notification kind. Adding one = one file in `kinds/` + one entry
 *  here; {@link kindValidator} follows. */
export const KINDS = {
	eventStartingSoon,
	eventEndingSoon,
	newApplication,
	doorAlert,
	guestExpiringSoon,
	guestExpired,
	guestAccessChanged,
	taskAssigned,
	projectAssigned,
	lifecycleAlert,
};

export type KindName = keyof typeof KINDS;

/** The payload `notify(ctx, kind, payload)` must pass for `kind`. */
export type PayloadOf<K extends KindName> = Infer<(typeof KINDS)[K]["payload"]>;

const KIND_NAMES = Object.keys(KINDS) as KindName[];

export const kindValidator = v.union(
	...KIND_NAMES.map((kind) => v.literal(kind))
);

/** The definition behind a kind name, with its payload widened. Callers are
 *  typed at `notify`, so dispatch can treat every kind alike. */
export function kindDef(kind: KindName): AnyKindDef {
	return KINDS[kind];
}
