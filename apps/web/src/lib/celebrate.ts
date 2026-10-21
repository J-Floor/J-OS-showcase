import { fireConfetti } from "@j-os/design-system";
import { Result } from "neverthrow";

const tryConfetti = Result.fromThrowable(fireConfetti);

/** Confetti is decoration: it can fail (no canvas, odd element) and nobody
 *  needs to hear about it, so a failure is dropped here, once. */
export function celebrate(origin?: Parameters<typeof fireConfetti>[0]): void {
	tryConfetti(origin).unwrapOr(undefined);
}
