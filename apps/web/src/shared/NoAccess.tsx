import { Button, Icon, PermissionDenied } from "@j-os/design-system";
import { useNavigate } from "@solidjs/router";

import { authClient } from "../lib/auth.ts";
import { APP_NAME } from "../lib/constants.ts";

import { ICONS } from "./icons.ts";
import styles from "./NoAccess.module.scss";

const HINT =
	"If you're a member, you may have applied with a different email: sign out and use that one.";

/**
 * Shown when the user IS signed in but has no member/board/guest profile — i.e.
 * an insufficient-permission state, NOT a signed-out state (RoleGate redirects
 * signed-out users to /signin). Names the signed-in email (safe: sign-in is
 * magic-link only, so the viewer owns that inbox) and makes Sign out the
 * primary action so they can try the email they applied with. Wrapped in a
 * full-viewport box so ExceptionDisplay fills the screen.
 */
export function NoAccess() {
	const navigate = useNavigate();
	const session = authClient.useSession();
	async function signOut() {
		await authClient.signOut();
		navigate("/signin", { replace: true });
	}
	function description(): string {
		const email = session().data?.user.email;
		return email
			? `You're signed in as ${email}, which has no ${APP_NAME} access. ${HINT}`
			: `This email has no ${APP_NAME} access. ${HINT}`;
	}
	return (
		<div class={styles.fill}>
			<PermissionDenied title="No access" description={description()}>
				<Button
					variant="tertiary"
					onClick={() => {
						window.history.back();
					}}
				>
					<Icon>{ICONS.back}</Icon>Back
				</Button>
				<Button onClick={() => void signOut()}>
					<Icon>{ICONS.signOut}</Icon>Sign out
				</Button>
			</PermissionDenied>
		</div>
	);
}
