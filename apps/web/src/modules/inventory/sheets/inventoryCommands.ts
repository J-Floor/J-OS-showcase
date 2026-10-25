import { call } from "../../../lib/call.ts";
import { createEntityCommands } from "../../../shared/entity/entityCommands.ts";

/**
 * An inventory sheet's writes: its table's mutations (which return plain
 * promises) as the shared entity commands, with the inventory's failure
 * messages. See {@link createEntityCommands}.
 */
export function createInventoryCommands<
	CreateArgs,
	RowId,
	Patch extends object,
>(options: {
	id: () => RowId | undefined;
	actions: {
		create: (args: CreateArgs) => Promise<unknown>;
		update: (args: { id: RowId } & Patch) => Promise<unknown>;
		remove: (id: RowId) => Promise<unknown>;
	};
	onClose: () => void;
}) {
	const { actions } = options;
	return createEntityCommands<CreateArgs, RowId, Patch>({
		id: options.id,
		actions: {
			create: (args) => call(actions.create(args), "Could not create."),
			update: (args) => call(actions.update(args), "Could not save."),
			remove: (id) => call(actions.remove(id), "Could not delete."),
		},
		onClose: options.onClose,
	});
}
