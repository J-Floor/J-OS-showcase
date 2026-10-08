// apps/web/emails/templates/alreadyUnderReview.tsx
import { Heading, Text } from "jsx-email";

import { EmailLayout } from "../EmailLayout.tsx";
import { styles } from "../theme.ts";

export type Props = { logoUrl: string };

export function Template({ logoUrl }: Props) {
	return (
		<EmailLayout
			preview="Your J floor application is with the board"
			logoUrl={logoUrl}
		>
			<Heading style={styles.heading}>Already with the board</Heading>
			<Text style={styles.text}>
				We already have an application from this email and the board is
				looking at it. There is nothing you need to do — we will be in
				touch as soon as there is a decision.
			</Text>
		</EmailLayout>
	);
}
