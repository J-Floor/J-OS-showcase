// @vitest-environment happy-dom
import { afterEach, beforeEach, expect, test, vi } from "vitest";

import { downloadBlob } from "./downloadBlob.ts";

const BLOB_URL = "blob:https://example.com/0000";

/** What the download did, in order. */
let steps: string[] = [];
let created: Blob[] = [];

function recordClick(this: HTMLAnchorElement): void {
	steps.push(`click ${this.href} as ${this.download}`);
}

beforeEach(() => {
	steps = [];
	created = [];
	URL.createObjectURL = vi.fn((blob: Blob) => {
		created.push(blob);
		steps.push("create");
		return BLOB_URL;
	});
	URL.revokeObjectURL = vi.fn((url: string) => {
		steps.push(`revoke ${url}`);
	});
	vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(
		recordClick
	);
});

afterEach(() => {
	vi.restoreAllMocks();
});

test("clicks a link to the blob under the file name, then frees the URL", () => {
	const blob = new Blob(["a,b"], { type: "text/csv" });
	downloadBlob(blob, "perk-requests-2026-10-29.csv");
	expect(created).toHaveLength(1);
	expect(created[0]).toBe(blob);
	// Freed only after the click: the download has its URL by then.
	expect(steps).toEqual([
		"create",
		`click ${BLOB_URL} as perk-requests-2026-10-29.csv`,
		`revoke ${BLOB_URL}`,
	]);
});
