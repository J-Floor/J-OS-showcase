// @vitest-environment node
import { expect, test, vi } from "vitest";

import { downloadBlob } from "../../../shared/downloadBlob.ts";

import { downloadPdf } from "./downloadPdf.ts";

vi.mock("../../../shared/downloadBlob.ts", () => ({ downloadBlob: vi.fn() }));

test("hands the bytes on as a PDF, under the same file name", async () => {
	const bytes = new Uint8Array([0x25, 0x50, 0x44, 0x46]);
	downloadPdf(bytes, "inventory-list-2026-10-29.pdf");
	expect(downloadBlob).toHaveBeenCalledOnce();
	const [blob, filename] = vi.mocked(downloadBlob).mock.calls[0];
	expect(filename).toBe("inventory-list-2026-10-29.pdf");
	expect(blob.type).toBe("application/pdf");
	expect(new Uint8Array(await blob.arrayBuffer())).toEqual(bytes);
});
