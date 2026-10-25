import type { Result, ResultAsync } from "neverthrow";
import type { Accessor } from "solid-js";

import type { ClientError } from "../../lib/call.ts";
import {
	createActionError,
	scopeOfFields,
	type ActionErrorState,
} from "../createActionError.ts";
import type { SheetOpenProps } from "../types.ts";

import { createDraftGuard } from "./createDraftGuard.ts";

/** Deleting the open row, closing the sheet on success; with none open
 *  (create mode), just closing. A failure is shown through `failure` and the
 *  sheet stays. */
export function createEntityRemove<RemoveId>(options: {
	remove: (id: RemoveId) => ResultAsync<unknown, ClientError>;
	failure: ActionErrorState;
	onClose: () => void;
}): (id: RemoveId | undefined) => Promise<void> {
	return async (id) => {
		if (id === undefined) {
			options.onClose();
			return;
		}
		const result = await options.failure.trackResult(options.remove(id));
		if (result.isErr()) return;
		options.onClose();
	};
}

/** Write `fields` to the open row, handing back its Result (for the save
 *  status); with none open (create mode), do nothing. A failure is shown
 *  against the fields it touched. */
function createEntityPatch<RowId, Patch extends object>(options: {
	id: () => RowId | undefined;
	update: (args: { id: RowId } & Patch) => ResultAsync<unknown, ClientError>;
	failure: ActionErrorState;
}): (fields: Patch) => Promise<Result<unknown, ClientError>> | undefined {
	return (fields) => {
		const id = options.id();
		return id === undefined
			? undefined
			: options.failure.trackResult(
					options.update({ id, ...fields }),
					scopeOfFields(fields)
				);
	};
}

/**
 * An entity sheet's writes: `create` a row and `remove` the open one, each
 * closing the sheet on success, and `patch` fields of the open row (`id`).
 * A failure is shown through the returned `failure` (the sheet's error) and
 * the sheet stays.
 */
export function createEntityCommands<
	CreateArgs,
	RowId,
	Patch extends object,
>(options: {
	id: () => RowId | undefined;
	actions: {
		create: (args: CreateArgs) => ResultAsync<unknown, ClientError>;
		update: (
			args: { id: RowId } & Patch
		) => ResultAsync<unknown, ClientError>;
		remove: (id: RowId) => ResultAsync<unknown, ClientError>;
	};
	onClose: () => void;
}) {
	const { actions, onClose } = options;
	const failure = createActionError();

	async function create(args: CreateArgs): Promise<void> {
		const result = await failure.trackResult(actions.create(args));
		if (result.isErr()) return;
		onClose();
	}

	const remove = createEntityRemove({
		remove: actions.remove,
		failure,
		onClose,
	});

	const patch = createEntityPatch<RowId, Patch>({
		id: options.id,
		update: actions.update,
		failure,
	});

	return { failure, create, remove, patch };
}

/**
 * An entity sheet's create-form draft guard (see {@link createDraftGuard}):
 * on its create form (open, nothing loading, no row), over its fields'
 * values. `sheet` is what its `Sheet.Root` takes.
 */
export function createEntityDraft(
	props: SheetOpenProps & { loading?: boolean },
	isEdit: () => boolean,
	fields: Record<string, { value: Accessor<unknown> }>,
	/** What Discard throws away: "new task". */
	discardLabel: string
) {
	const draft = createDraftGuard({
		isOpen: () => props.open && !props.loading && !isEdit(),
		values: () =>
			Object.fromEntries(
				Object.entries(fields).map(([key, field]) => [
					key,
					field.value(),
				])
			),
		onOpenChange: (isOpen) => {
			props.onOpenChange(isOpen);
		},
	});
	return {
		...draft,
		sheet: {
			onOpenChange: draft.onOpenChange,
			confirmClose: draft.confirmClose,
			discardRef: draft.discardRef,
			discardLabel,
		},
	};
}
