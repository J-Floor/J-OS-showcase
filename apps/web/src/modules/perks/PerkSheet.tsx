import { Accordion, PropertyRow, Sheet } from "@j-os/design-system";
import {
	Show,
	createEffect,
	createMemo,
	createSignal,
	on,
	type Accessor,
} from "solid-js";

import type { PerkRow } from "../../../convex/perks.ts";
import { Can } from "../../lib/ability.tsx";
import { ActionBar } from "../../shared/actions/ActionBar.tsx";
import type {
	ActionDescriptor,
	CreateTarget,
} from "../../shared/actions/shortcuts.ts";
import { EditToggle } from "../../shared/components/EditToggle.tsx";
import { createDraftGuard } from "../../shared/entity/createDraftGuard.ts";
import { EntitySheetHeader } from "../../shared/entity/EntitySheetHeader.tsx";
import { SheetCreateFooter } from "../../shared/entity/SheetCreateFooter.tsx";
import { SheetFooter } from "../../shared/entity/SheetFooter.tsx";
import { SheetSection } from "../../shared/entity/SheetSection.tsx";
import type { SheetOpenProps } from "../../shared/types.ts";

import { perkFields } from "./fields.ts";
import { createPerkSheetActions } from "./perkActions.tsx";
import { PerkAdminRequests } from "./PerkAdminRequests.tsx";
import { PerkCreateForm, createPerkCreateForm } from "./PerkCreateForm.tsx";
import { PerkDetailsItem } from "./PerkDetails.tsx";
import {
	PerkRequestNote,
	createPerkRequestForm,
	type PerkRequestForm,
} from "./PerkRequestForm.tsx";

/** The sections a perk's sheet opens with. "requests" is the board's. */
const ALL_SECTIONS = ["details", "requests"];

/** `Sheet.Skeleton`'s placeholder while an open row loads: shaped like the
 *  Details section, with literal placeholder text. */
function PerkFieldsPlaceholder() {
	return (
		<Accordion.Root multiple defaultValue={ALL_SECTIONS}>
			<SheetSection value="details" title="Details">
				<PropertyRow field={perkFields.partner}>
					<span>placeholder</span>
				</PropertyRow>
				<PropertyRow field={perkFields.validUntil}>
					<span>placeholder</span>
				</PropertyRow>
			</SheetSection>
		</Accordion.Root>
	);
}

/** What the sheet is open for: a perk, a row still loading, or (neither)
 *  a new perk. */
type PerkSheetProps = SheetOpenProps & {
	perk?: PerkRow;
	/** Open for a real row (`requestedId()` set) whose data hasn't loaded
	 *  yet. Wins over `perk`. */
	loading?: boolean;
};

/** The perk's title over its sheet, what its fields have saved and, for
 *  the board on a loaded perk, the padlock that unlocks them. */
function PerkSheetHeader(
	props: Pick<PerkSheetProps, "perk" | "loading"> & {
		isEditing: boolean;
		isSheetOpen: boolean;
		onToggleEditing: () => void;
	}
) {
	return (
		<EntitySheetHeader
			title={props.perk?.title ?? "New perk"}
			loading={props.loading}
			saveStatus={!props.loading && props.perk !== undefined}
		>
			<Can I="manage" the="Perks">
				<Show when={!props.loading && props.perk !== undefined}>
					<EditToggle
						editing={props.isEditing}
						enabled={props.isSheetOpen}
						onToggle={props.onToggleEditing}
					/>
				</Show>
			</Can>
		</EntitySheetHeader>
	);
}

/** A loaded perk's accordion: the details for everyone, then, for the
 *  board, everyone's requests. */
function PerkDetailAccordion(props: {
	perk: Accessor<PerkRow>;
	isEditing: Accessor<boolean>;
	isOpen: Accessor<boolean>;
	openSections: string[];
	onOpenSectionsChange: (sections: string[]) => void;
	form: PerkRequestForm;
}) {
	return (
		<Accordion.Root
			multiple
			value={props.openSections}
			onValueChange={(details) => {
				props.onOpenSectionsChange(details.value);
			}}
		>
			<PerkDetailsItem
				perk={props.perk}
				isEditing={props.isEditing}
				isOpen={props.isOpen}
			/>
			<Can I="manage" the="Perks">
				<PerkAdminRequests perk={props.perk} />
			</Can>
		</Accordion.Root>
	);
}

/** The footer. On a loaded perk: the note over the actions (Request perk,
 *  and Delete perk for the board), with why one failed. On the create form:
 *  Create perk, for the board. Nothing while the row is still loading. The
 *  perk's `Show` is not keyed: a refetched row must not remount the bar and
 *  lose a refusal. */
function PerkSheetFooter(
	props: Pick<PerkSheetProps, "perk" | "loading" | "open"> & {
		form: PerkRequestForm;
		create: ActionDescriptor<CreateTarget>;
		actions: Accessor<ActionDescriptor<PerkRow>[]>;
		error: Accessor<string | null>;
	}
) {
	return (
		<Show when={!props.loading}>
			<Show
				when={props.perk}
				fallback={
					<Can I="create" the="Perks">
						<SheetCreateFooter create={props.create} isCreating />
					</Can>
				}
			>
				{(perk) => (
					<SheetFooter
						lead={<PerkRequestNote form={props.form} perk={perk} />}
						error={props.error()}
					>
						<ActionBar actions={props.actions()} target={perk()} />
					</SheetFooter>
				)}
			</Show>
		</Show>
	);
}

