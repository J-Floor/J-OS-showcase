// @vitest-environment happy-dom
import { ConvexError } from "convex/values";
import { createRoot, createSignal } from "solid-js";
import { expect, test, vi } from "vitest";

const { setScore } = vi.hoisted(() => ({ setScore: vi.fn() }));

vi.mock("convex-solidjs", () => ({
	useMutation: () => ({ mutateAsync: setScore }),
}));

import type { Id } from "../../../../convex/_generated/dataModel";

import { useScoreDraft } from "./useScoreDraft.ts";

const forbidden = new ConvexError({
	code: "Forbidden",
	message: "You can't do that.",
});

function deferredRejection() {
	let reject!: (reason: unknown) => void;
	const promise = new Promise<unknown>((_resolve, rejectPromise) => {
		reject = rejectPromise;
	});
	return { promise, reject };
}

function setup(initialId: string) {
	return createRoot((dispose) => {
		const [personId, setPersonId] = createSignal(initialId);
		const draft = useScoreDraft({
			personId: () => personId() as Id<"people">,
			currentScore: () => 3,
			canScore: () => true,
		});
		return { ...draft, setPersonId, dispose };
	});
}

test("a refused score snaps back to the server value and says why", async () => {
	setScore.mockRejectedValueOnce(forbidden);
	const form = setup("p1");
	form.setDraft("7");
	expect(form.display()).toBe("7");
	form.commit();
	await vi.waitFor(() => {
		expect(form.error()).toBe("You can't do that.");
	});
	expect(form.display()).toBe("3");
	form.dispose();
});

test("a late refusal for the previous person is not shown on the next", async () => {
	const deferred = deferredRejection();
	setScore.mockReturnValueOnce(deferred.promise);
	const form = setup("p1");
	form.setDraft("7");
	form.commit();
	form.setPersonId("p2");
	deferred.reject(forbidden);
	await new Promise((resolve) => setTimeout(resolve, 0));
	expect(form.error()).toBeNull();
	form.dispose();
});
