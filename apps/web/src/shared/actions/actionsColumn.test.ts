// @vitest-environment happy-dom
import { actionsColumnSize } from "@j-os/design-system";
import { expect, test } from "vitest";

import { actionsColumn } from "./actionsColumn.ts";

function cell(): null {
	return null;
}

test("no actions, no column", () => {
	expect(actionsColumn({ count: 0, cell })).toEqual([]);
});

test("a display column, sized for its buttons, that opens no row", () => {
	const [column] = actionsColumn({ count: 3, cell });
	expect(column.id).toBe("actions");
	expect(column.header).toBe("");
	expect(column.size).toBe(actionsColumnSize(3));
	expect(column.disableRowClick).toBe(true);
	expect(column.cell).toBe(cell);
	expect(column).not.toHaveProperty("dataType");
});
