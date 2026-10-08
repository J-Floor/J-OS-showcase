import { Heading, Text } from "jsx-email";

import { EmailLayout } from "../EmailLayout.tsx";
import { styles } from "../theme.ts";

export type Props = {
	newEmail: string;
	logoUrl: string;
};

export function Template({ newEmail, logoUrl }: Props) {
	return (
		<EmailLayout
			preview="Your J floor sign-in address was changed"
			logoUrl={logoUrl}
		>
			<Heading style={styles.heading}>
				Your sign-in address changed
			</Heading>
			<Text style={styles.text}>
				Your J floor sign-in address was changed to {newEmail}. From now
				on, sign in with that address.
			</Text>
			<Text style={styles.text}>
				If you didn't expect this, tell the J floor board.
			</Text>
		</EmailLayout>
	);
}
