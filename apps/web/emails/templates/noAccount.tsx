// apps/web/emails/templates/noAccount.tsx
import { Link, Heading, Text } from "jsx-email";

import { EmailLayout } from "../EmailLayout.tsx";
import { styles } from "../theme.ts";

export type Props = {
	signinUrl: string;
	signUpUrl: string;
	logoUrl: string;
	privacyUrl: string;
};

export function Template({ signinUrl, signUpUrl, logoUrl, privacyUrl }: Props) {
	return (
		<EmailLayout
			preview="No J floor account for this email"
			logoUrl={logoUrl}
			privacyUrl={privacyUrl}
		>
			<Heading style={styles.heading}>
				No J floor account for this email
			</Heading>
			<Text style={styles.text}>
				Someone asked for a J floor sign-in link for this address, but
				it has no J floor account, so no link was sent.
			</Text>
			<Text style={styles.text}>
				If you're a member, you may have applied with a different email:
				sign in with that one.
			</Text>
			<Link href={signinUrl} style={styles.button}>
				Sign in
			</Link>
			<Text style={styles.text}>
				Not a member yet?{" "}
				<Link href={signUpUrl} style={styles.link}>
					Apply to join J floor.
				</Link>
			</Text>
			<Text style={styles.text}>
				If you didn't ask for this, you can ignore this email.
			</Text>
		</EmailLayout>
	);
}
