import type { TrackedField } from "@j-os/design-system";
import type { Result } from "neverthrow";

import { toaster } from "../shared/toaster.ts";

import type { ClientError } from "./call.ts";

/** One field's write: the mutation's Result, or nothing when there is no
 *  row to write to yet (a create form). */
export type SaveWrite = () =>
	| PromiseLike<Result<unknown, ClientError>>
	| undefined;

/**
 * Sends one field's write and tells its sheet's save tracker (`field`):
 * pending while in flight, then saved or failed, Retry sending the same
 * write again. A write that sends nothing withdraws the field. A failure
 * once `isShown()` is false (the sheet closed) toasts, since the sheet that
 * would show it is gone.
 */
export function reportSave(
	field: TrackedField | undefined,
	write: SaveWrite,
	isShown: () => boolean
): void {
	const sent = write();
	if (!sent) {
		field?.clear();
		return;
	}
	field?.pending();
	const failure = Promise.resolve(sent).then((result) => {
		if (result.isOk()) return null;
		if (!isShown()) {
			toaster.create({ type: "error", title: result.error.message });
		}
		return result.error;
	});
	// The tracker hears a failure as a rejection.
	field?.settle(
		failure.then((error) =>
			error === null ? null : Promise.reject(new Error(error.message))
		),
		() => {
			reportSave(field, write, isShown);
		}
	);
}
