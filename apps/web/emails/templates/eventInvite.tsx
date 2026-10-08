import { Link, Heading, Text } from "jsx-email";

import { EmailLayout } from "../EmailLayout.tsx";
import { styles } from "../theme.ts";

export type Props = {
	eventName: string;
	confirmUrl: string;
	logoUrl: string;
};

export function Template({ eventName, confirmUrl, logoUrl }: Props) {
	return (
		<EmailLayout preview={`You're set for ${eventName}`} logoUrl={logoUrl}>
			<Heading style={styles.heading}>You're set for {eventName}</Heading>
			<Text style={styles.text}>
				Confirm to record your attendance and get the J floor Wi-Fi.
			</Text>
			<Link href={confirmUrl} style={styles.button}>
				Confirm & get Wi-Fi
			</Link>
			<Text style={styles.text}>This link expires in 7 days.</Text>
		</EmailLayout>
	);
}
