import { Link, Heading, Text } from "jsx-email";

import { EmailLayout } from "../EmailLayout.tsx";
import { styles } from "../theme.ts";

export type Props = {
	/** What happened, in one line — e.g. "Occupancy counter offline". */
	headline: string;
	/** When it last reported and what to do. */
	detail: string;
	insightsUrl: string;
	manageUrl: string;
	logoUrl: string;
};

/**
 * The occupancy counter went quiet past its normal reporting gap, or came
 * back. Attendance hours pause while it is quiet, so the board hears the
 * same day.
 */
export function Template({
	headline,
	detail,
	insightsUrl,
	manageUrl,
	logoUrl,
}: Props) {
	return (
		<EmailLayout
			preview="Occupancy counter needs attention"
			logoUrl={logoUrl}
			manageUrl={manageUrl}
		>
			<Heading style={styles.heading}>
				Occupancy counter needs attention
			</Heading>
			<Text style={styles.text}>{headline}</Text>
			<Text style={styles.text}>{detail}</Text>
			<Link href={insightsUrl} style={styles.button}>
				Open Insights
			</Link>
		</EmailLayout>
	);
}
