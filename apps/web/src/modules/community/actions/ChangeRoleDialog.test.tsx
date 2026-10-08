// @vitest-environment happy-dom
import {
	cleanup,
	fireEvent,
	render,
	screen,
	waitFor,
} from "@solidjs/testing-library";
import { createSignal } from "solid-js";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ALL_EVENTS } from "../../../../convex/lib/lifecycle.ts";

import { ChangeRoleDialog, MOVES } from "./ChangeRoleDialog.tsx";

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

afterEach(cleanup);

function setup(states: string[] = ["member.active"]) {
	const onMove = vi.fn();
	render(() => (
		<ChangeRoleDialog
			open
			onOpenChange={() => {}}
			count={states.length}
			states={states as never}
			onMove={onMove}
		/>
	));
	return { onMove };
}

function clickSegmentItem(value: string) {
	// Ark renders ItemHiddenInput as a radio <input>; click it to trigger the
	// zag radio-group machine. getByRole("radio") guarantees it's an input.
	const radios = screen.getAllByRole<HTMLInputElement>("radio");
	const radio = radios.find((r) => r.value === value);
	if (!radio) throw new Error(`radio for "${value}" not found`);
	fireEvent.click(radio);
}

function values() {
	return screen.getAllByRole<HTMLInputElement>("radio").map((r) => r.value);
}

/**
 * Click the submit button, once it is actually clickable.
 *
 * DEVIATION from the brief's literal `await waitFor(() => { fireEvent.click(...) })`:
 * @zag-js/radio-group's `SET_VALUE` (fired from `clickSegmentItem`) updates its
 * bindable `value` — and therefore `choice()`/the button's `disabled` — a tick
 * after the click, not within it. `waitFor` only re-polls a callback that
 * THROWS; a bare `fireEvent.click` never throws, disabled or not, so the
 * literal wrapper "succeeds" on its first, premature attempt (button still
 * disabled) and the real click is silently dropped — exactly the failure mode
 * this helper closes by asserting `not.toBeDisabled()` first, which genuinely
 * retries. Every assertion downstream of this helper is unchanged from the
 * brief.
 */
async function clickChangeRole() {
	await waitFor(() => {
		expect(
			screen.getByRole("button", { name: /change role/i })
		).not.toBeDisabled();
	});
	fireEvent.click(screen.getByRole("button", { name: /change role/i }));
}

