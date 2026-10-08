// apps/web/emails/templates/projectAssigned.tsx
import { Link, Heading, Text } from "jsx-email";

import { EmailLayout } from "../EmailLayout.tsx";
import { styles } from "../theme.ts";

export type Props = {
	name: string;
	projectName: string;
	viewUrl: string;
	manageUrl: string;
	logoUrl: string;
};

export function Template({
	name,
	projectName,
	viewUrl,
	manageUrl,
	logoUrl,
}: Props) {
	return (
		<EmailLayout
			preview="You're leading a project"
			logoUrl={logoUrl}
			manageUrl={manageUrl}
		>
			<Heading style={styles.heading}>You're leading a project</Heading>
			<Text style={styles.text}>
				{name}, you've been assigned as lead of the project “
				{projectName}” on the J floor tasks board.
			</Text>
			<Link href={viewUrl} style={styles.button}>
				View the project
			</Link>
		</EmailLayout>
	);
}
