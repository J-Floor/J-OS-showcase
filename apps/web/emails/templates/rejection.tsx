// apps/web/emails/templates/rejection.tsx
import { Heading, Text } from "jsx-email";

import { EmailLayout } from "../EmailLayout.tsx";
import { styles } from "../theme.ts";

export type Props = { name: string; venture: string; logoUrl: string };

export function Template({ name, venture, logoUrl }: Props) {
	return (
		<EmailLayout
			preview="Update on your J floor application"
			logoUrl={logoUrl}
		>
			<Heading style={styles.heading}>Update on your application</Heading>
			<Text style={styles.text}>
				Thanks for applying, {name}. We have carefully considered your
				application, and have decided not to move forward. However,
				should your situation change (new project, different
				motivations...), we highly encourage you to reapply.
			</Text>
			<Text style={styles.text}>
				We nonetheless wish you all the best with {venture}.
			</Text>
		</EmailLayout>
	);
}
