// @vitest-environment happy-dom
import {
	cleanup,
	fireEvent,
	render,
	screen,
	waitFor,
} from "@solidjs/testing-library";
import { ok, okAsync } from "neverthrow";
import { afterEach, expect, test, vi } from "vitest";

import type { Doc } from "../../../../convex/_generated/dataModel";
import { RoleSection } from "../sheets/RoleSection.tsx";

import { ChangeRoleDialog } from "./ChangeRoleDialog.tsx";
import { RoleChooser } from "./RoleChooser.tsx";

afterEach(cleanup);

// jsdom gaps that ark-ui / the design-system Segment + Dialog touch at mount.
if (!(Element.prototype as { scrollTo?: unknown }).scrollTo) {
	Element.prototype.scrollTo = () => {};
}
if (!(Element.prototype as { hasPointerCapture?: unknown }).hasPointerCapture) {
	Element.prototype.hasPointerCapture = () => false;
}
if (!("ResizeObserver" in globalThis)) {
	(globalThis as Record<string, unknown>).ResizeObserver = class {
		observe() {}
		unobserve() {}
		disconnect() {}
	};
}

const { grantCoreMock } = vi.hoisted(() => ({
	grantCoreMock: vi.fn(() => okAsync(undefined)),
}));

vi.mock("./triage.ts", () => ({
	useTriage: () => ({ grantCore: grantCoreMock }),
}));

function chooseCore() {
	// Ark renders the segment items as radio inputs; clicking one drives the
	// radio-group machine.
	const radio = screen
		.getAllByRole<HTMLInputElement>("radio")
		.find((candidate) => candidate.value === "core");
	if (!radio) throw new Error("no core option");
	fireEvent.click(radio);
}

async function clickCommit() {
	await waitFor(() => {
		expect(
			screen.getByRole("button", { name: /change role/i })
		).not.toBeDisabled();
	});
	fireEvent.click(screen.getByRole("button", { name: /change role/i }));
}

test("RoleChooser.Commit stays disabled until a destination is chosen", () => {
	render(() => (
		<RoleChooser.Root states={["member.active"]} onMove={vi.fn()}>
			<RoleChooser.Commit />
		</RoleChooser.Root>
	));
	expect(screen.getByRole("button", { name: /change role/i })).toBeDisabled();
});

test("RoleChooser.Commit commits the chosen move, then calls onDone", async () => {
	const onMove = vi.fn(() => Promise.resolve(ok(undefined)));
	const onDone = vi.fn();
	render(() => (
		<RoleChooser.Root
			states={["member.active"]}
			onMove={onMove}
			onDone={onDone}
		>
			<RoleChooser.Commit />
		</RoleChooser.Root>
	));
	chooseCore();
	await clickCommit();
	await waitFor(() => {
		expect(onMove).toHaveBeenCalledWith({
			kind: "event",
			event: "GRANT_CORE",
		});
	});
	await waitFor(() => {
		expect(onDone).toHaveBeenCalledTimes(1);
	});
});

test("the dialog's Change role commits through RoleChooser.Commit", async () => {
	const onMove = vi.fn(() => Promise.resolve(ok(undefined)));
	render(() => (
		<ChangeRoleDialog
			open
			onOpenChange={() => {}}
			count={1}
			states={["member.active"]}
			onMove={onMove}
		/>
	));
	chooseCore();
	await clickCommit();
	await waitFor(() => {
		expect(onMove).toHaveBeenCalledWith({
			kind: "event",
			event: "GRANT_CORE",
		});
	});
});

test("the sheet's RoleSection commits through RoleChooser.Commit", async () => {
	grantCoreMock.mockClear();
	render(() => (
		<RoleSection
			person={
				{
					_id: "p1",
					tier: "member",
					stage: "active",
				} as unknown as Doc<"people">
			}
		/>
	));
	chooseCore();
	await clickCommit();
	await waitFor(() => {
		expect(grantCoreMock).toHaveBeenCalledWith("p1");
	});
});
