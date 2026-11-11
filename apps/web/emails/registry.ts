// apps/web/emails/registry.ts
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
		name: "dailyDigest",
		file: "templates/dailyDigest.tsx",
		fields: ["heading", "items", "appUrl", "manageUrl", "logoUrl"],
		listFields: {
			items: {
				item: ["section", "title", "body", "url"],
				html: '<p style="margin:0 0 12px"><strong>{section}</strong> · <a href="{url}">{title}</a><br>{body}</p>',
				text: "{section} · {title}: {body} {url}\n",
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
