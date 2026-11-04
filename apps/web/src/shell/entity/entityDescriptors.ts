import { personEntity } from "../../modules/community/entity.ts";
import { eventsEntity } from "../../modules/events/entity.ts";
import {
	categoryEntity,
	itemEntity,
	itemTypeEntity,
} from "../../modules/inventory/entity.ts";
import { perksEntity } from "../../modules/perks/entity.ts";
import { requestEntity } from "../../modules/perks/requests/requestEntity.ts";
import { projectEntity, taskEntity } from "../../modules/tasks/entity.ts";
import type { EntityDescriptor } from "../../shared/entity/entityDescriptor.ts";
import type { EntityRow } from "../../shared/types.ts";

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
 * anyone who can view the Events page, and so are perks: a member finds the
 * ones still running and any ended one their request is still open on, the
 * board every one. Perk requests are the board's, and list at most one:
 * the last request a peek showed while the palette is open (kept until the
 * palette closes, even once that peek has), else none. The board finds
 * requests on their own tab.
 */
export const entityDescriptors: EntityDescriptor<EntityRow>[] = [
	erase(personEntity),
	erase(taskEntity),
	erase(projectEntity),
	erase(eventsEntity),
	erase(perksEntity),
	erase(requestEntity),
	erase(itemEntity),
	erase(itemTypeEntity),
	erase(categoryEntity),
];
