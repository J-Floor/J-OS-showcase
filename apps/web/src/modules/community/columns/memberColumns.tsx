import { fieldColumn, type JfColumnDefinition } from "@j-os/design-system";
import { ok, type Result } from "neverthrow";
import { For, createSignal } from "solid-js";

import type { Doc, Id } from "../../../../convex/_generated/dataModel";
import type { PersonStatus } from "../../../../convex/lib/derive.ts";
import { invariant } from "../../../../convex/lib/result.ts";
import type { ClientError } from "../../../lib/call.ts";
import { SHORT_TEXT_SIZE } from "../../../shared/columnSizes.ts";
import { ChangeRoleDialog } from "../actions/ChangeRoleDialog.tsx";
import type { RoleMove } from "../actions/ChangeRoleDialog.tsx";
import { useMemberActions } from "../actions/memberActions.ts";
import { type TriageResult, useTriage } from "../actions/triage.ts";
import { personFields } from "../fields.ts";

import { flagsColumn } from "./flagsColumn.tsx";
import { joinedColumn } from "./joinedColumn.ts";
import {
	actionsColumnSize,
	RowActionButton,
	RowActions,
} from "./RowActions.tsx";
import { ventureColumns } from "./ventureColumns.tsx";

export type MemberRow = Doc<"people"> & {
	status: PersonStatus;
	hasAgreement: boolean;
};

/** The group a person falls into in the Members tab, derived from the machine.
 *  Placement follows the LAST tier: a former member stays in this tab.
 *
 *  `former` splits in two. Someone who resigned and someone who was thrown out
 *  are not the same thing, and filing both under "Kicked out" states something
 *  false about the first — which no per-row flag can undo, because the heading
 *  is read first and believed. `MARK_LEFT` and `KICK_OUT` are separate events
 *  precisely because the distinction matters; the tab now says so. */
export function memberGroup(
	row: MemberRow
):
	| "board"
	| "admin"
	| "staff"
	| "core"
	| "member"
	| "not_onboarded"
	| "alumni"
	| "kicked_out" {
	if (row.tier === "former")
		return row.formerReason === "left" ? "alumni" : "kicked_out";
	if (row.tier === "board") return "board";
	if (row.tier === "admin") return "admin";
	if (row.tier === "staff") return "staff";
	if (row.stage === "onboarding") return "not_onboarded";
	return row.tier === "core" ? "core" : "member";
}

/**
 * Compile-time exhaustiveness check for `applyMove`'s event branch. If this is
 * ever actually called, `RoleMove["event"]` grew a literal with no branch
 * above it — failing here (rather than falling through to some default
 * action) is the point: the review that flagged this found the OLD final
 * `else` silently defaulted to `triage.kickOut`, so a `RoleMove` that matched
 * nothing kicked the person out of the building instead of failing loudly.
 */
function assertNever(value: never): never {
	invariant(false, `applyMove: unhandled RoleMove event ${String(value)}`);
}

type Triage = ReturnType<typeof useTriage>;

// A `switch`, not an `if`/`else if` chain ending in a bare `else`: once
// every other case is listed, TS narrows `event` in the `default` arm to
// `never` on its own, so `assertNever` is reachable only if
// `RoleMove["event"]` grows a literal this switch doesn't handle — and,
// unlike an `if (event === "KICK_OUT") {…} else {…}` chain, nothing here is
// a comparison `@typescript-eslint/no-unnecessary-condition` can call
// "always true" once every other branch is a `case`.
function applyEventMove(
	triage: Triage,
	id: Id<"people">,
	event: Extract<RoleMove, { kind: "event" }>["event"]
): TriageResult {
	switch (event) {
		case "PROMOTE_TO_MEMBER":
			return triage.upgradeToMember(id);
		case "GRANT_CORE":
			return triage.grantCore(id);
		case "REVOKE_CORE":
			return triage.revokeCore(id);
		case "PROMOTE_TO_BOARD":
			return triage.promoteToBoard(id);
		case "RE_ADMIT":
			return triage.reAdmit(id);
		case "MARK_LEFT":
			return triage.markLeft(id);
		case "KICK_OUT":
			return triage.kickOut(id);
		default:
			return assertNever(event);
	}
}

