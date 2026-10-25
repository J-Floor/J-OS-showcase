import { Tour, useTour, type TourStep } from "@j-os/design-system";
import { useMutation } from "convex-solidjs";
import { createEffect } from "solid-js";

import { api } from "../../../convex/_generated/api";
import type { Doc } from "../../../convex/_generated/dataModel";
import { ignoreFailure } from "../../lib/call.ts";
import { useQuery } from "../../shared/data/useQuery.ts";

import { doorsIntroPending, type DoorsIntroPerson } from "./doorIntroState.ts";

export const TOUR_STEPS: TourStep[] = [
	{
		id: "welcome",
		type: "dialog",
		title: "Welcome to J floor",
		description: "A quick tour of the two places you'll use most.",
		actions: [{ label: "Start", action: "next" }],
	},
	{
		id: "community",
		type: "tooltip",
		title: "Community",
		description: "Find board contacts and community info here.",
		target: () => document.querySelector<HTMLElement>("#nav-community"),
		actions: [{ label: "Next", action: "next" }],
	},
	{
		id: "space",
		type: "tooltip",
		title: "Space",
		description: "Find space info and resources here.",
		target: () => document.querySelector<HTMLElement>("#nav-space"),
		actions: [{ label: "Next", action: "next" }],
	},
	{
		id: "complete",
		type: "dialog",
		title: "You're all set",
		description: "Enjoy the space!",
		actions: [{ label: "Finish", action: "dismiss" }],
	},
];

/** The fields the tour decision reads off a person row. */
export type TourPerson = DoorsIntroPerson & Pick<Doc<"people">, "onboarding">;

/**
 * Whether the person has a tour that is still unseen (board and admin have no
 * `onboarding` record and never get one). What's New waits on the same test.
 */
export function tourWillRun(person: TourPerson | null | undefined): boolean {
	return Boolean(person?.onboarding) && !person?.onboarding?.tourSeen;
}

/**
 * The tour runs once, after onboarding, for a member/guest who has not seen it
 * (board and admin have no `onboarding` record and never get it) — and not
 * while the doors intro is still waiting to be dismissed: that one-time page is
 * the first thing a person sees.
 */
export function shouldStartTour(
	person: TourPerson | null | undefined,
	now: number
): boolean {
	return tourWillRun(person) && !doorsIntroPending(person, now);
}

export function WelcomeTour() {
	const state = useQuery(api.onboarding.getState, {});
	const setTourSeen = useMutation(api.onboarding.setTourSeen);
	const tour = useTour({
		steps: TOUR_STEPS,
		onStatusChange: (details) => {
			if (
				details.status === "dismissed" ||
				details.status === "completed"
			) {
				// Closed already, so a failed save has no area to show in; the
				// tour just comes back next session.
				ignoreFailure(setTourSeen.mutateAsync({}));
			}
		},
	});

	let isStarted = false;
	createEffect(() => {
		if (isStarted || !shouldStartTour(state.data()?.person, Date.now())) {
			return;
		}

		isStarted = true;
		tour().start();
	});

	return <Tour tour={tour} />;
}
