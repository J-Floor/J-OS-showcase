// apps/web/emails/templates/applicationReceived.tsx
import { Heading, Text } from "jsx-email";

import { EmailLayout } from "../EmailLayout.tsx";
import { styles } from "../theme.ts";

export type Props = {
	name: string;
	logoUrl: string;
};

export function Template({ name, logoUrl }: Props) {
	return (
		<EmailLayout
			preview="We've received your J floor application"
			logoUrl={logoUrl}
		>
			<Heading style={styles.heading}>Application received</Heading>
			<Text style={styles.text}>
				Thanks for applying to J floor, {name}. We've received your
				application and will carefully consider it.
			</Text>
			<Text style={styles.text}>
				If you didn't apply to J floor, please disregard this email.
			</Text>
		</EmailLayout>
	);
}
