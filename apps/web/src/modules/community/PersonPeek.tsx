import { type JSX, createMemo } from "solid-js";

import type { PersonRow } from "../../../convex/people.ts";
import type { PeekProps } from "../../shared/entity/entityDescriptor.ts";

import { createActionKeys } from "./actions/createActionKeys.ts";
import {
	SHEET_SCOPE,
	type ActionDescriptor,
	type ShortcutScope,
} from "./actions/shortcuts.ts";
import { rosterOf, useReadyRosters, type RosterKey } from "./rosterOf.ts";
import {
	ApplicationsSheetProvider,
	useApplicationsSheet,
} from "./tabs/ApplicationsTab.tsx";
import { useGuestsSheet } from "./tabs/GuestsTab.tsx";
import { useMembersSheet } from "./tabs/MembersTab.tsx";
import { RosterSheet, useSheetEditing } from "./tabs/RosterSheet.tsx";

/** The roster the person is in, once all three have answered. `undefined`
 *  while they are loading and for a person in none of them. A memo, so the
 *  footer swaps only when the person changes roster, not on every refetch. */
function usePersonRoster(person: () => PersonRow | undefined) {
	const rosters = useReadyRosters();
	const roster = createMemo<RosterKey | undefined>(() => {
		const id = person()?._id;
		const ready = rosters();
		return id === undefined || ready === undefined
			? undefined
			: rosterOf(id, ready);
	});
	return roster;
}

/** The person sheet over another page: one sheet whose footer and keys are
 *  the roster tab's for the roster the person is in. The three rosters' setups
 *  are all built, so a person moving roster swaps the footer in place instead
 *  of remounting the sheet or the dialogs the old roster opened. */
function PeekBody(props: PeekProps<PersonRow>): JSX.Element {
	const applications = useApplicationsSheet();
	const sheets = {
		applications,
		members: useMembersSheet(),
		guests: useGuestsSheet(),
	};
	const roster = usePersonRoster(() => props.row);
	function sheetPerson(): PersonRow | undefined {
		return props.open ? props.row : undefined;
	}
	function scope(): ShortcutScope {
		return roster() ?? SHEET_SCOPE;
	}
	function actions(): ActionDescriptor<PersonRow>[] {
		const key = roster();
		return key === undefined ? [] : sheets[key].actions();
	}
	const [editing, setEditing] = useSheetEditing(
		() => props.open,
		() => props.row?._id,
		scope
	);
	createActionKeys<PersonRow>({
		actions,
		sheetPerson,
		// No table under a peek: nothing is checked or ringed.
		selected: () => [],
		focused: () => {},
		onAdvance: () => {},
		onClearSelection: () => {},
		active: () => props.open,
	});
	// eslint-disable-next-line solid/reactivity -- handed on as an accessor, read by the keys' own handlers
	applications.focusedRowKeys(() =>
		roster() === "applications" ? sheetPerson() : undefined
	);

	return (
		<>
			<RosterSheet
				isOpen={props.open}
				prebuild={props.prebuild}
				isLoading={props.loading}
				selected={props.row}
				isEditing={editing()}
				onToggleEditing={() => {
					setEditing((isEditing) => !isEditing);
				}}
				onClose={() => {
					props.onOpenChange(false);
				}}
				actions={actions()}
				scope={scope()}
				footerLead={
					roster() === "applications"
						? applications.footerLead
						: undefined
				}
			/>
			<sheets.members.RoleDialog />
		</>
	);
}

/** The person sheet over any page: the same sheet, footer and keys as the
 *  roster tab the person is in, minus the prev/next arrows. */
export function PersonPeek(props: PeekProps<PersonRow>): JSX.Element {
	return (
		<ApplicationsSheetProvider>
			<PeekBody {...props} />
		</ApplicationsSheetProvider>
	);
}
