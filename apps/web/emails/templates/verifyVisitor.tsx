import { Link, Heading, Text } from "jsx-email";

import { EmailLayout } from "../EmailLayout.tsx";
import { styles } from "../theme.ts";

export type Props = { confirmUrl: string; logoUrl: string };

export function Template({ confirmUrl, logoUrl }: Props) {
	return (
		<EmailLayout
			preview="Confirm your email for J floor Wi-Fi"
			logoUrl={logoUrl}
		>
			<Heading style={styles.heading}>You're almost in</Heading>
			<Text style={styles.text}>
				Confirm your email to get the J floor Wi-Fi for the event.
			</Text>
			<Link href={confirmUrl} style={styles.button}>
				Confirm & get Wi-Fi
			</Link>
			<Text style={styles.text}>
				This link expires in 7 days. If you didn't register for a J
				floor event, ignore this email.
			</Text>
		</EmailLayout>
	);
}
