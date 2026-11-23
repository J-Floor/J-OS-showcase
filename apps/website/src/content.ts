export const metrics = [
	{ value: 150, prefix: "", suffix: "+", label: "founders" },
	{ value: 60, prefix: "", suffix: "", label: "companies" },
	{ value: 60, prefix: "$", suffix: "M", label: "raised" },
	{ value: 30, prefix: "", suffix: "+", label: "events" },
];
export const photoSlots = [
	{
		title: "A moment shared",
		src: "/assets/community/community.webp",
		alt: "A large group gathered for a community portrait",
		width: 1920,
		height: 1384,
		position: "50% 72%",
		ratio: "wide",
	},
	{
		title: "Building alongside each other",
		src: "/assets/community/workspace.webp",
		alt: "People working at laptops around shared desks",
		width: 1280,
		height: 940,
		position: "40% 50%",
		ratio: "close",
	},
	{
		title: "A place to build",
		src: "/assets/community/lounge.webp",
		alt: "Black-and-white view of the lounge with sofas, plants, and the J wall mark",
		width: 768,
		height: 1024,
		position: "50% 60%",
		ratio: "space",
	},
];
export type HouseEvent = {
	title: string;
	start: string;
	end: string;
	format: string;
	description: string;
	eligibility: string;
	status: "open" | "sold-out" | "cancelled" | "past";
	sample: boolean;
	registration?: string;
	recap?: string;
};
export const events: HouseEvent[] = [
	{
		title: "Builders evening",
		start: "2026-11-26T18:00:00+01:00",
		end: "2026-11-26T20:00:00+01:00",
		format: "Conversation",
		description: "An evening to exchange ideas and meet fellow builders.",
		eligibility: "Open to the wider community",
		status: "open",
		sample: true,
		registration: "https://example.com/events/sample-builders",
	},
	{
		title: "Work in progress",
		start: "2026-12-03T18:30:00+01:00",
		end: "2026-12-03T20:00:00+01:00",
		format: "Demo evening",
		description:
			"Bring an unfinished idea, share a demo, and ask for a fresh perspective.",
		eligibility: "Members and invited guests",
		status: "sold-out",
		sample: true,
	},
	{
		title: "Around the table",
		start: "2026-12-10T12:00:00+01:00",
		end: "2026-12-10T13:30:00+01:00",
		format: "Community lunch",
		description:
			"A small gathering for honest conversations about building.",
		eligibility: "Members only",
		status: "open",
		sample: true,
		registration: "https://example.com/events/sample-lunch",
	},
	{
		title: "An idea becomes a conversation",
		start: "2026-11-05T18:00:00+01:00",
		end: "2026-11-05T20:00:00+01:00",
		format: "Community evening",
		description:
			"A sample of the conversations that bring a builders house together.",
		eligibility: "Members and invited guests",
		status: "past",
		sample: true,
		recap: "https://example.com/events/sample-recap",
	},
	{
		title: "Show what you’re building",
		start: "2026-10-22T18:30:00+02:00",
		end: "2026-10-22T20:00:00+02:00",
		format: "Demo evening",
		description:
			"A sample gathering around experiments, questions, and shared learning.",
		eligibility: "Open to the wider community",
		status: "past",
		sample: true,
	},
];
export function eventGroups(items: HouseEvent[], now: number) {
	return {
		upcoming: items
			.filter(
				(item) => Date.parse(item.end) > now && item.status !== "past"
			)
			.sort((aa, bb) => Date.parse(aa.start) - Date.parse(bb.start)),
		recent: items
			.filter(
				(item) => Date.parse(item.end) <= now || item.status === "past"
			)
			.sort((aa, bb) => Date.parse(bb.start) - Date.parse(aa.start)),
	};
}
export function eventState(event: HouseEvent, now: number) {
	if (event.status === "cancelled") return "Cancelled";
	if (event.status === "past" || Date.parse(event.end) <= now)
		return "Past event";
	return event.status === "sold-out" ? "Sold out" : "Registration open";
}
export function eventDate(value: string) {
	return new Intl.DateTimeFormat("en-GB", {
		timeZone: "Europe/Zurich",
		day: "numeric",
		month: "short",
		year: "numeric",
	}).format(new Date(value));
}
export function eventTime(value: string) {
	return new Intl.DateTimeFormat("en-GB", {
		timeZone: "Europe/Zurich",
		hour: "2-digit",
		minute: "2-digit",
		hour12: false,
	}).format(new Date(value));
}
