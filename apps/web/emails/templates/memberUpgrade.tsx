// apps/web/emails/templates/memberUpgrade.tsx
import { Link, Heading, Text } from "jsx-email";

import { EmailLayout } from "../EmailLayout.tsx";
import { styles } from "../theme.ts";

export type Props = { name: string; signinUrl: string; logoUrl: string };

export function Template({ name, signinUrl, logoUrl }: Props) {
	return (
		<EmailLayout preview="You're now a J floor member" logoUrl={logoUrl}>
			<Heading style={styles.heading}>
				You're now a J floor member
			</Heading>
			<Text style={styles.text}>
				Hi {name}, your guest access has become a full J floor
				membership. One thing is left: the member agreement replaces the
				guest one you signed, so sign in and sign it. Everything else
				you have already done stays done, and your door access is
				unchanged.
			</Text>
			<Link href={signinUrl} style={styles.button}>
				Sign the member agreement
			</Link>
		</EmailLayout>
	);
}
