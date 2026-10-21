// Same names as the real Result consumers, declared elsewhere: handing a
// Result to these is still a drop.
import type { Result } from "neverthrow";

export function unwrap<T>(result: Result<T, unknown>): T | undefined {
	return result.unwrapOr(undefined);
}

export function trackResult<T, E>(result: Result<T, E>): void {
	result.match(
		() => undefined,
		() => undefined
	);
}
