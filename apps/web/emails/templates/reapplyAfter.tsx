// apps/web/emails/templates/reapplyAfter.tsx
import { Heading, Text } from "jsx-email";

import { EmailLayout } from "../EmailLayout.tsx";
import { styles } from "../theme.ts";

export type Props = { until: string; logoUrl: string; privacyUrl: string };

export function Template({ until, logoUrl, privacyUrl }: Props) {
	return (
		<EmailLayout
			preview="About your latest J floor application"
			logoUrl={logoUrl}
			privacyUrl={privacyUrl}
		>
			<Heading style={styles.heading}>Thanks for applying again</Heading>
			<Text style={styles.text}>
				We already received an application associated to your email
				recently. In case your situation (project, motivations...)
				changed, we are happy to receive a new application. You're
				therefore welcome to apply again after {until}.
			</Text>
		</EmailLayout>
	);
}
