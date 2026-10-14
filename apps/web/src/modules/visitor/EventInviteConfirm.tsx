import { useAction } from "convex-solidjs";

import { api } from "../../../convex/_generated/api";
import { createLinkConfirmation } from "../../shared/linkConfirmation.ts";

import { WifiConfirmScreen } from "./ConfirmScreen.tsx";

/**
 * Public, unauthenticated `/event/confirm?token=<token>` page the confirm
 * link in the event-invite email lands on: confirms the token via
 * `eventCheckIn.confirmEventInvite` and, on success, shows the Wi-Fi. Unlike
 * `VisitorConfirm`, this is for a non-visitor (e.g. an existing J floor
 * member) checking into an event, so it always offers a way back into the
 * authed app.
 */
export function EventInviteConfirm() {
	const confirm = useAction(api.eventCheckIn.confirmEventInvite);
	const { status, response } = createLinkConfirmation((args) =>
		confirm.mutateAsync(args)
	);

	return (
		<WifiConfirmScreen
			status={status()}
			isVerified={status() === "verified"}
			wifi={response()?.wifi}
			expiredDetail="Ask for a fresh invite to get in."
		>
			<a href="/space">Have a J floor account? Open the space page →</a>
		</WifiConfirmScreen>
	);
}