describe("ChangeRoleDialog", () => {
	it("offers only the moves the machine has an edge for", () => {
		// legalEvents("member.active") =
		//   ONBOARDING_PROGRESSED, KICK_OUT, MARK_LEFT, SET_ROLE,
		//   GRANT_CORE, PROMOTE_TO_BOARD
		setup(["member.active"]);
		expect(values().sort()).toEqual(
			["admin", "board", "core", "kick", "left", "staff"].sort()
		);
		// "member" is suppressed: they are already there.
		// EXTEND_WINDOW and RE_ADMIT are not edges from member.active.
	});

	it("offers re-admit, and nothing destructive, for a former person", () => {
		// legalEvents("former.active") = RE_ADMIT, REAPPLY, SET_ROLE.
		// Every role destination is reachable via SET_ROLE; KICK_OUT and
		// MARK_LEFT are not edges from former.active at all.
		setup(["former.active"]);
		expect(values().sort()).toEqual(
			["admin", "board", "core", "member", "readmit", "staff"].sort()
		);
		expect(values()).not.toContain("kick");
		expect(values()).not.toContain("left");
	});

	it("gives a board member a way back down, and does not offer them their own tier", () => {
		// legalEvents("board.active") = KICK_OUT, MARK_LEFT, SET_ROLE. The three
		// downward destinations all travel SET_ROLE, which is the whole point of
		// it carrying a target tier: without them board.active has no
		// non-destructive exit.
		setup(["board.active"]);
		expect(values().sort()).toEqual(
			["admin", "core", "kick", "left", "member", "staff"].sort()
		);
		expect(values()).not.toContain("board");
	});

	it("offers only what is legal for EVERY selected row", () => {
		// Intersection of member.active and guest.active is
		//   ONBOARDING_PROGRESSED, KICK_OUT, MARK_LEFT, SET_ROLE
		// so every role destination survives (all reachable via SET_ROLE), and
		// EXTEND_WINDOW — legal only from guest.active — does not.
		setup(["member.active", "guest.active"]);
		expect(values()).toContain("kick");
		expect(values()).not.toContain("guest_window");
		expect(values()).not.toContain("readmit");
	});

	it("Cancel requests close and dispatches nothing", async () => {
		const onMove = vi.fn();
		const onOpenChange = vi.fn();
		render(() => (
			<ChangeRoleDialog
				open
				onOpenChange={onOpenChange}
				count={1}
				states={["member.active"] as never}
				onMove={onMove}
			/>
		));
		clickSegmentItem("core");
		fireEvent.click(screen.getByRole("button", { name: /cancel/i }));
		await waitFor(() => {
			expect(onOpenChange).toHaveBeenCalledWith(false);
		});
		expect(onMove).not.toHaveBeenCalled();
	});

	it("resets a stale selection on every open/close transition, so a stale choice cannot silently misfire when the same dialog instance is reused for a different selection", async () => {
		// Reproduces the exact failure mode the 2026-08 review flagged: without a
		// reset, picking "readmit" then cancelling leaves `choice()` at "readmit";
		// reopening the SAME instance (one per row/batch bar, always mounted) on a
		// row where RE_ADMIT isn't legal used to leave the confirm button enabled
		// (`choice() === undefined` is false) while `eventFor` now returns
		// undefined for it, so `confirm()` bailed — nothing happened and the
		// dialog didn't even close.
		const onMove = vi.fn();
		const [open, setOpen] = createSignal(true);
		const [states, setStates] = createSignal<string[]>(["former.active"]);
		render(() => (
			<ChangeRoleDialog
				open={open()}
				onOpenChange={setOpen}
				count={1}
				states={states() as never}
				onMove={onMove}
			/>
		));
		clickSegmentItem("readmit");
		await waitFor(() => {
			expect(
				screen.getByRole("button", { name: /change role/i })
			).not.toBeDisabled();
		});

		// Cancel (close without confirming), then reuse the instance for a
		// different row — exactly how the Members tab's single per-row/batch
		// dialog behaves. RE_ADMIT is not legal from member.active.
		setOpen(false);
		setStates(["member.active"]);
		setOpen(true);

		await waitFor(() => {
			expect(
				screen.getByRole("button", { name: /change role/i })
			).toBeDisabled();
		});
		expect(
			screen
				.getAllByRole<HTMLInputElement>("radio")
				.find((r) => r.checked)
		).toBeUndefined();
		fireEvent.click(screen.getByRole("button", { name: /change role/i }));
		expect(onMove).not.toHaveBeenCalled();
	});

	it("dispatches the most specific event available", async () => {
		// GRANT_CORE comes before SET_ROLE in the "core" row's `via`, and it is
		// legal from member.active, so it wins.
		const { onMove } = setup(["member.active"]);
		clickSegmentItem("core");
		await clickChangeRole();
		await waitFor(() => {
			expect(onMove).toHaveBeenCalledWith({
				kind: "event",
				event: "GRANT_CORE",
			});
		});
	});

	it("falls back to SET_ROLE, carrying the target tier, when the specific event is illegal", async () => {
		// Same destination as the previous test, different origin: GRANT_CORE is
		// not an edge from board.active, so the row degrades to SET_ROLE and the
		// tier travels in the payload.
		const { onMove } = setup(["board.active"]);
		clickSegmentItem("core");
		await clickChangeRole();
		await waitFor(() => {
			expect(onMove).toHaveBeenCalledWith({
				kind: "role",
				tier: "core",
			});
		});
	});

	it("makes a member staff through SET_ROLE", async () => {
		const { onMove } = setup(["member.active"]);
		clickSegmentItem("staff");
		await clickChangeRole();
		await waitFor(() => {
			expect(onMove).toHaveBeenCalledWith({
				kind: "role",
				tier: "staff",
			});
		});
	});

	it("demotes a board member to plain member through SET_ROLE", async () => {
		const { onMove } = setup(["board.active"]);
		clickSegmentItem("member");
		await clickChangeRole();
		await waitFor(() => {
			expect(onMove).toHaveBeenCalledWith({
				kind: "role",
				tier: "member",
			});
		});
	});

	it("degrades a mixed guest+member batch to SET_ROLE — the promotion bypass", async () => {
		// INVARIANT, pinned deliberately: `eventFor` takes the first `via` entry
		// legal for EVERY selected row. PROMOTE_TO_MEMBER is not an edge from
		// member.active, so a batch holding a guest AND a non-guest falls through
		// to SET_ROLE{member} — which does NOT re-open the document step, does
		// NOT send memberUpgrade and does NOT clear the guest window. The guest in
		// that batch is promoted without any of the four consequences the reducer
		// declares for a guest promotion.
		//
		// This is unreachable through the UI today: only the Members tab mounts a
		// ChangeRoleDialog (guestColumns.tsx / GuestsTab.tsx have none), and
		// `memberGroup` has no guest bucket, so no selection can contain both. But
		// nothing in the code enforces that, so it is asserted here rather than
		// left as a comment: if a future GuestsTab gains this dialog, or
		// `memberGroup` gains a guest bucket, this test is the thing that says the
		// batch path silently downgrades a promotion.
		const { onMove } = setup(["guest.active", "member.active"]);
		clickSegmentItem("member");
		await clickChangeRole();
		await waitFor(() => {
			expect(onMove).toHaveBeenCalledWith({
				kind: "role",
				tier: "member",
			});
		});
		expect(onMove).not.toHaveBeenCalledWith({
			kind: "event",
			event: "PROMOTE_TO_MEMBER",
		});
	});

	it("uses PROMOTE_TO_MEMBER for a guest-only selection", async () => {
		// The other half of the invariant above: with every selected row a guest,
		// the specific event IS legal for all of them and wins, so the promotion
		// carries its effects.
		const { onMove } = setup(["guest.active", "guest.onboarding"]);
		clickSegmentItem("member");
		await clickChangeRole();
		await waitFor(() => {
			expect(onMove).toHaveBeenCalledWith({
				kind: "event",
				event: "PROMOTE_TO_MEMBER",
			});
		});
	});

	it("will not extend a guest window without a date", async () => {
		const { onMove } = setup(["guest.active"]);
		clickSegmentItem("guest_window");

		// The confirm stays DISABLED until a date is supplied. It used to be
		// enabled the moment a destination was picked, and clicking it ran a
		// guard that returned early — a button that looked ready, did nothing,
		// and did not say why. The chooser now resolves "Guest window" to no
		// dispatchable move at all while the date is missing, so the control
		// reports that instead of hiding it.
		await waitFor(() => {
			expect(
				screen.getByRole("button", { name: /change role/i })
			).toBeDisabled();
		});
		fireEvent.click(screen.getByRole("button", { name: /change role/i }));
		expect(onMove).not.toHaveBeenCalled();
	});
});

