// apps/web/emails/templates/magicLink.tsx
import { Link, Heading, Text } from "jsx-email";

import { EmailLayout } from "../EmailLayout.tsx";
import { styles } from "../theme.ts";

export type Props = { url: string; logoUrl: string };

export function Template({ url, logoUrl }: Props) {
	return (
		<EmailLayout preview="Your J floor sign-in link" logoUrl={logoUrl}>
			<Heading style={styles.heading}>Sign in to J floor</Heading>
			<Text style={styles.text}>
				You requested a J floor sign-in link.
			</Text>
			<Link href={url} style={styles.button}>
				Sign in
			</Link>
			<Text style={styles.text}>
				This link expires shortly. If you didn't explicitly request a
				link, ignore this email.
			</Text>
		</EmailLayout>
	);
}
