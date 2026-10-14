import { useMutation } from "convex-solidjs";
import { Match, Switch } from "solid-js";

import { api } from "../../../convex/_generated/api";
import { APP_NAME } from "../../lib/constants.ts";
import { createLinkConfirmation } from "../../shared/linkConfirmation.ts";

import {
	ConfirmDetail,
	ConfirmingLine,
	ConfirmOutcome,
	ConfirmScreen,
} from "./ConfirmScreen.tsx";

/**
 * Public, unauthenticated `/email/confirm?token=<token>` page the link in the
 * "confirm your new sign-in address" email lands on: confirms the token via
 * `people.confirmEmailChange`, which moves the person to the new address.
 */
export function EmailChangeConfirm() {
	const confirm = useMutation(api.people.confirmEmailChange);
	const { status } = createLinkConfirmation((args) =>
		confirm.mutateAsync(args)
	);

	return (
		<ConfirmScreen>
			<Switch>
				<Match when={status() === "loading"}>
					<ConfirmingLine />
				</Match>
				<Match when={status() === "verified"}>
					<ConfirmOutcome title="Your sign-in address is changed">
						<ConfirmDetail>
							From now on, sign in with this address.
						</ConfirmDetail>
						<a href="/signin">Sign in →</a>
					</ConfirmOutcome>
				</Match>
				<Match when={status() === "taken"}>
					<ConfirmOutcome title="This address is already in use">
						<ConfirmDetail>
							Another person signs in with it now, so nothing
							changed. Ask the {APP_NAME} board for help.
						</ConfirmDetail>
					</ConfirmOutcome>
				</Match>
				<Match when={status() === "expired"}>
					<ConfirmOutcome title="This link has expired">
						<ConfirmDetail>
							Nothing changed. Ask the {APP_NAME} board to send a
							new one.
						</ConfirmDetail>
					</ConfirmOutcome>
				</Match>
				<Match when={status() === "invalid"}>
					<ConfirmOutcome title="This link isn't valid" />
				</Match>
			</Switch>
		</ConfirmScreen>
	);
}
