// apps/web/emails/templates/signedAgreement.tsx
import { Heading, Text } from "jsx-email";

import { EmailLayout } from "../EmailLayout.tsx";
import { styles } from "../theme.ts";

export type Props = { name: string; logoUrl: string };

export function Template({ name, logoUrl }: Props) {
	return (
		<EmailLayout preview="Your signed J floor agreement" logoUrl={logoUrl}>
			<Heading style={styles.heading}>Your signed agreement</Heading>
			<Text style={styles.text}>
				Thanks, {name}. Your signed J floor agreement is attached for
				your records.
			</Text>
		</EmailLayout>
	);
}