function applyOneMove(
	triage: Triage,
	id: Id<"people">,
	move: RoleMove
): TriageResult {
	if (move.kind === "extendWindow")
		return triage.extendWindow(id, move.until);
	// One call for every role move in both directions; the tier is the
	// destination, not a role label.
	return move.kind === "role"
		? triage.setRole(id, move.tier)
		: applyEventMove(triage, id, move.event);
}

/** Turn the dialog's choice into the matching triage call, for one row or many.
 *  Stops at the first failure and resolves to it, so the dialog can show why. */
export async function applyMove(
	triage: Triage,
	ids: Id<"people">[],
	move: RoleMove
): Promise<Result<unknown, ClientError>> {
	for (const id of ids) {
		const result = await applyOneMove(triage, id, move);
		if (result.isErr()) return result;
	}
	return ok(undefined);
}

const MEMBER_ACTION_COUNT = 3;

/** Group order for the hidden grouping column: board, admins, staff, core
 * members, members, then the kicked-out archive at the bottom. */
const groupOptions = [
	{ value: "board", label: "Board" },
	{ value: "admin", label: "Admins" },
	{ value: "staff", label: "Staff" },
	{ value: "core", label: "Core members" },
	{ value: "member", label: "Members" },
	{ value: "not_onboarded", label: "Approved, haven't onboarded" },
	{ value: "alumni", label: "Alumni" },
	{ value: "kicked_out", label: "Kicked out" },
] as const;

/** Per-row actions for the Members tab: view agreement / change role / kick
 * out. Labels, icons and availability all come from `useMemberActions`, shared
 * with the batch bar and the (future) key bindings — this component just
 * renders whatever it offers. */
function MemberActions(props: { row: MemberRow }) {
	const triage = useTriage();
	const [roleOpen, setRoleOpen] = createSignal(false);
	const memberActions = useMemberActions({
		onChangeRole: () => {
			setRoleOpen(true);
		},
		group: memberGroup,
	});
	return (
		<RowActions>
			<For each={memberActions.actions()}>
				{(action) => (
					<RowActionButton action={action} row={props.row} />
				)}
			</For>
			<ChangeRoleDialog
				open={roleOpen()}
				onOpenChange={setRoleOpen}
				states={[`${props.row.tier}.${props.row.stage}`]}
				count={1}
				onMove={(move) => applyMove(triage, [props.row._id], move)}
			/>
		</RowActions>
	);
}

/**
 * Member table columns.
 *
 * A function rather than a constant so it stays symmetrical with
 * {@link guestColumns}, which has to be one — and so the venture columns below
 * are built once per call rather than shared by reference across two tables.
 */
export function memberColumns(): JfColumnDefinition<MemberRow>[] {
	return [
		{
			// Hidden grouping column — board / members / kicked-out. Derived (not a
			// raw field) so kicked-out applicants get their own bucket. Group order
			// follows `enumOptions`.
			id: "group",
			header: "Group",
			dataType: "enum",
			enumOptions: groupOptions,
			accessorFn: (row) => memberGroup(row),
		},
		fieldColumn(personFields.firstName, {
			accessorKey: "firstName",
			dataType: "string",
		}),
		fieldColumn(personFields.lastName, {
			accessorKey: "lastName",
			dataType: "string",
		}),
		flagsColumn<MemberRow>(),
		fieldColumn(personFields.ventureName, {
			dataType: "string",
			size: SHORT_TEXT_SIZE,
			measureText: false,
			accessorFn: (row) => row.venture?.name ?? "",
		}),
		...ventureColumns<MemberRow>(),
		joinedColumn<MemberRow>(),
		{
			id: "actions",
			header: "",
			disableRowClick: true,
			// The agreement, change role, and kick out.
			size: actionsColumnSize(MEMBER_ACTION_COUNT),
			cell: (info) => <MemberActions row={info.row.original} />,
		},
	];
}
