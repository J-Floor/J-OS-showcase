import { Link, Heading, Text } from "jsx-email";

import { EmailLayout } from "../EmailLayout.tsx";
import { styles } from "../theme.ts";

export type Props = {
	confirmUrl: string;
	logoUrl: string;
};

export function Template({ confirmUrl, logoUrl }: Props) {
	return (
		<EmailLayout
			preview="Confirm your new J floor sign-in address"
			logoUrl={logoUrl}
		>
			<Heading style={styles.heading}>Confirm your new address</Heading>
			<Text style={styles.text}>
				The J floor board asked to make this your sign-in address.
				Confirm it to finish the change.
			</Text>
			<Link href={confirmUrl} style={styles.button}>
				Confirm this address
			</Link>
			<Text style={styles.text}>
				This link expires in 7 days. If you don't expect this, ignore
				this email and nothing changes.
			</Text>
		</EmailLayout>
	);
}
