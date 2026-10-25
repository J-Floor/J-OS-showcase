import { Button } from "@j-os/design-system";
import { useNavigate } from "@solidjs/router";
import { useAction } from "convex-solidjs";
import { Show } from "solid-js";

import { api } from "../../../convex/_generated/api";
import { createLinkConfirmation } from "../../shared/linkConfirmation.ts";
import type { SignUpPrefill } from "../signup/signUpForm.ts";

import { WifiConfirmScreen } from "./ConfirmScreen.tsx";

/**
 * Public, unauthenticated `/visitor/confirm?token=<token>` page the confirm
 * link in the visitor email lands on: confirms the token via
 * `visitors.confirmVisitor` and, on success, shows the Wi-Fi and who it was
 * for. Dispatches no lifecycle event — see `ConfirmApplication` for why that
 * matters.
 */
export function VisitorConfirm() {
	const navigate = useNavigate();
	const confirm = useAction(api.visitors.confirmVisitor);
	const { status, response } = createLinkConfirmation((args) =>
		confirm.mutateAsync(args)
	);

	return (
		<WifiConfirmScreen
			status={status()}
			isVerified={status() === "verified" || status() === "already"}
			wifi={response()?.wifi}
			expiredDetail="Register again to get a fresh link."
		>
			<Show when={response()?.who} keyed>
				{(wifi) => (
					<Button
						onClick={() => {
							navigate("/sign-up", {
								state: {
									firstName: wifi.firstName,
									lastName: wifi.lastName,
									email: wifi.email,
								} satisfies SignUpPrefill,
							});
						}}
					>
						Apply to J floor
					</Button>
				)}
			</Show>
		</WifiConfirmScreen>
	);
}
