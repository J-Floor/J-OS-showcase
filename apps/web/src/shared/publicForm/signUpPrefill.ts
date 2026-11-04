/** Visitors converting to full applicants arrive with their name + email
 *  already known (passed as router navigation state). */
export type SignUpPrefill = {
	firstName?: string;
	lastName?: string;
	email?: string;
};
