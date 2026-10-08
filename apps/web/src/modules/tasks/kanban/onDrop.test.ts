import { expect, test } from "vitest";

import { resolveDrop } from "./onDrop.ts";

const tasks = [{ _id: "t1", status: "backlog" }] as never[];

test("returns id + new status when moved to another column", () => {
	expect(resolveDrop("t1", "in_progress", tasks)).toEqual({
		id: "t1",
		status: "in_progress",
	});
});
test("returns null when dropped on the same column", () => {
	expect(resolveDrop("t1", "backlog", tasks)).toBeNull();
});
test("returns null for unknown task or column", () => {
	expect(resolveDrop("nope", "done", tasks)).toBeNull();
	expect(resolveDrop("t1", "garbage", tasks)).toBeNull();
});
