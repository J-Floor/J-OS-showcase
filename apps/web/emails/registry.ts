// apps/web/emails/registry.ts
import { palette, styles } from "./theme.ts";

// Registry: one entry per template. `fields` are the dynamic prop names; each
// becomes a sentinel `__JF_<UPPER>__`. `logoUrl` is shared by every template.
// build.ts renders each entry; generated.escape.test.ts reads the list
// fields, so it feeds each template the props it really takes.
export type ListField = {
	item: string[];
	html: string;
	text: string;
};

export type Entry = {
	name: string;
	file: string;
	fields: string[];
	/**
	 * Fields that are a list of records. The generated function takes
	 * `{ <item keys>: string }[]` and renders each record through `html`
	 * and `text`, replacing `{key}` placeholders. Every item value is
	 * HTML-escaped for the HTML part (the plain-text part stays raw), so
	 * callers never pre-escape.
	 */
	listFields?: Partial<Record<string, ListField>>;
};

/** The body text's box (`styles.text`) as inline CSS, for a list item that
 *  stands where a `<Text>` would. */
const TEXT_BOX = `color:${styles.text.color};font-size:${styles.text.fontSize};line-height:${styles.text.lineHeight};margin:${styles.text.margin};text-align:${styles.text.textAlign}`;

export const TEMPLATES: Entry[] = [
	{
		name: "applicationReceived",
		file: "templates/applicationReceived.tsx",
		fields: ["name", "logoUrl", "privacyUrl"],
	},
	{
		name: "alreadyActive",
		file: "templates/alreadyActive.tsx",
		fields: ["greeting", "signinUrl", "logoUrl", "privacyUrl"],
	},
	{
		name: "noAccount",
		file: "templates/noAccount.tsx",
		fields: ["signinUrl", "signUpUrl", "logoUrl", "privacyUrl"],
	},
	{
		name: "reapplyAfter",
		file: "templates/reapplyAfter.tsx",
		fields: ["until", "logoUrl", "privacyUrl"],
	},
	{
		name: "alreadyUnderReview",
		file: "templates/alreadyUnderReview.tsx",
		fields: ["logoUrl", "privacyUrl"],
	},
	{
		name: "approvalMember",
		file: "templates/approvalMember.tsx",
		fields: ["name", "signinUrl", "logoUrl"],
	},
	{
		name: "memberUpgrade",
		file: "templates/memberUpgrade.tsx",
		fields: ["name", "signinUrl", "logoUrl"],
	},
	{
		name: "approvalGuest",
		file: "templates/approvalGuest.tsx",
		fields: ["name", "fromDate", "untilDate", "signinUrl", "logoUrl"],
	},
	{
		name: "approvalGuestOpen",
		file: "templates/approvalGuestOpen.tsx",
		fields: ["name", "signinUrl", "logoUrl"],
	},
	{
		name: "rejection",
		file: "templates/rejection.tsx",
		fields: ["name", "venture", "logoUrl"],
	},
	{
		name: "magicLink",
		file: "templates/magicLink.tsx",
		fields: ["url", "logoUrl"],
	},
	{
		name: "signedAgreement",
		file: "templates/signedAgreement.tsx",
		fields: ["name", "logoUrl"],
	},
	{
		name: "verifyApplication",
		file: "templates/verifyApplication.tsx",
		fields: ["confirmUrl", "logoUrl", "privacyUrl"],
	},
	{
		name: "verifyVisitor",
		file: "templates/verifyVisitor.tsx",
		fields: ["confirmUrl", "logoUrl", "privacyUrl"],
	},
	{
		name: "confirmEmailChange",
		file: "templates/confirmEmailChange.tsx",
		fields: ["confirmUrl", "logoUrl"],
	},
	{
		name: "emailChanged",
		file: "templates/emailChanged.tsx",
		fields: ["newEmail", "logoUrl"],
	},
	{
		name: "eventInvite",
		file: "templates/eventInvite.tsx",
		fields: ["eventName", "confirmUrl", "logoUrl", "privacyUrl"],
	},
	{
		name: "boardNewApplication",
		file: "templates/boardNewApplication.tsx",
		fields: [
			"applicantName",
			"venture",
			"reviewUrl",
			"manageUrl",
			"logoUrl",
		],
	},
	{
		name: "taskAssigned",
		file: "templates/taskAssigned.tsx",
		fields: ["name", "taskTitle", "viewUrl", "manageUrl", "logoUrl"],
	},
	{
		name: "projectAssigned",
		file: "templates/projectAssigned.tsx",
		fields: ["name", "projectName", "viewUrl", "manageUrl", "logoUrl"],
	},
	{
		name: "perkRequested",
		file: "templates/perkRequested.tsx",
		fields: [
			"name",
			"requester",
			"perkTitle",
			"partner",
			"reason",
			"note",
			"viewUrl",
			"manageUrl",
			"logoUrl",
		],
		listFields: {
			// Zero or one item: the member's optional note, quoted. A list so an
			// absent note leaves no empty "Their note:" behind. The item
			// carries the body text's box and its gap, so no note leaves no
			// empty box and no blank line either.
			note: {
				item: ["text"],
				html: `<div style="${TEXT_BOX}"><p style="margin:0 0 8px">Their note:</p><p style="margin:0;padding-left:12px;border-left:3px solid ${palette.borderSubtle};white-space:pre-line">{text}</p></div>`,
				text: "Their note: {text}\n\n",
			},
		},
	},
	{
		name: "perkAdded",
		file: "templates/perkAdded.tsx",
		fields: [
			"name",
			"perkTitle",
			"partner",
			"viewUrl",
			"manageUrl",
			"logoUrl",
		],
	},
	{
		name: "perkRequestOutcome",
		file: "templates/perkRequestOutcome.tsx",
		fields: [
			"name",
			"headline",
			"perkTitle",
			"partner",
			"outcome",
			"viewUrl",
			"manageUrl",
			"logoUrl",
		],
	},
	{
		name: "perkExpiringSoon",
		file: "templates/perkExpiringSoon.tsx",
		fields: [
			"name",
			"perkTitle",
			"partner",
			"endDate",
			"viewUrl",
			"manageUrl",
			"logoUrl",
		],
	},
	{
		name: "boardDoorAlert",
		file: "templates/boardDoorAlert.tsx",
		fields: [
			"headline",
			"detail",
			"consequence",
			"diagnosticsUrl",
			"manageUrl",
			"logoUrl",
		],
	},
	{
		name: "boardOccupancyAlert",
		file: "templates/boardOccupancyAlert.tsx",
		fields: ["headline", "detail", "insightsUrl", "manageUrl", "logoUrl"],
	},
	{
		name: "boardLifecycleAlert",
		file: "templates/boardLifecycleAlert.tsx",
		fields: ["headline", "rows", "communityUrl", "manageUrl", "logoUrl"],
		listFields: {
			rows: {
				item: ["name", "url", "code", "detail"],
				html: '<p style="margin:0 0 12px"><a href="{url}">{name}</a>: {code} ({detail})</p>',
				text: "{name}: {code} ({detail}) {url}\n",
			},
		},
	},
	{
		name: "notice",
		file: "templates/notice.tsx",
		fields: [
			"heading",
			"body",
			"ctaLabel",
			"ctaUrl",
			"manageUrl",
			"logoUrl",
		],
	},
];
