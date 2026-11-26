import type { EntityDescriptor } from "../entity/entityDescriptor.ts";
import { slugOf } from "../entity/entityDescriptor.ts";
import { peekValue } from "../entity/peekParam.ts";
import type { EntityRow } from "../types.ts";

/** The key a sheet's row's views are counted under: `<kind>:<slug>`, the
 *  same string a peek link carries. `undefined` on a create form and while
 *  the row loads: those count no view. */
export function rowViewKey<Row extends EntityRow>(
	desc: EntityDescriptor<Row>,
	row: Row | undefined
): string | undefined {
	return row ? peekValue(desc, slugOf(desc, row)) : undefined;
}
