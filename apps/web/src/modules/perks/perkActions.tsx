import { useMutation } from "convex-solidjs";
import type { JSX } from "solid-js";

import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { SITE_TIMEZONE } from "../../../convex/lib/time.ts";
import type { PerkRow } from "../../../convex/perks.ts";
import { useCan } from "../../lib/ability.tsx";
import { call } from "../../lib/call.ts";
import { ActionKeys } from "../../shared/actions/createActionKeys.ts";
import {
	bindPageKeys,
	createAction,
	deleteAction,
	newAction,
} from "../../shared/actions/sheetActions.tsx";
import {
	CREATE_TARGET,
	type ActionDescriptor,
	type CreateTarget,
	type PageTarget,
} from "../../shared/actions/shortcuts.ts";
import { useConfirm, type ConfirmOptions } from "../../shared/confirm.tsx";
import { createActionError } from "../../shared/createActionError.ts";
import { createEntityRemove } from "../../shared/entity/entityCommands.ts";
import { ICONS } from "../../shared/icons.ts";
import { formatDateIn } from "../../shared/time.ts";
import type { OpenProps } from "../../shared/types.ts";

import type { PerkCreateFormState } from "./PerkCreateForm.tsx";
import type { PerkRequestForm } from "./PerkRequestForm.tsx";

/** Where a perk sheet's keys are live. */
const PERK_SHEET_SCOPE = "perk-sheet";

const DELETE_PERK_CONFIRM: ConfirmOptions = {
	title: "Delete perk?",
	message: "This removes the perk and its request history.",
	confirmLabel: "Delete",
	tone: "danger",
};

/** Request perk. Once a request is open its label says when it went, which
 *  needs no further reason; an expired perk says why it is off. The label is
 *  a getter, so the one descriptor follows the request as it opens. */
function requestAction(form: PerkRequestForm): ActionDescriptor<PerkRow> {
	return {
		id: "request",
		get label() {
			const request = form.openRequest();
			return request
				? `Requested on ${formatDateIn(request.requestedAt, SITE_TIMEZONE)}`
				: "Request perk";
		},
		icon: ICONS.perks,
		hotkey: "R",
		can: () => form.openRequest() === undefined && !form.isExpired(),
		disabledReason: () =>
			form.openRequest() === undefined ? "This perk has expired" : null,
		run: () => form.submit(),
	};
}

/**
 * The perk sheet's actions, for the buttons and the keys alike: Request perk
 * (`R`) for everyone and Delete perk (`deleteAction`, confirmed) for the
 * board on a loaded perk; Create perk (`createAction`) on the create form.
 * Delete closes the sheet once the perk is gone; `deleteError` is its
 * refusal, for the footer, and belongs to the perk it was made for.
 *
 * The keys are bound by `Keys`, rendered inside the sheet: they then stay
 * quiet while something is shown over it.
 */
export function createPerkSheetActions(
	sheet: OpenProps & { perk?: PerkRow; loading?: boolean },
	options: { form: PerkRequestForm; createForm: PerkCreateFormState }
) {
	const deletePerk = useMutation(api.perks.deletePerk);
	const confirm = useConfirm();
	const can = useCan();
	const failure = createActionError(() => sheet.perk?._id);

	const request = requestAction(options.form);
	const remove = deleteAction<PerkRow>({
		noun: "perk",
		ask: () => confirm(DELETE_PERK_CONFIRM),
		remove: createEntityRemove({
			remove: (perkId: Id<"perks">) =>
				call(
					deletePerk.mutateAsync({ perkId }),
					"Could not delete the perk."
				),
			failure,
			onClose: () => {
				sheet.onOpenChange(false);
			},
		}),
		error: failure.error,
	});
	const create = createAction({
		noun: "perk",
		can: () =>
			can.I("create").the("Perks") && options.createForm.canSubmit(),
		disabledReason: () => options.createForm.disabledReason(),
		create: () => options.createForm.submit(),
		error: options.createForm.error,
	});

	function actions(): ActionDescriptor<PerkRow>[] {
		return can.I("manage").the("Perks") ? [request, remove] : [request];
	}
	function isLive(): boolean {
		return sheet.open && sheet.loading !== true;
	}

	/** The sheet's keys; goes inside its `Sheet.Root`. */
	function Keys(): JSX.Element {
		return (
			<>
				<ActionKeys<PerkRow>
					scope={PERK_SHEET_SCOPE}
					actions={actions}
					target={() => (isLive() ? sheet.perk : undefined)}
					active={() => sheet.open}
				/>
				<ActionKeys<CreateTarget>
					scope={PERK_SHEET_SCOPE}
					actions={() => [create]}
					target={() =>
						isLive() && sheet.perk === undefined
							? CREATE_TARGET
							: undefined
					}
					active={() => sheet.open}
				/>
			</>
		);
	}

	return { actions, create, deleteError: failure.error, Keys };
}

/** The board page's New perk (`N`), live while `isLive`: the Perks tab is on
 *  screen and no sheet is open over it. */
export function createPerksPageActions(options: {
	openCreate: () => void;
	isLive: () => boolean;
}): ActionDescriptor<PageTarget> {
	const newPerk = newAction({ noun: "perk", open: options.openCreate });
	bindPageKeys("perks", [newPerk], options.isLive);
	return newPerk;
}
