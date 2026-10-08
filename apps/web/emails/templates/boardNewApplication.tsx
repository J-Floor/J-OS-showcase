import { Link, Heading, Text } from "jsx-email";

import { EmailLayout } from "../EmailLayout.tsx";
import { styles } from "../theme.ts";

export type Props = {
	applicantName: string;
	venture: string;
	reviewUrl: string;
	manageUrl: string;
	logoUrl: string;
};

export function Template({
	applicantName,
	venture,
	reviewUrl,
	manageUrl,
	logoUrl,
}: Props) {
	return (
		<EmailLayout
			preview="New application to review"
			logoUrl={logoUrl}
			manageUrl={manageUrl}
		>
			<Heading style={styles.heading}>New application to review</Heading>
			<Text style={styles.text}>
				{applicantName} from {venture} has submitted an application.
				Review it in the J floor admin.
			</Text>
			<Link href={reviewUrl} style={styles.button}>
				Review application
			</Link>
		</EmailLayout>
	);
}
