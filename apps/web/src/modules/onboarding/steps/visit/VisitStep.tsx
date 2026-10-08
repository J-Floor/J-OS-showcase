import { Button, Icon } from "@j-os/design-system";
import { useQuery } from "convex-solidjs";
import { Show } from "solid-js";

import { api } from "../../../../../convex/_generated/api";
import { StepActions } from "../../StepActions.tsx";
import type { OnboardingStepProps } from "../../types.ts";

import styles from "./VisitStep.module.scss";

const STREET_ADDRESS = "Josefstrasse 206, 8005 Zürich";
const MAPS_URL = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(STREET_ADDRESS)}`;

/**
 * Onboarding step 7 (last): the "come by" screen. Shows the J floor address and
 * invites the new member to drop in. Info-only — Continue completes onboarding.
 * When the viewer is a guest with a host assigned, offers a WhatsApp message
 * link to that host (wa.me) instead of the generic WhatsApp group invite — so
 * the host can be messaged, not cold-called.
 */
export function VisitStep(props: OnboardingStepProps) {
	const host = useQuery(api.onboarding.getOnboardingHost, {});
	const invite = useQuery(api.onboarding.whatsappInvite, {});
	return (
		<div class={styles.wrap}>
			<p>{STREET_ADDRESS}</p>
			<p>
				Come by to build.{" "}
				<Show
					when={host.data()}
					fallback="If you've never been to the space, for a smooth start reach out to one of our board members via WhatsApp. They will welcome you to the space and answer any questions you may have."
				>
					{(h) =>
						`If you've never been to the space, for a smooth start reach out to your host ${h().name} via WhatsApp the first time you come. They will welcome you to the space and answer any questions you may have.`
					}
				</Show>
			</p>
			<div class={styles.actions}>
				<Button
					onClick={() => {
						window.open(MAPS_URL, "_blank", "noopener,noreferrer");
					}}
				>
					<Icon>home_pin</Icon>
					View on Maps
				</Button>
				<Show
					when={host.data()?.phone}
					fallback={
						<Show when={invite.data()}>
							{(url) => (
								<Button
									variant="secondary"
									onClick={() => {
										window.open(
											url(),
											"_blank",
											"noopener,noreferrer"
										);
									}}
								>
									Message us on WhatsApp
								</Button>
							)}
						</Show>
					}
				>
					{(phone) => (
						<Button
							variant="secondary"
							onClick={() => {
								// wa.me wants the international number with no
								// "+", spaces or punctuation. Opens a WhatsApp
								// chat with the host — no spam phone calls.
								window.open(
									`https://wa.me/${phone().replace(/\D/g, "")}`,
									"_blank",
									"noopener,noreferrer"
								);
							}}
						>
							Message {host.data()?.name} on WhatsApp
						</Button>
					)}
				</Show>
			</div>
			<StepActions>
				<Button onClick={() => void props.onComplete()}>Finish</Button>
			</StepActions>
		</div>
	);
}
