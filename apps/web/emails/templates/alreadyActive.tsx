// apps/web/emails/templates/alreadyActive.tsx
import { Link, Heading, Text } from "jsx-email";

import { EmailLayout } from "../EmailLayout.tsx";
import { styles } from "../theme.ts";

export type Props = {
	greeting: string;
	signinUrl: string;
	logoUrl: string;
	privacyUrl: string;
};

export function Template({ greeting, signinUrl, logoUrl, privacyUrl }: Props) {
	return (
		<EmailLayout
			preview="This email already has J floor access"
			logoUrl={logoUrl}
			privacyUrl={privacyUrl}
		>
			<Heading style={styles.heading}>You're already in</Heading>
			<Text style={styles.text}>
				{greeting} this email already has access to J floor. There's no
				need to apply again. Just sign in.
			</Text>
			<Link href={signinUrl} style={styles.button}>
				Sign in
			</Link>
		</EmailLayout>
	);
}
