// @vitest-environment happy-dom
import { Sheet } from "@j-os/design-system";
import { cleanup, render, screen } from "@solidjs/testing-library";
import { ConvexError } from "convex/values";
import { afterEach, expect, test, vi } from "vitest";

const { setScore } = vi.hoisted(() => ({ setScore: vi.fn() }));

vi.mock("convex-solidjs", () => ({
	useMutation: () => ({ mutateAsync: setScore }),
}));

import type { Id } from "../../../../convex/_generated/dataModel";

import { useScoreDraft } from "./useScoreDraft.ts";

afterEach(() => {
	cleanup();
	setScore.mockReset();
});

/** The score draft inside an open sheet that shows its save status. */
function renderDraft() {
	let draft!: ReturnType<typeof useScoreDraft>;
	function Grab() {
		draft = useScoreDraft({
			personId: () => "p1" as Id<"people">,
			currentScore: () => 3,
			canScore: () => true,
		});
		return null;
	}
	render(() => (
		<Sheet.Root open onOpenChange={() => {}}>
			<Sheet.Header>
				<Sheet.Title>Applicant</Sheet.Title>
				<Sheet.HeaderActions>
					<Sheet.SaveStatus />
				</Sheet.HeaderActions>
			</Sheet.Header>
			<Grab />
		</Sheet.Root>
	));
	return draft;
}

function status(): HTMLElement {
	return screen.getByRole("status", { name: "Save status" });
}

test("a committed score is Saving… until the server has it, then Changes saved", async () => {
	let resolve!: (value: null) => void;
	setScore.mockReturnValueOnce(
		new Promise<null>((resolveWrite) => {
			resolve = resolveWrite;
		})
	);
	const draft = renderDraft();
	draft.setDraft("7");
	draft.commit();
	expect(status()).toHaveAttribute("data-state", "pending");
	resolve(null);
	await vi.waitFor(() => {
		expect(status()).toHaveAttribute("data-state", "saved");
	});
});

test("a refused score reads Couldn't save, and Retry sends it again", async () => {
	setScore.mockRejectedValueOnce(
		new ConvexError({ code: "Forbidden", message: "You can't do that." })
	);
	setScore.mockResolvedValueOnce(null);
	const draft = renderDraft();
	draft.setDraft("7");
	draft.commit();
	await vi.waitFor(() => {
		expect(status()).toHaveAttribute("data-state", "failed");
	});
	screen.getByRole("button", { name: "Retry" }).click();
	await vi.waitFor(() => {
		expect(status()).toHaveAttribute("data-state", "saved");
	});
	expect(setScore).toHaveBeenLastCalledWith({ personId: "p1", value: 7 });
});

test("a score that changes nothing reports nothing", () => {
	const draft = renderDraft();
	draft.setDraft("3");
	draft.commit();
	expect(setScore).not.toHaveBeenCalled();
	expect(status()).toHaveAttribute("data-state", "idle");
});
