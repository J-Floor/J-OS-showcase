import { err, type Result, ResultAsync } from "neverthrow";

export type TimeoutError = { code: "Timeout" };

/** True for the `Timeout` that {@link withTimeout} settles with, not for the
 *  work's own error (which may carry a `Timeout` code of its own, with a
 *  message to show). */
export function isTimeout(error: unknown): error is TimeoutError {
	return (
		typeof error === "object" &&
		error !== null &&
		"code" in error &&
		error.code === "Timeout" &&
		!("message" in error)
	);
}

/** Settle with `work`'s Result, or with a `Timeout` error once `ms` is up.
 *  `work` must not reject. The timer is always cleared, so a settled race
 *  leaves nothing pending. */
export function withTimeout<T, E>(
	work: PromiseLike<Result<T, E>>,
	ms: number
): ResultAsync<T, E | TimeoutError> {
	let timer: ReturnType<typeof setTimeout> | undefined;
	const timeout = new Promise<Result<T, E | TimeoutError>>((resolve) => {
		timer = setTimeout(() => {
			resolve(err({ code: "Timeout" }));
		}, ms);
	});
	const settled = Promise.race([Promise.resolve(work), timeout]).finally(
		() => {
			clearTimeout(timer);
		}
	);
	return new ResultAsync(settled);
}
