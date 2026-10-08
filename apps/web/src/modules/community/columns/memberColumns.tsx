import { IconButton, type JfColumnDef } from "@j-os/design-system";
import { For, createSignal } from "solid-js";

import type { Doc, Id } from "../../../../convex/_generated/dataModel";
import type { PersonStatus } from "../../../../convex/lib/derive.ts";
import { SHORT_TEXT_SIZE } from "../../../shared/columnSizes.ts";
import { formatDate } from "../../../shared/time.ts";
import { ChangeRoleDialog } from "../actions/ChangeRoleDialog.tsx";
import type { RoleMove } from "../actions/ChangeRoleDialog.tsx";
import { useMemberActions } from "../actions/memberActions.ts";
import { useTriage } from "../actions/triage.ts";
import { FLAG_FILTER_OPTIONS, flagFilterValue } from "../status/copy.ts";
import { FlagsCell } from "../status/FlagsCell.tsx";

import { actionsColumnSize, RowActions } from "./RowActions.tsx";
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
	if (row.tier === "core") return "core";
	return "member";
}

/**
 * Compile-time exhaustiveness check for `applyMove`'s event branch. If this is
 * ever actually called, `RoleMove["event"]` grew a literal with no branch
 * above it — throwing here (rather than falling through to some default
 * action) is the point: the review that flagged this found the OLD final
 * `else` silently defaulted to `triage.kickOut`, so a `RoleMove` that matched
 * nothing kicked the person out of the building instead of failing loudly.
 */
function assertNever(value: never): never {
	throw new Error(`applyMove: unhandled RoleMove event ${String(value)}`);
}

/** Turn the dialog's choice into the matching triage call, for one row or many. */
export async function applyMove(
	triage: ReturnType<typeof useTriage>,
	ids: Id<"people">[],
	move: RoleMove
): Promise<void> {
	for (const id of ids) {
		if (move.kind === "extendWindow") {
			await triage.extendWindow(id, move.until);
			continue;
		}
		if (move.kind === "role") {
			// One call for every role move in both directions; the tier is the
			// destination, not a role label.
			await triage.setRole(id, move.tier);
			continue;
		}
		// A `switch`, not an `if`/`else if` chain ending in a bare `else`: once
		// every other case is listed, TS narrows `move.event` in the `default`
		// arm to `never` on its own, so `assertNever` is reachable only if
		// `RoleMove["event"]` grows a literal this switch doesn't handle — and,
		// unlike an `if (move.event === "KICK_OUT") {…} else {…}` chain, nothing
		// here is a comparison `@typescript-eslint/no-unnecessary-condition` can
		// call "always true" once every other branch is a `case`.
		switch (move.event) {
			case "PROMOTE_TO_MEMBER":
				await triage.upgradeToMember(id);
				break;
			case "GRANT_CORE":
				await triage.grantCore(id);
				break;
			case "REVOKE_CORE":
				await triage.revokeCore(id);
				break;
			case "PROMOTE_TO_BOARD":
				await triage.promoteToBoard(id);
				break;
			case "RE_ADMIT":
				await triage.reAdmit(id);
				break;
			case "MARK_LEFT":
				await triage.markLeft(id);
				break;
			case "KICK_OUT":
				await triage.kickOut(id);
				break;
			default:
				assertNever(move.event);
		}
	}
}

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
					<IconButton
						tooltipLabel={action.label}
						shortcut={action.hotkey}
						disabled={!action.can(props.row)}
						// The union behind `disabled` demands a reason whenever the
						// button can be disabled at all, so this cannot be
						// optional. The fallback is unreachable for an action
						// whose `can` is always true — never disabled, so its
						// reason is never shown.
						disabledReason={
							action.disabledReason?.(props.row) ?? action.label
						}
						onClick={() => void action.run(props.row)}
					>
						{action.icon}
					</IconButton>
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
export function memberColumns(): JfColumnDef<MemberRow>[] {
	return [
		{
			// Hidden grouping column — board / members / kicked-out. Derived (not a
			// raw field) so kicked-out applicants get their own bucket. Group order
			// follows `enumOptions`.
			id: "group",
			header: "Group",
			dataType: "enum",
			enumOptions: groupOptions,
			accessorFn: (r) => memberGroup(r),
		},
		{ accessorKey: "firstName", header: "First name", dataType: "string" },
		{ accessorKey: "lastName", header: "Last name", dataType: "string" },
		{
			// Exceptions only — the group header above the row already carries the
			// tier and stage. Filterable/sortable on the flag text, so "show me
			// everyone with something outstanding" is a column filter.
			id: "flags",
			header: "Flags",
			dataType: "enum",
			// Ids, not labels: the filter compares stable values while the cell
			// renders the wording. A row may carry several, which the enum filter
			// now matches on any-of.
			enumOptions: FLAG_FILTER_OPTIONS,
			size: 240,
			accessorFn: (r) => r.status.flags.map(flagFilterValue),
			cell: (info) => <FlagsCell status={info.row.original.status} />,
		},
		{
			id: "ventureName",
			header: "Venture",
			dataType: "string",
			size: SHORT_TEXT_SIZE,
			measureText: false,
			accessorFn: (r) => r.venture?.name ?? "",
		},
		...ventureColumns<MemberRow>(),
		{
			id: "joinedAt",
			header: "Joined",
			dataType: "date",
			size: "content",
			accessorFn: (r) => r._creationTime,
			cell: (info) => formatDate(info.row.original._creationTime),
			measureText: (r) => formatDate(r._creationTime),
		},
		{
			id: "actions",
			header: "",
			disableRowClick: true,
			// The agreement, change role, and kick out.
			size: actionsColumnSize(3),
			cell: (info) => <MemberActions row={info.row.original} />,
		},
	];
}