/**
 * Events this dialog deliberately does not offer, and why. `MOVES` is a
 * hardcoded catalogue — the FILTER over it is machine-driven (`eventFor`,
 * tested above), but nothing forces the catalogue itself to grow when `TABLE`
 * gains a new board-facing event. If it ever does, and nobody updates
 * `MOVES` or this list, the drift-guard test below fails instead of the
 * event silently having no UI anywhere.
 */
const EXCLUDED_FROM_DIALOG: string[] = [
	"VERIFY_EMAIL", // self-serve (magic link) — never board-triggered
	"SET_SCORE", // application scoring — its own control (applicationColumns' ScoreCell)
	"APPROVE_GUEST", // application decision — Applications tab's "Make guest"
	"APPROVE_MEMBER", // application decision — Applications tab's "Make member"
	"DENY", // application decision — Applications tab's "Turn down"
	"UNDENY", // application undo — Applications tab's "Undo deny"
	"ONBOARDING_PROGRESSED", // self-serve step completion, not board-triggered
	"IMPORT", // internal-only (Notion import); no UI ever dispatches it
	"WINDOW_EXPIRED", // internal, cron-triggered (the nightly reconciler)
	"REAPPLY", // person-initiated, via the public re-application form
];

describe("MOVES catalogue vs. the machine's full event set", () => {
	it("accounts for every event in ALL_EVENTS — in a MOVES `via` list, or in the documented exclusion set, with no overlap", () => {
		const covered = [...new Set(MOVES.flatMap((m) => [...m.via]))];
		expect([...covered, ...EXCLUDED_FROM_DIALOG].sort()).toEqual(
			[...ALL_EVENTS].sort()
		);
		// A drift guard that's satisfied by double-counting an event on both
		// sides isn't a guard at all.
		expect(covered.filter((e) => EXCLUDED_FROM_DIALOG.includes(e))).toEqual(
			[]
		);
	});
});

describe("destination labels match the roster's own vocabulary", () => {
	it("names the core and former tiers as the Members tab's group headings do", () => {
		// The board reads the table first and comes to this dialog looking for
		// the destination by the name the table gave it. "Core" was reported
		// missing while on screen the whole time, because the roster calls that
		// group "Core members".
		const labels = Object.fromEntries(MOVES.map((m) => [m.value, m.label]));
		expect(labels.core).toBe("Core member");
		expect(labels.left).toBe("Alumni");
	});

	it("labels every option as a destination, never as an instruction", () => {
		// "Move to alumni" was the only one phrased as a command; the rest name
		// where the person ends up. A new option that reads "Move to…",
		// "Mark as…" or "Set …" is the same drift coming back.
		for (const move of MOVES) {
			expect(move.label).not.toMatch(/^(move|mark|set|make)\b/i);
		}
	});
});
