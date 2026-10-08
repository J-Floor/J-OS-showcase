// apps/web/emails/templates/approvalGuestOpen.tsx
import { Link, Heading, Text } from "jsx-email";

import { EmailLayout } from "../EmailLayout.tsx";
import { styles } from "../theme.ts";

export type Props = {
	name: string;
	signinUrl: string;
	logoUrl: string;
};

export function Template({ name, signinUrl, logoUrl }: Props) {
	return (
		<EmailLayout
			preview="Welcome to J floor - Guest access"
			logoUrl={logoUrl}
		>
			<Heading style={styles.heading}>Welcome to J floor!</Heading>
			<Text style={styles.text}>
				Hi {name}, we are happy to let you know that you can join J
				floor as a guest. We are excited to see how you become part of
				the J floor community! Sign in below to get started. If anything
				is left to set up, the app will walk you through it.
			</Text>
			<Link href={signinUrl} style={styles.button}>
				Sign in
			</Link>
		</EmailLayout>
	);
}
