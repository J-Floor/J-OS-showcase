// apps/web/emails/templates/taskAssigned.tsx
import { Link, Heading, Text } from "jsx-email";

import { EmailLayout } from "../EmailLayout.tsx";
import { styles } from "../theme.ts";

export type Props = {
	name: string;
	taskTitle: string;
	viewUrl: string;
	manageUrl: string;
	logoUrl: string;
};

export function Template({
	name,
	taskTitle,
	viewUrl,
	manageUrl,
	logoUrl,
}: Props) {
	return (
		<EmailLayout
			preview="You've been assigned a task"
			logoUrl={logoUrl}
			manageUrl={manageUrl}
		>
			<Heading style={styles.heading}>New task assigned</Heading>
			<Text style={styles.text}>
				Hi {name}, you've been assigned to the task “{taskTitle}” on the
				J floor tasks board.
			</Text>
			<Link href={viewUrl} style={styles.button}>
				View the task
			</Link>
		</EmailLayout>
	);
}
