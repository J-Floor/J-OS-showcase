import { personEntity } from "../../modules/community/entity.ts";
import { eventsEntity } from "../../modules/events/entity.ts";
import {
	categoryEntity,
	itemEntity,
	itemTypeEntity,
} from "../../modules/inventory/entity.ts";
import { projectEntity, taskEntity } from "../../modules/tasks/entity.ts";
import type { EntityRow } from "../types.ts";

import type { EntityDescriptor } from "./entityDescriptor.ts";

/** A descriptor stripped of its specific `Row` type so a heterogeneous set can
 *  live in one array. `EntitySource` only ever calls the functions the
 *  descriptor it was built with supplies, so the erasure is sound. */
function erase<Row extends EntityRow>(
	descriptor: EntityDescriptor<Row>
): EntityDescriptor<EntityRow> {
	return descriptor as unknown as EntityDescriptor<EntityRow>;
}

/**
 * Every entity searchable from the command palette. Order matters here too:
 * it is the tie-break when several rows score the same, and — for a
 * descriptor whose rows resolve before another's — the order groups first
 * appear in on a blank palette.
 *
 * People link to `?person=<id>` and deliberately carry NO tab (see
 * `personEntity`'s docstring: which roster someone belongs to changes, and a
 * guessed `?tab=` would go stale). Tasks/projects are board+core only, which
 * is who `tasks.list`/`projects.list` answer for. Events are searchable for
 * anyone who can view the Events page.
 */
export const entityDescriptors: EntityDescriptor<EntityRow>[] = [
	erase(personEntity),
	erase(taskEntity),
	erase(projectEntity),
	erase(eventsEntity),
	erase(itemEntity),
	erase(itemTypeEntity),
	erase(categoryEntity),
];
