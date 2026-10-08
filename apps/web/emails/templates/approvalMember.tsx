// apps/web/emails/templates/approvalMember.tsx
import { Link, Heading, Text } from "jsx-email";

import { EmailLayout } from "../EmailLayout.tsx";
import { styles } from "../theme.ts";

export type Props = { name: string; signinUrl: string; logoUrl: string };

export function Template({ name, signinUrl, logoUrl }: Props) {
	return (
		<EmailLayout
			preview="Welcome to J floor - Membership access"
			logoUrl={logoUrl}
		>
			<Heading style={styles.heading}>Welcome to J floor!</Heading>
			<Text style={styles.text}>
				Hi {name}, we are happy to let you know that we have accepted
				your application to become a J floor member. We think you are an
				excellent builder and are excited to have you as part of the J
				floor community! Sign in below to get started. If anything is
				left to set up, the app will walk you through it.
			</Text>
			<Link href={signinUrl} style={styles.button}>
				Sign in
			</Link>
		</EmailLayout>
	);
}
