import { useBeforeLeave } from "@solidjs/router";
import { createContext, onCleanup, useContext } from "solid-js";

/**
 * Asked before the app leaves where it is (a page, a tab, a sheet's URL,
 * Back): true holds the leave, and `proceed` goes ahead with it later, once
 * the person has agreed.
 */
export type LeaveGuard = (proceed: () => void) => boolean;

export type LeaveGuardRegistry = {
	/** Asks `shouldHold` until the caller's owner is disposed. */
	add: (shouldHold: LeaveGuard) => void;
};

/**
 * The shell's one router leave listener, asking every registered guard.
 * Called before `usePageTransitions`, so it hears a leave first: a held
 * leave never starts a page transition, and `proceed` replays the leave
 * through that hook, which animates it then.
 */
export function createLeaveGuards(): LeaveGuardRegistry {
	const guards = new Set<LeaveGuard>();
	useBeforeLeave((event) => {
		if (event.defaultPrevented) return;
		for (const shouldHold of guards) {
			if (
				shouldHold(() => {
					event.retry();
				})
			) {
				event.preventDefault();
				return;
			}
		}
	});
	return {
		add(shouldHold) {
			guards.add(shouldHold);
			onCleanup(() => guards.delete(shouldHold));
		},
	};
}

/** The shell's guards; none outside the shell (a component rendered on its
 *  own, as in a unit test), where nothing can leave. */
export const LeaveGuards = createContext<LeaveGuardRegistry>();

/** Asks `shouldHold` before every leave while the caller lives. */
export function useLeaveGuard(shouldHold: LeaveGuard): void {
	useContext(LeaveGuards)?.add(shouldHold);
}
