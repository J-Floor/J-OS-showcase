// @vitest-environment happy-dom
import { cleanup, render, screen } from "@solidjs/testing-library";
import { afterEach, beforeAll, expect, test, vi } from "vitest";

// applicationDecisions and GuestExpiryProvider both resolve mutations through
// `useTriage`; mocking it here is enough to mount the real hook tree without a
// ConvexProvider — same pattern ApplicationsTab.test.tsx uses.
vi.mock("./triage.ts", () => ({
	useTriage: () => ({
		approveAsGuest: vi.fn(),
		deny: vi.fn(),
		makeMember: vi.fn(),
		undeny: vi.fn(),
	}),
}));

// Dialog.Root (mounted, unopened, by GuestExpiryProvider) touches ResizeObserver
// on mount even while closed.
beforeAll(() => {
	globalThis.ResizeObserver = class {
		observe() {}
		unobserve() {}
		disconnect() {}
	};
});

afterEach(cleanup);

import { ConfirmProvider } from "../../../shared/confirm.tsx";
import { DecisionBar } from "../drawers/DecisionBar.tsx";

import {
	useApplicationDecisions,
	type Applicant,
} from "./applicationDecisions.ts";
import { GuestExpiryProvider } from "./guestExpiry.tsx";
import { assertNoCollisions, type ActionDescriptor } from "./shortcuts.ts";

let captured: ActionDescriptor<Applicant>[] = [];

// DecisionBar is now a pure renderer of an `ActionDescriptor` list (each tab
// feeds its own). This harness supplies the application descriptors from the real
// hook, so the test still exercises the actual availability rules end to end.
function DecisionBarHarness(props: { person: Applicant }) {
	const decide = useApplicationDecisions();
	return <DecisionBar person={props.person} actions={decide.actions()} />;
}

function Harness() {
	const decide = useApplicationDecisions();
	captured = decide.actions();
	return null;
}

/**
 * `shortcuts.test.ts`'s own collision tests exercise `assertNoCollisions`
 * against stub data; this one runs it against the actual descriptors
 * `useApplicationDecisions` produces, so a real duplicated hotkey in
 * `applicationDecisions.ts` fails a test instead of shipping silently.
 */
test("the real application actions have four distinct hotkeys and no collisions", () => {
	render(() => (
		<GuestExpiryProvider>
			<Harness />
		</GuestExpiryProvider>
	));

	expect(() => {
		assertNoCollisions(captured);
	}).not.toThrow();
	expect(captured.map((action) => action.hotkey).sort()).toEqual([
		"G",
		"M",
		"U",
		"X",
	]);
});

/**
 * The wiring, which nothing else covers.
 *
 * Turning these four decisions into descriptors moved the label, icon and
 * availability of every button out of the JSX and into one object. Nothing
 * type-checks that the right field reached the right slot — a descriptor whose
 * `label` was rendered where its `icon` belongs compiles perfectly — and no
 * pre-existing test found these buttons by name. So this asserts what the board
 * actually sees.
 *
 * The decision bar HIDES an unavailable decision where the roster row disables
 * it with a reason. That difference is deliberate and predates this refactor.
 */
test("the decision bar shows exactly the decisions available to a person", () => {
	// `prospect`, not `applicant`: the tier union is prospect/guest/member/core/
	// board/admin/former, and `can` asks the machine for the legal events of
	// `${tier}.${stage}`. A tier that is not in the union yields no legal events
	// at all, so every decision silently vanishes rather than erroring.
	const verifiedApplicant = {
		_id: "p1",
		tier: "prospect",
		stage: "verified",
		firstName: "Ada",
		lastName: "Lovelace",
	} as unknown as Applicant;

	render(() => (
		<ConfirmProvider>
			<GuestExpiryProvider>
				<DecisionBarHarness person={verifiedApplicant} />
			</GuestExpiryProvider>
		</ConfirmProvider>
	));

	expect(
		screen.getByRole("button", { name: /Make guest/ })
	).toBeInTheDocument();
	expect(
		screen.getByRole("button", { name: /Make member/ })
	).toBeInTheDocument();
	expect(
		screen.getByRole("button", { name: /Turn down/ })
	).toBeInTheDocument();
	// Not merely disabled — absent. Undoing a denial is not on offer for someone
	// who has not been denied.
	expect(screen.queryByRole("button", { name: /Undo deny/ })).toBeNull();
});