/** The note's draft guard: a typed, unsent note asks before the sheet
 *  closes or the page changes, as a create form does. `canWriteNote` is a
 *  memo, so a refetch of the open perk never takes a new baseline. */
function createNoteDraft(props: PerkSheetProps, form: PerkRequestForm) {
	return createDraftGuard({
		isOpen: () => props.open && form.canWriteNote(),
		values: () => ({ note: form.note().trim() }),
		onOpenChange: (isOpen) => {
			props.onOpenChange(isOpen);
		},
	});
}

/**
 * The create form and its draft guard, which asks before a typed new perk
 * is thrown away. The form is emptied each time the create form shows,
 * before the guard takes its baseline. The two guards never ask at once
 * (the note's needs a perk, this one none), and a close this one lets
 * through goes on to the note's, which hands it to the caller. `sheet` is
 * what `Sheet.Root` takes for both.
 */
function createPerkCreateMode(
	props: PerkSheetProps,
	noteDraft: ReturnType<typeof createDraftGuard>
) {
	const form = createPerkCreateForm({
		onCreated: () => {
			draft.onOpenChange(false);
		},
	});
	const isCreating = createMemo(
		() => props.open && !props.loading && props.perk === undefined
	);
	createEffect(
		on(isCreating, (isNowCreating) => {
			if (isNowCreating) form.reset();
		})
	);
	const draft = createDraftGuard({
		isOpen: () => isCreating(),
		values: () => ({
			partner: form.partner(),
			title: form.title(),
			category: form.category(),
			contactId: form.contactId(),
			terms: form.terms(),
			link: form.link(),
			validUntil: form.validUntil(),
		}),
		onOpenChange: noteDraft.onOpenChange,
	});
	return {
		form,
		sheet: {
			onOpenChange: draft.onOpenChange,
			confirmClose: (): boolean =>
				draft.confirmClose() || noteDraft.confirmClose(),
			discardRef: (ask: (onDiscard: () => void) => void): void => {
				draft.discardRef(ask);
				noteDraft.discardRef(ask);
			},
		},
	};
}

/**
 * A perk's sheet, built like the event sheet: an accordion of
 * `PropertyRow`s that morphs out of the perk's row. Every community tier
 * reads the details and asks for an active perk from the footer, with a
 * one-line note; once asked, the sheet says when and shows the note
 * read-only. Request perk is `R` and, for the board, Delete perk is `Delete`.
 * A typed, unsent note is a draft: closing asks before it is thrown away.
 *
 * The board also gets the padlock (each field then autosaves), Delete perk,
 * and the Requests section, where it moves each request's status. Create
 * mode (no perk, not loading) is reached only from the page's
 * `create`-gated New perk button; a typed new perk is a draft too.
 *
 * Loading mode (`loading`) shows the `Sheet.Skeleton` placeholder: the
 * sheet is open for a real row whose data has not arrived yet.
 */
export function PerkSheet(props: PerkSheetProps) {
	const form = createPerkRequestForm({
		// No perk under the skeleton: a stale row is not asked for.
		perk: () => (props.loading ? undefined : props.perk),
	});

	// Locked until the board opens the padlock.
	const [editing, setEditing] = createSignal(false);
	// Controlled + onValueChange so the sections collapse, as on the event
	// sheet; a bare `value` with no setter pins them open.
	const [openSections, setOpenSections] = createSignal(ALL_SECTIONS);

	// An empty note and locked fields on an open or a move to another perk.
	// Keyed on a memo of the id: a live refetch hands over a new row for the
	// same perk, and must neither wipe a note being typed nor lock the
	// fields again after each autosave.
	const perkId = createMemo(() => props.perk?._id);
	createEffect(
		on(
			() => [props.open, perkId()] as const,
			([isOpen]) => {
				if (!isOpen) return;
				form.reset();
				setEditing(false);
			}
		)
	);
	// After the reset above, so the empty note is the draft's baseline.
	const noteDraft = createNoteDraft(props, form);
	const createMode = createPerkCreateMode(props, noteDraft);

	const perkActions = createPerkSheetActions(props, {
		form,
		createForm: createMode.form,
	});

	return (
		<Sheet.Root
			open={props.open}
			prebuild={props.prebuild}
			{...createMode.sheet}
			discardLabel={props.perk === undefined ? "new perk" : "your note"}
			morphId={props.perk?._id}
		>
			<perkActions.Keys />
			<PerkSheetHeader
				perk={props.perk}
				loading={props.loading}
				isEditing={editing()}
				isSheetOpen={props.open}
				onToggleEditing={() => setEditing((current) => !current)}
			/>

			<Sheet.Skeleton>
				<PerkFieldsPlaceholder />
			</Sheet.Skeleton>
			<Sheet.Body loading={props.loading}>
				<Show
					when={props.perk}
					fallback={
						<Can I="create" the="Perks">
							<PerkCreateForm
								form={createMode.form}
								create={perkActions.create}
							/>
						</Can>
					}
				>
					{(perk) => (
						<PerkDetailAccordion
							perk={perk}
							isEditing={editing}
							isOpen={() => props.open}
							openSections={openSections()}
							onOpenSectionsChange={setOpenSections}
							form={form}
						/>
					)}
				</Show>
			</Sheet.Body>

			<PerkSheetFooter
				perk={props.perk}
				loading={props.loading}
				open={props.open}
				form={form}
				create={perkActions.create}
				actions={perkActions.actions}
				error={() => form.error() ?? perkActions.deleteError()}
			/>
		</Sheet.Root>
	);
}
