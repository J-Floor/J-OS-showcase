import {
	Accordion,
	Button,
	Icon,
	PropertyRow,
	Sheet,
} from "@j-os/design-system";
import { useMutation } from "convex-solidjs";
import {
	Show,
	createEffect,
	createMemo,
	createSignal,
	on,
	type Accessor,
} from "solid-js";

import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import type { PerkRow } from "../../../convex/perks.ts";
import { Can } from "../../lib/ability.tsx";
import { call } from "../../lib/call.ts";
import { useConfirm, type ConfirmOptions } from "../../shared/confirm.tsx";
import { createActionError } from "../../shared/createActionError.ts";
import { createDraftGuard } from "../../shared/entity/createDraftGuard.ts";
import { createEntityRemove } from "../../shared/entity/entityCommands.ts";
import { EntitySheetHeader } from "../../shared/entity/EntitySheetHeader.tsx";
import { ICONS } from "../../shared/icons.ts";
import { InlineError } from "../../shared/InlineError.tsx";
import type { SheetOpenProps } from "../../shared/types.ts";
import { EditToggle } from "../community/sheets/EditToggle.tsx";

import { perkFields } from "./fields.ts";
import { PerkAdminRequests } from "./PerkAdminRequests.tsx";
import {
	PerkCreateFooter,
	PerkCreateForm,
	createPerkCreateForm,
	type PerkCreateFormState,
} from "./PerkCreateForm.tsx";
import { PerkDetailsItem } from "./PerkDetails.tsx";
import {
	PerkRequestButton,
	PerkRequestSection,
	createPerkRequestForm,
	type PerkRequestForm,
} from "./PerkRequestSection.tsx";
import styles from "./PerkSheet.module.scss";

/** The sections a perk's sheet opens with. "requests" is the board's. */
const ALL_SECTIONS = ["details", "request", "requests"];

/** `Sheet.Skeleton`'s placeholder while an open row loads: shaped like the
 *  Details section, with literal placeholder text. */
function PerkFieldsPlaceholder() {
	return (
		<Accordion.Root multiple defaultValue={ALL_SECTIONS}>
			<Accordion.Item value="details">
				<Accordion.ItemTitle>Details</Accordion.ItemTitle>
				<Accordion.ItemContent>
					<div class={styles.section}>
						<PropertyRow field={perkFields.partner}>
							<span>placeholder</span>
						</PropertyRow>
						<PropertyRow field={perkFields.title}>
							<span>placeholder</span>
						</PropertyRow>
						<PropertyRow field={perkFields.validUntil}>
							<span>placeholder</span>
						</PropertyRow>
					</div>
				</Accordion.ItemContent>
			</Accordion.Item>
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
		<EntitySheetHeader.Root
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
		</EntitySheetHeader.Root>
	);
}

/** A loaded perk's accordion: the details for everyone, then the viewer's
 *  own request while the perk can be asked for or one is open, then, for
 *  the board, everyone's requests. */
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
			<Show when={props.form.hasSection()}>
				<PerkRequestSection form={props.form} />
			</Show>
			<Can I="manage" the="Perks">
				<PerkAdminRequests perk={props.perk} />
			</Can>
		</Accordion.Root>
	);
}

const DELETE_PERK_CONFIRM: ConfirmOptions = {
	title: "Delete perk?",
	message: "This removes the perk and its request history.",
	confirmLabel: "Delete",
	tone: "danger",
};

/** Deletes the perk once the board confirms, and closes the sheet when it
 *  is gone. A refusal shows beside the button and the sheet stays, for the
 *  perk it was made for only: the sheet steps from perk to perk. */
function PerkDeleteButton(props: { perkId: Id<"perks">; onClose: () => void }) {
	const deletePerk = useMutation(api.perks.deletePerk);
	const confirm = useConfirm();
	// A memo of the id: a refetch hands over a new row for the same perk,
	// which must keep the refusal; only a move to another perk clears it.
	const perkId = createMemo(() => props.perkId);
	const failure = createActionError(() => perkId());
	const removePerk = createEntityRemove({
		remove: (id: Id<"perks">) =>
			call(
				deletePerk.mutateAsync({ perkId: id }),
				"Could not delete the perk."
			),
		failure,
		onClose: () => {
			props.onClose();
		},
	});
	async function remove(): Promise<void> {
		const isOk = await confirm(DELETE_PERK_CONFIRM);
		if (!isOk) return;
		await removePerk(props.perkId);
	}
	return (
		<>
			<InlineError message={failure.error()} />
			<Button variant="tertiary" onClick={() => void remove()}>
				<Icon>{ICONS.delete}</Icon> Delete perk
			</Button>
		</>
	);
}

/** The footer. On a loaded perk: why a request failed, Delete perk for the
 *  board, and the Request button, last as the primary action. On the
 *  create form: Create, for the board. Nothing while the row is still
 *  loading. The perk's `Show` is not keyed: a refetched row must not
 *  remount Delete and lose its refusal. */
function PerkSheetFooter(
	props: Pick<PerkSheetProps, "perk" | "loading"> & {
		form: PerkRequestForm;
		createForm: PerkCreateFormState;
		onClose: () => void;
	}
) {
	return (
		<Show when={!props.loading}>
			<Show
				when={props.perk}
				fallback={
					<Can I="create" the="Perks">
						<PerkCreateFooter form={props.createForm} />
					</Can>
				}
			>
				{(perk) => (
					<Sheet.Footer>
						<InlineError message={props.form.error()} />
						<Can I="manage" the="Perks">
							<PerkDeleteButton
								perkId={perk()._id}
								onClose={props.onClose}
							/>
						</Can>
						<PerkRequestButton form={props.form} />
					</Sheet.Footer>
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
 * reads the details and asks for an active perk from the footer, with an
 * optional note; once asked, the sheet says when and shows the note
 * read-only. A typed, unsent note is a draft: closing asks before it is
 * thrown away.
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

	return (
		<Sheet.Root
			open={props.open}
			prebuild={props.prebuild}
			{...createMode.sheet}
			discardLabel={props.perk === undefined ? "new perk" : "your note"}
			morphId={props.perk?._id}
		>
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
							<PerkCreateForm form={createMode.form} />
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
				form={form}
				createForm={createMode.form}
				onClose={() => {
					props.onOpenChange(false);
				}}
			/>
		</Sheet.Root>
	);
}
