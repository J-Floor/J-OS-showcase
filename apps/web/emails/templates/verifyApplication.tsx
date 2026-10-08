import { Link, Heading, Text } from "jsx-email";

import { EmailLayout } from "../EmailLayout.tsx";
import { styles } from "../theme.ts";

export type Props = {
	confirmUrl: string;
	logoUrl: string;
	privacyUrl: string;
};

export function Template({ confirmUrl, logoUrl, privacyUrl }: Props) {
	return (
		<EmailLayout
			preview="Confirm your J floor application"
			logoUrl={logoUrl}
			privacyUrl={privacyUrl}
		>
			<Heading style={styles.heading}>Confirm your application</Heading>
			<Text style={styles.text}>
				Confirm this email address so we can review your application to
				J floor.
			</Text>
			<Link href={confirmUrl} style={styles.button}>
				Confirm my application
			</Link>
			<Text style={styles.text}>
				This link expires in 7 days. If you didn't apply to J floor,
				ignore this email.
			</Text>
		</EmailLayout>
	);
}
