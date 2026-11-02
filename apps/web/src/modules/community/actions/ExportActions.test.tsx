// @vitest-environment happy-dom
import { Sheet, ShortcutPeekProvider } from "@j-os/design-system";
import {
	cleanup,
	fireEvent,
	render,
	screen,
	waitFor,
	within,
} from "@solidjs/testing-library";
import { createSignal } from "solid-js";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { PersonRow } from "../../../../convex/people.ts";
import { ConfirmProvider } from "../../../shared/confirm.tsx";
import { ShortcutPeekButton } from "../../../shared/ShortcutPeekButton.tsx";

import { ExportActions } from "./ExportActions.tsx";

function row(over: Record<string, unknown>): PersonRow {
	return {
		_id: "id",
		_creationTime: 1,
		firstName: "Ada",
		lastName: "Lovelace",
		tier: "member",
		stage: "active",
		...over,
	} as unknown as PersonRow;
}

const appRows = [
	row({
		_id: "a1",
		email: "a@example.com",
		tier: "member",
		stage: "submitted",
		status: { label: "New" },
	}),
];
const memberRows = [
	row({ _id: "m1", email: "m@example.com", status: { s: 1 } }),
];
const guestRows = [
	row({ _id: "g1", email: "g@example.com", tier: "guest", stage: "active" }),
];

vi.mock("../data/communityData.tsx", () => ({
	useApplications: () => ({ data: () => appRows }),
	useMembers: () => ({ data: () => memberRows }),
	useGuests: () => ({ data: () => guestRows }),
}));

let blobs: Blob[] = [];
let clickSpy: ReturnType<typeof vi.spyOn>;
let downloadNames: string[] = [];
const writeText = vi.fn();

beforeEach(() => {
	blobs = [];
	downloadNames = [];
	writeText.mockReset().mockResolvedValue(undefined);
	Object.defineProperty(navigator, "clipboard", {
		value: { writeText },
		configurable: true,
	});
	URL.createObjectURL = vi.fn((blob: Blob) => {
		blobs.push(blob);
		return "blob:x";
	});
	URL.revokeObjectURL = vi.fn();
	clickSpy = vi
		.spyOn(HTMLAnchorElement.prototype, "click")
		.mockImplementation(function (this: HTMLAnchorElement) {
			downloadNames.push(this.download);
		});
});

afterEach(() => {
	cleanup();
	vi.restoreAllMocks();
});

/** The D and C buttons' key chips, `null` where hidden. */
function chips(): (Element | null)[] {
	return ["Download JSON", "Copy JSON"].map((name) =>
		screen.getByRole("button", { name }).querySelector("kbd")
	);
}

describe("ExportActions", () => {
	it("copies the light JSON without status or _id", async () => {
		render(() => <ExportActions />);
		fireEvent.click(screen.getByRole("button", { name: "Copy JSON" }));
		await waitFor(() => {
			expect(writeText).toHaveBeenCalledOnce();
		});
		const text = writeText.mock.calls[0][0] as string;
		expect(text).toContain("a@example.com");
		expect(text).not.toContain('"status"');
		expect(text).not.toContain("_id");
	});

	it("downloads the full JSON once the confirm dialog is accepted", async () => {
		render(() => (
			<ConfirmProvider>
				<ExportActions />
			</ConfirmProvider>
		));
		fireEvent.click(
			screen.getByRole("button", { name: "Download full JSON (dev)" })
		);
		const dialog = await screen.findByRole("dialog");
		expect(within(dialog).getByText(/KB/)).toBeTruthy();
		expect(clickSpy).not.toHaveBeenCalled();
		fireEvent.click(
			within(dialog).getByRole("button", { name: /^Download/ })
		);
		await waitFor(() => {
			expect(clickSpy).toHaveBeenCalledOnce();
		});
		expect(downloadNames).toEqual(["jfloor-export-full.json"]);
		const text = await blobs[0].text();
		expect(text).toContain('"status"');
	});

	it("asks first under a ConfirmProvider, and Cancel downloads nothing", async () => {
		render(() => (
			<ConfirmProvider>
				<ExportActions />
			</ConfirmProvider>
		));
		fireEvent.click(
			screen.getByRole("button", { name: "Download full JSON (dev)" })
		);
		expect(await screen.findByText(/KB/)).toBeTruthy();
		expect(clickSpy).not.toHaveBeenCalled();
		fireEvent.click(await screen.findByRole("button", { name: /cancel/i }));
		// Let the dismissal settle the confirm promise before asserting.
		await new Promise((resolve) => setTimeout(resolve, 0));
		expect(clickSpy).not.toHaveBeenCalled();
		expect(blobs).toHaveLength(0);
	});

	it("D downloads and C copies, but neither while an overlay covers the page", async () => {
		const [isCovering, setCovering] = createSignal(true);
		render(() => (
			<>
				<ExportActions />
				<Sheet.Root open={isCovering()} onOpenChange={() => {}}>
					<Sheet.Header>
						<Sheet.Title>Covering sheet</Sheet.Title>
					</Sheet.Header>
				</Sheet.Root>
			</>
		));
		fireEvent.keyDown(document, { key: "d" });
		fireEvent.keyDown(document, { key: "c" });
		await new Promise((resolve) => setTimeout(resolve, 0));
		expect(clickSpy).not.toHaveBeenCalled();
		expect(writeText).not.toHaveBeenCalled();
		setCovering(false);
		await waitFor(() => {
			fireEvent.keyDown(document, { key: "d" });
			expect(downloadNames).toContain("jfloor-export.json");
		});
		fireEvent.keyDown(document, { key: "c" });
		await waitFor(() => {
			expect(writeText).toHaveBeenCalledOnce();
		});
	});

	it("hides the D and C chips while peeking under a covering sheet: their keys are quiet", async () => {
		const [isCovering, setCovering] = createSignal(false);
		render(() => (
			<ShortcutPeekProvider>
				<ShortcutPeekButton />
				<ExportActions />
				<Sheet.Root open={isCovering()} onOpenChange={() => {}}>
					<Sheet.Header>
						<Sheet.Title>Covering sheet</Sheet.Title>
					</Sheet.Header>
				</Sheet.Root>
			</ShortcutPeekProvider>
		));
		fireEvent.click(screen.getByRole("button", { name: /shortcut/i }));
		expect(chips().every((chip) => chip !== null)).toBe(true);
		setCovering(true);
		await waitFor(() => {
			expect(chips()).toEqual([null, null]);
		});
		setCovering(false);
		await waitFor(() => {
			expect(chips().every((chip) => chip !== null)).toBe(true);
		});
	});
});
