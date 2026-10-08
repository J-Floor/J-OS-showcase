import { Tour, useTour, type TourStep } from "@j-os/design-system";
import { useMutation, useQuery } from "convex-solidjs";
import { createEffect } from "solid-js";

import { api } from "../../../convex/_generated/api";

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
export type TourPerson = DoorsIntroPerson & {
	onboarding?: { tourSeen?: boolean };
};

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
	if (!person?.onboarding || person.onboarding.tourSeen) return false;
	return !doorsIntroPending(person, now);
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
				void setTourSeen.mutateAsync({}).catch(() => undefined);
			}
		},
	});

	let started = false;
	createEffect(() => {
		if (started) return;
		if (shouldStartTour(state.data()?.person, Date.now())) {
			started = true;
			tour().start();
		}
	});

	return <Tour tour={tour} />;
}
