import { Sheet, morphPart } from "@j-os/design-system";
import {
	type Accessor,
	type JSX,
	Show,
	createEffect,
	createSignal,
	on,
} from "solid-js";

import type { PersonRow } from "../../../../convex/people.ts";
import { ActionBar } from "../../../shared/actions/ActionBar.tsx";
import type { ActionDescriptor } from "../../../shared/actions/shortcuts.ts";
import { EditToggle } from "../../../shared/components/EditToggle.tsx";
import type { SheetNavState } from "../../../shared/entity/createSheetNav.ts";
import { EntitySheetNav } from "../../../shared/entity/EntitySheetNav.tsx";
import { SheetFooter } from "../../../shared/entity/SheetFooter.tsx";
import {
	rosterActionMessage,
	setShownPerson,
} from "../actions/RosterActionError.tsx";
import type { ShortcutScope } from "../actions/shortcuts.ts";
import { personFields } from "../fields.ts";
import { PersonDetail } from "../sheets/PersonDetail.tsx";
import { PersonDetailPlaceholder } from "../sheets/PersonDetailPlaceholder.tsx";

/** What goes in the sheet's footer above the decision buttons, given the
 *  person the sheet shows. */
export type FooterLead = (person: Accessor<PersonRow>) => JSX.Element;

/** The sheet's title: the person's full name, each half its own field so
 *  the row's name cells fly into it (and back) on their own. */
function PersonTitle(props: {
	isLoading: boolean;
	person: PersonRow | undefined;
}): JSX.Element {
	return (
		<Sheet.Title loading={props.isLoading}>
			<span {...morphPart(personFields.firstName)}>
				{props.person?.firstName}
			</span>{" "}
			<span {...morphPart(personFields.lastName)}>
				{props.person?.lastName}
			</span>
		</Sheet.Title>
	);
}

/** The person sheet every roster shows: on its tab, and as a peek over
 *  another page. `nav` is the tab's prev/next; a peek has none. */
export function RosterSheet<Row extends PersonRow>(props: {
	isOpen: boolean;
	/** Build the sheet ahead of its first open (a row's hover intent). */
	prebuild?: boolean;
	isLoading: boolean;
	selected: Row | undefined;
	isEditing: boolean;
	onToggleEditing: () => void;
	nav?: SheetNavState;
	onClose: () => void;
	actions: ActionDescriptor<Row>[];
	scope: ShortcutScope;
	/** Rendered above the decision buttons (Applications' score field). */
	footerLead?: FooterLead;
	/** The sheet's keys (`ActionKeys`), bound inside it so they yield to
	 *  what is shown over it. */
	children?: JSX.Element;
}): JSX.Element {
	return (
		<Sheet.Root
			open={props.isOpen}
			prebuild={props.prebuild}
			morphId={props.selected?._id}
			onOpenChange={(isOpen) => {
				if (!isOpen) props.onClose();
			}}
		>
			{props.children}
			<Sheet.Header>
				<PersonTitle
					isLoading={props.isLoading}
					person={props.selected}
				/>
				<Sheet.HeaderActions>
					<Sheet.SaveStatus />
					<EditToggle
						editing={props.isEditing}
						enabled={props.isOpen}
						onToggle={props.onToggleEditing}
					/>
					<EntitySheetNav nav={props.nav} />
					<Sheet.Close />
				</Sheet.HeaderActions>
			</Sheet.Header>
			<Sheet.Skeleton>
				<PersonDetailPlaceholder />
			</Sheet.Skeleton>
			<Sheet.Body loading={props.isLoading}>
				<Show when={props.selected}>
					{(person) => (
						<PersonDetail
							person={person()}
							editing={props.isEditing}
							isOpen={() => props.isOpen}
						/>
					)}
				</Show>
			</Sheet.Body>
			<Show when={props.selected}>
				{(person) => (
					<SheetFooter
						lead={props.footerLead?.(person)}
						error={rosterActionMessage(props.scope, person()._id)}
					>
						{/* Every action on offer for the person, none primary:
						    which decision they deserve is the board's call. */}
						<ActionBar
							target={person()}
							actions={props.actions}
							hideUnavailable
						/>
					</SheetFooter>
				)}
			</Show>
		</Sheet.Root>
	);
}

/** Edit mode for the sheet: flips the profile fields to inputs. Reset
 *  whenever a different person is opened or the sheet closes. */
export function useSheetEditing(
	isOpen: () => boolean,
	personId: () => string | undefined,
	scope: () => ShortcutScope
) {
	const [editing, setEditing] = createSignal(false);
	function shownId() {
		return isOpen() ? personId() : undefined;
	}
	createEffect(
		on(shownId, () => {
			setEditing(false);
		})
	);
	createEffect(
		on(
			// The scope is a dependency too: a peek's person can change roster,
			// which moves the shown person to the new roster's tab and off the
			// old one's, without touching edit mode.
			() => [shownId(), scope()] as const,
			([shown, shownScope], before) => {
				if (before && before[1] !== shownScope)
					setShownPerson(before[1], undefined);
				// A failure belongs to the person the sheet showed: paging on or
				// closing drops it.
				setShownPerson(shownScope, shown);
			}
		)
	);
	return [editing, setEditing] as const;
}
