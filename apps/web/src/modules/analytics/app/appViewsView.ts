import { parseViewKey } from "../../../../convex/lib/appViews.ts";
import {
	entityPathOf,
	type EntityDescriptor,
} from "../../../shared/entity/entityDescriptor.ts";
import { parsePeek } from "../../../shared/entity/peekParam.ts";
import type { EntityRow } from "../../../shared/types.ts";
import { personEntity } from "../../community/entity.ts";
import { eventsEntity } from "../../events/entity.ts";
import {
	categoryEntity,
	itemEntity,
	itemTypeEntity,
} from "../../inventory/entity.ts";
import { perksEntity, requestEntity } from "../../perks/entity.ts";
import { projectEntity, taskEntity } from "../../tasks/entity.ts";

const DESCRIPTORS = [
	personEntity,
	eventsEntity,
	categoryEntity,
	itemEntity,
	itemTypeEntity,
	perksEntity,
	requestEntity,
	projectEntity,
	taskEntity,
] as unknown as EntityDescriptor<EntityRow>[];

/** Where an entity view key (`<kind>:<slug>`) opens its sheet, or undefined
 *  for a kind with no page to open. */
export function entityHref(key: string): string | undefined {
	const parsed = parsePeek(key);
	if (!parsed) return undefined;
	const desc = DESCRIPTORS.find((each) => each.key === parsed.kind);
	return desc ? entityPathOf(desc, parsed.slug) : undefined;
}

/** The route of a page view key (`page:events`), or undefined for any
 *  other key. */
export function pageHref(key: string): string | undefined {
	const parsed = parseViewKey(key);
	return parsed?.type === "page" ? `/${parsed.moduleId}` : undefined;
}
