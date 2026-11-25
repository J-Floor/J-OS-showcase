import { v, type VLiteral } from "convex/values";
import { err, ok, type Result } from "neverthrow";

export const SCHEDULE_DAYS = [
	"mon",
	"tue",
	"wed",
	"thu",
	"fri",
	"sat",
	"sun",
] as const;
export type ScheduleDayName = (typeof SCHEDULE_DAYS)[number];

/** One weekday: either closed all day, or on from `on` to `off` (`HH:MM`, 24 h). */
export type ScheduleDay = {
	day: ScheduleDayName;
	closed: boolean;
	on?: string;
	off?: string;
};

const dayLiterals = SCHEDULE_DAYS.map((day) => v.literal(day)) as [
	VLiteral<"mon">,
	VLiteral<"tue">,
	VLiteral<"wed">,
	VLiteral<"thu">,
	VLiteral<"fri">,
	VLiteral<"sat">,
	VLiteral<"sun">,
];

/** The Convex validator for one `ScheduleDay`, shared by the table and the mutation. */
export const scheduleDayValidator = v.object({
	day: v.union(...dayLiterals),
	closed: v.boolean(),
	on: v.optional(v.string()),
	off: v.optional(v.string()),
});

export type ScheduleProblem = { message: string };

const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

function refuse(message: string): Result<never, ScheduleProblem> {
	return err({ message });
}

function isDayName(value: string): value is ScheduleDayName {
	return (SCHEDULE_DAYS as readonly string[]).includes(value);
}

function checkDay(entry: ScheduleDay): ScheduleProblem | undefined {
	if (entry.closed)
		return entry.on === undefined && entry.off === undefined
			? undefined
			: { message: `${entry.day}: a closed day has no times` };
	if (entry.on === undefined || entry.off === undefined)
		return { message: `${entry.day}: set both on and off` };
	if (!TIME.test(entry.on) || !TIME.test(entry.off))
		return { message: `${entry.day}: times look like 08:00` };
	// Same-width zero-padded times compare correctly as strings.
	if (entry.on >= entry.off)
		return { message: `${entry.day}: on must be before off` };
	return undefined;
}

/** The days, Monday first, or why they are refused. */
export function validateSchedule(
	days: readonly ScheduleDay[]
): Result<ScheduleDay[], ScheduleProblem> {
	const seen = new Set<string>();
	for (const entry of days) {
		if (!isDayName(entry.day))
			return refuse(`${String(entry.day)} is not a weekday`);
		if (seen.has(entry.day)) return refuse(`${entry.day} appears twice`);
		seen.add(entry.day);
		const problem = checkDay(entry);
		if (problem) return err(problem);
	}
	return ok(
		days.toSorted(
			(left, right) =>
				SCHEDULE_DAYS.indexOf(left.day) -
				SCHEDULE_DAYS.indexOf(right.day)
		)
	);
}

/** The canonical `<schedule>` document a TV downloads. Inputs must already be validated. */
export function scheduleToXml(
	version: number,
	days: readonly ScheduleDay[]
): string {
	const elements = days.map((entry) =>
		entry.closed
			? `<day name="${entry.day}" off="all"/>`
			: `<day name="${entry.day}" on="${entry.on}" off="${entry.off}"/>`
	);
	return `<schedule version="${String(version)}">${elements.join("")}</schedule>`;
}
