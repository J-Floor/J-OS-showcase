import { Button, Icon, Query, Skeleton } from "@j-os/design-system";
import type { FunctionReturnType } from "convex/server";
import { Show } from "solid-js";

import { api } from "../../../../../convex/_generated/api";
import { useQuery } from "../../../../shared/data/useQuery.ts";
import { StepActions } from "../../StepActions.tsx";
import type { OnboardingStepProps } from "../../types.ts";

import styles from "./VisitStep.module.scss";

const STREET_ADDRESS = "Josefstrasse 206, 8005 Zürich";
const MAPS_URL = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(STREET_ADDRESS)}`;

type OnboardingHost = FunctionReturnType<
	typeof api.onboarding.getOnboardingHost
>;

type WhatsappInvite = FunctionReturnType<typeof api.onboarding.whatsappInvite>;

/** The generic group-invite button, shown when there is no host to message. */
function InviteButton(props: { inviteUrl: WhatsappInvite | undefined }) {
	return (
		<Show when={props.inviteUrl}>
			{(url) => (
				<Button
					variant="secondary"
					onClick={() => {
						window.open(url(), "_blank", "noopener,noreferrer");
					}}
				>
					Message us on WhatsApp
				</Button>
			)}
		</Show>
	);
}

/** The WhatsApp button: a message to the guest's host when they have one with
 *  a phone, else the group invite; a skeleton while the host loads. */
function WhatsAppAction(props: {
	host: OnboardingHost | undefined;
	inviteUrl: WhatsappInvite | undefined;
}) {
	return (
		<Query.Root data={props.host}>
			<Query.Skeleton>
				<div role="status" aria-label="Loading" data-invite-skeleton="">
					<Skeleton class={styles.buttonSkeleton} />
				</div>
			</Query.Skeleton>
			<Query.Empty>
				<InviteButton inviteUrl={props.inviteUrl} />
			</Query.Empty>
			<Query.Content of={props.host}>
				{(host) => (
					<Show
						when={host().phone}
						fallback={<InviteButton inviteUrl={props.inviteUrl} />}
					>
						{(phone) => (
							<Button
								variant="secondary"
								onClick={() => {
									// wa.me wants the international number with
									// no "+", spaces or punctuation. Opens a
									// WhatsApp chat with the host — no spam
									// phone calls.
									window.open(
										`https://wa.me/${phone().replaceAll(/\D/g, "")}`,
										"_blank",
										"noopener,noreferrer"
									);
								}}
							>
								Message {host().name} on WhatsApp
							</Button>
						)}
					</Show>
				)}
			</Query.Content>
		</Query.Root>
	);
}

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
				<Query.Root data={host.data()}>
					<Query.Skeleton>
						<Skeleton width="long" />
					</Query.Skeleton>
					<Query.Empty>
						If you've never been to the space, for a smooth start
						reach out to one of our board members via WhatsApp. They
						will welcome you to the space and answer any questions
						you may have.
					</Query.Empty>
					<Query.Content of={host.data()}>
						{(knownHost) => (
							<>
								If you've never been to the space, for a smooth
								start reach out to your host {knownHost().name}{" "}
								via WhatsApp the first time you come. They will
								welcome you to the space and answer any
								questions you may have.
							</>
						)}
					</Query.Content>
				</Query.Root>
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
				<WhatsAppAction host={host.data()} inviteUrl={invite.data()} />
			</div>
			<StepActions>
				<Button onClick={() => void props.onComplete()}>Finish</Button>
			</StepActions>
		</div>
	);
}
