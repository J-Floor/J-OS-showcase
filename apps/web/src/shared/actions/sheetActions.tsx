import type { Hotkey } from "@tanstack/solid-hotkeys";
import type { JSX } from "solid-js";

import { useConfirm, type ConfirmOptions } from "../confirm.tsx";
import { ICONS } from "../icons.ts";

import { ActionKeys, createActionKeys } from "./createActionKeys.ts";
import {
	CREATE_TARGET,
	PAGE_TARGET,
	type ActionDescriptor,
	type CreateTarget,
	type PageTarget,
} from "./shortcuts.ts";

/**
 * Delete <noun> (`Delete`) on a sheet's row: asks first (`ask`), then
 * `remove`s it (an entity's `createEntityRemove`, which closes the sheet once
 * the row is gone). Refused when `error` holds a refusal after.
 */
export function deleteAction<Row extends { _id: string }>(options: {
	/** "task", "item type". */
	noun: string;
	ask: () => Promise<boolean>;
	remove: (id: Row["_id"]) => Promise<void>;
	error: () => string | null;
	can?: (row: Row) => boolean;
	disabledReason?: (row: Row) => string;
}): ActionDescriptor<Row> {
	return {
		id: `delete-${options.noun.replaceAll(" ", "-")}`,
		label: `Delete ${options.noun}`,
		icon: ICONS.delete,
		hotkey: "Delete",
		can: options.can ?? (() => true),
		disabledReason: options.disabledReason,
		run: async (row) => {
			if (!(await options.ask())) return;
			await options.remove(row._id);
			return { refused: options.error() !== null };
		},
	};
}

/** Create <noun> (`Mod+Enter`) on a create form, on offer once `can`.
 *  Refused when `error` holds a refusal after. */
export function createAction(options: {
	noun: string;
	can: () => boolean;
	disabledReason: () => string;
	create: () => Promise<unknown>;
	error: () => string | null;
}): ActionDescriptor<CreateTarget> {
	return {
		id: `create-${options.noun.replaceAll(" ", "-")}`,
		label: `Create ${options.noun}`,
		icon: ICONS.add,
		hotkey: "Mod+Enter",
		can: () => options.can(),
		disabledReason: () => options.disabledReason(),
		run: async () => {
			await options.create();
			return { refused: options.error() !== null };
		},
	};
}

/** New <noun> (`N`, unless `hotkey` says otherwise): opens a create
 *  form. */
export function newAction(options: {
	noun: string;
	hotkey?: Hotkey;
	can?: () => boolean;
	open: () => void;
}): ActionDescriptor<PageTarget> {
	return {
		id: `new-${options.noun.replaceAll(" ", "-")}`,
		label: `New ${options.noun}`,
		icon: ICONS.add,
		hotkey: options.hotkey ?? "N",
		can: options.can ?? (() => true),
		run: () => {
			options.open();
		},
	};
}

/** Binds a page's (or a tab's) own actions as keys in `scope`, live while
 *  `isLive`. */
export function bindPageKeys(
	scope: string,
	actions: ActionDescriptor<PageTarget>[],
	isLive: () => boolean
): void {
	createActionKeys<PageTarget>({
		scope,
		actions: () => actions,
		target: () => PAGE_TARGET,
		active: isLive,
	});
}

/**
 * An entity sheet's footer actions, for the buttons and the keys alike.
 * Delete (`deleteAction`) exists on a loaded row; Create (`createAction`) on
 * the loaded create form. Delete's key is ignored while typing; Create's types
 * nothing, so it fires from inside the form's fields.
 *
 * The keys are bound by `Keys`, rendered inside the sheet: they then stay
 * quiet while something is shown over it (a peek, a confirm).
 */
export function createSheetActions<Row extends { _id: string }>(options: {
	scope: string;
	noun: string;
	confirm: ConfirmOptions;
	isOpen: () => boolean;
	isLoading: () => boolean | undefined;
	row: () => Row | undefined;
	/** The entity's `createEntityRemove`. */
	remove: (id: Row["_id"]) => Promise<void>;
	/** The sheet's refusal, read after a delete or a create. */
	error: () => string | null;
	canRemove?: (row: Row) => boolean;
	removeDisabledReason?: (row: Row) => string;
	create: {
		can: () => boolean;
		disabledReason: () => string;
		run: () => Promise<unknown>;
		/** The create form's refusal, when it is not the sheet's own. */
		error?: () => string | null;
	};
}) {
	const confirm = useConfirm();
	const remove = deleteAction<Row>({
		noun: options.noun,
		ask: () => confirm(options.confirm),
		remove: options.remove,
		error: options.error,
		can: options.canRemove,
		disabledReason: options.removeDisabledReason,
	});
	const create = createAction({
		noun: options.noun,
		can: options.create.can,
		disabledReason: options.create.disabledReason,
		create: options.create.run,
		error: options.create.error ?? options.error,
	});

	function isLive(): boolean {
		return options.isOpen() && options.isLoading() !== true;
	}
	function isCreating(): boolean {
		return isLive() && options.row() === undefined;
	}

	/** The sheet's keys; goes inside its `Sheet.Root`. */
	function Keys(): JSX.Element {
		return (
			<>
				<ActionKeys<Row>
					scope={options.scope}
					actions={() => [remove]}
					target={() => (isLive() ? options.row() : undefined)}
					active={options.isOpen}
				/>
				<ActionKeys<CreateTarget>
					scope={options.scope}
					actions={() => [create]}
					target={() => (isCreating() ? CREATE_TARGET : undefined)}
					active={options.isOpen}
				/>
			</>
		);
	}

	return {
		remove,
		create,
		/** The sheet is on its loaded create form: its footer shows Create. */
		isCreating,
		Keys,
	};
}
