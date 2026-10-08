import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

import { ACCESS_TIERS } from "./lib/roles.ts";
import { notificationPrefsValidator } from "./notify/categories.ts";

export const taskStatus = v.union(
	v.literal("backlog"),
	v.literal("in_progress"),
	v.literal("done")
);

// Venture stage is split into two ORTHOGONAL single-select axes so an applicant
// never has to choose between overlapping concepts (e.g. "MVP" vs "raised
// angel" — a company can be both). `productStage` = commercial maturity;
// `fundingStage` = how they're funded. Each axis is mutually exclusive.
export const productStage = v.union(
	v.literal("building"), // building tech, not commercial yet
	v.literal("prototype"),
	v.literal("mvp"),
	v.literal("traction"), // live, with customers/traction
	v.literal("other")
);

export const fundingStage = v.union(
	v.literal("bootstrapped"), // not raised
	v.literal("angel"),
	v.literal("pre_seed"),
	v.literal("seed"),
	v.literal("series_a"), // Series A or later
	v.literal("other")
);

// Industry/domain taxonomy. `vertical` is an array (a venture can span several,
// e.g. an AI tutor is [ai, edtech]); values are kept non-redundant — each names
// a distinct domain, not a business model. Drawn distinctions: ai (ML/agents
// core) vs data (analytics/BI) vs infra (compute/cloud/networking); healthtech
// (clinical care delivery) vs biotech (bio/pharma/lab) vs wellness (consumer
// health/fitness); climate (carbon/sustainability) vs energy (power/grid);
// logistics (supply chain) vs mobility (transport); ecommerce (commerce) vs
// martech (sales/gtm); creative (art/media/design) vs gaming (games/interactive);
// aerospace (air/space tech) vs defense (gov/defence buyers); manufacturing
// (process/industrial) vs materials (chemicals/advanced materials); proptech
// (real-estate transactions/management) vs construction (built environment).
// `productivity` is the one horizontal: work/ops software not tied to a function
// (ERP, collaboration, no-code) — a function-specific tool takes that function
// (CRM → martech, HR → hrtech) rather than this.
export const vertical = v.union(
	v.literal("ai"),
	v.literal("fintech"),
	v.literal("insurtech"),
	v.literal("healthtech"),
	v.literal("biotech"),
	v.literal("climate"),
	v.literal("energy"),
	v.literal("aerospace"),
	v.literal("robotics"),
	v.literal("hardware"),
	v.literal("semiconductors"),
	v.literal("devtools"),
	v.literal("infra"),
	v.literal("security"),
	v.literal("data"),
	v.literal("edtech"),
	v.literal("foodtech"),
	v.literal("agtech"),
	v.literal("proptech"),
	v.literal("legaltech"),
	v.literal("hrtech"),
	v.literal("logistics"),
	v.literal("mobility"),
	v.literal("traveltech"),
	v.literal("martech"),
	v.literal("ecommerce"),
	v.literal("consumer"),
	v.literal("creative"),
	v.literal("web3"),
	v.literal("manufacturing"),
	v.literal("defense"),
	v.literal("materials"),
	v.literal("construction"),
	v.literal("wellness"),
	v.literal("gaming"),
	v.literal("productivity"),
	v.literal("other")
);

export const tier = v.union(
	v.literal("prospect"),
	v.literal("guest"),
	v.literal("member"),
	v.literal("core"),
	v.literal("board"),
	v.literal("admin"),
	v.literal("staff"),
	v.literal("former"),
	v.literal("visitor")
);

export const stage = v.union(
	v.literal("unverified"),
	v.literal("verified"),
	v.literal("queued"),
	v.literal("denied"),
	v.literal("onboarding"),
	v.literal("active"),
	v.literal("expired")
);

export const doorOverride = v.union(
	v.literal("none"),
	v.literal("force_on"),
	v.literal("force_off")
);

/** Which physical smart lock a door action targets. Shared by the
 *  `unlockDoor`, `lockDoor` and `doorActionContext` args so they all accept
 *  exactly the same two values — see `lib/doorLocks#LockSlot`. */
export const lockSlot = v.union(v.literal("downstairs"), v.literal("upstairs"));

/** Where a lock's bolt is — mirrors `lib/doorProvider#DoorPosition`. */
export const doorPosition = v.union(
	v.literal("locked"),
	v.literal("unlocked"),
	v.literal("unlocking"),
	v.literal("locking"),
	v.literal("offline"),
	v.literal("unknown")
);

/** What an app door action does — mirrors `lib/doorProvider#DoorAction`, and
 *  is also the `doorLog.operation` its rows are written with. */
export const doorAction = v.union(v.literal("unlock"), v.literal("lock"));

/** How far an app unlock/lock the provider accepted got at the door — see
 *  `lib/doorActuation.ts`. `accepted`: still waiting for the door to react;
 *  `actuated`: it did; `unconfirmed`: it never did within the window. */
export const doorActuation = v.union(
	v.literal("accepted"),
	v.literal("actuated"),
	v.literal("unconfirmed")
);

export const personEventKind = v.union(
	v.literal("transition"),
	v.literal("field_edit"),
	v.literal("board_task"),
	// A self-serve onboarding step the person completed themselves. Distinct
	// from `field_edit` so the timeline does not collapse it out of sight.
	v.literal("step"),
	v.literal("door"),
	v.literal("email"),
	// The first time a person opened the Wi-Fi dialog. Recorded once, ever.
	v.literal("wifi"),
	// Another person row was folded into this one (`merge.ts`).
	v.literal("merge")
);

export const doorLogOperation = v.union(
	// RETIRED: nobody is granted a personal door key any more (the app opens the
	// doors). Kept only because existing rows carry it, like `doorLogTrigger`
	// and `doorLogOutcome`'s own retired values below.
	v.literal("grant"),
	v.literal("revoke"),
	// A door opened from the app (`doorActions.unlockDoor`), not a key change.
	v.literal("unlock"),
	// A door locked from the app (`doorActions.lockDoor`), not a key change.
	v.literal("lock")
);

// `cron`, `onboarding`, `resend` and `gc` are no longer written (the nightly
// sweep, the onboarding invite, the resend card and the GC pass are gone), but
// existing prod log rows carry them — Convex rejects a deploy whose schema no
// longer validates existing rows, so they stay.
export const doorLogTrigger = v.union(
	v.literal("cron"),
	v.literal("lifecycle"),
	v.literal("override"),
	v.literal("onboarding"),
	v.literal("resend"),
	v.literal("gc"),
	// The Space-page unlock button.
	v.literal("app"),
	// Rows from the one-time switchover run on 2026-10-05.
	v.literal("switchover")
);

export const doorLogOutcome = v.union(
	v.literal("ok"),
	v.literal("partial"),
	v.literal("failed"),
	// Logged but deliberately NOT performed: a GC revoke while GC deletes were
	// not armed. No longer written (the GC pass is gone); kept because existing
	// rows carry it. Never `ok`, which reads as done.
	v.literal("dry-run"),
	// An app unlock/lock the lock refused because it was still carrying out
	// the previous command (the lock's 'still busy' refusal). Nothing new was actuated.
	v.literal("busy")
);

export const doorLogRow = v.object({
	operation: doorLogOperation,
	trigger: doorLogTrigger,
	detail: v.optional(v.string()),
	personId: v.optional(v.id("people")),
	email: v.string(),
	name: v.string(),
	lockNames: v.array(v.string()),
	outcome: doorLogOutcome,
	actorId: v.optional(v.id("people")),
	// Which door this row is for — set ONLY on `operation: "unlock" | "lock"`
	// rows (`doorActions.unlockDoor` / `doorActions.lockDoor`). Optional so existing rows (and
	// every grant/revoke row, which has no single door) stay valid.
	// `doorInternal.doorActionContext`'s per-door debounce indexes on this field via
	// `by_personId_and_slot_and_outcome_and_at` and matches it exactly — never
	// set `slot` on a grant/revoke row, or it would start counting toward that
	// door's debounce.
	slot: v.optional(lockSlot),
	// Set only on ok unlock/lock rows: how long the action's effect lasts at the
	// door. The debounce reads it.
	durationMs: v.optional(v.number()),
	// Set only on ok app unlock/lock rows written by `doorLog.recordAttempt`:
	// how far the attempt got at the door, when it was requested (just before
	// the provider was called; `at` is stamped later, by the insert) and when
	// the door was first seen to react. Older rows lack all three.
	actuation: v.optional(doorActuation),
	requestedAt: v.optional(v.number()),
	actuatedAt: v.optional(v.number()),
});

export const ventureValidator = v.object({
	name: v.optional(v.string()),
	productStage: v.optional(productStage),
	fundingStage: v.optional(fundingStage),
	teamSize: v.optional(v.number()),
	description: v.optional(v.string()),
	whyJoin: v.optional(v.string()),
	pastBuilt: v.optional(v.string()),
	links: v.optional(
		v.array(
			v.object({
				label: v.string(),
				url: v.string(),
				threat: v.optional(v.string()),
				checkedAt: v.optional(v.number()),
			})
		)
	),
	referral: v.optional(v.string()),
});

/** The answers a re-applicant submitted, held until they confirm the email. */
export const reapplyPayload = v.object({
	firstName: v.string(),
	lastName: v.string(),
	phone: v.string(),
	vertical: v.array(vertical),
	venture: ventureValidator,
	submittedAt: v.number(),
});

export const confirmPurpose = v.union(
	v.literal("application"),
	v.literal("visitor"),
	v.literal("eventInvite"),
	v.literal("emailChange")
);

export default defineSchema({
	people: defineTable({
		// email is the unique identity; the name pair is display-only.
		email: v.string(),
		firstName: v.string(),
		lastName: v.string(),
		// Contact number. Shown to members in the board contacts directory and
		// used to surface a guest's host phone on the last onboarding step.
		phone: v.optional(v.string()),
		accessFrom: v.optional(v.number()),
		accessUntil: v.optional(v.number()),
		// The `accessUntil` the "expiring soon" reminder already went out for.
		guestExpiryRemindedFor: v.optional(v.number()),
		// Zoned source-of-truth for accessUntil (IXDTF string via
		// lib/time#composeExpiry). Optional: deploy 1 accepts existing rows
		// without it; a later task backfills and consumes this field.
		accessUntilLocal: v.optional(v.string()),
		vertical: v.optional(v.array(vertical)),
		// Guests are vouched for by a board member ("hosted by"). `hostedById`
		// references that board member (rename-safe, unambiguous). `hostedBy` is a
		// legacy display-name fallback, kept only for imported rows whose host
		// couldn't be resolved to a board member — prefer `hostedById`; both are
		// editable by any board member. (The old free-text `hostNote` was folded
		// into `board.noteLog` and dropped in a past migration — see git history.)
		hostedById: v.optional(v.id("people")),
		hostedBy: v.optional(v.string()),
		// last in-app route this person viewed; `/` redirects here on next visit
		lastPath: v.optional(v.string()),
		// Onboarding progress (members/guests between approval and confirmation).
		// `steps` maps a step id to its completion record; step-specific payload
		// is added by each step's own spec later. `tourSeen` gates the post-gate
		// Welcome Tour, which runs after onboarding completes.
		onboarding: v.optional(
			v.object({
				steps: v.record(
					v.string(),
					v.object({ completedAt: v.number() })
				),
				// Onboarding work only a board member can do (the WhatsApp group
				// add). Records WHO did it — the person to ask when the invite
				// never arrives. Board tasks never gate activation.
				boardSteps: v.optional(
					v.record(
						v.string(),
						v.object({
							completedAt: v.number(),
							byId: v.optional(v.id("people")),
						})
					)
				),
				tourSeen: v.optional(v.boolean()),
			})
		),
		// When this person dismissed the one-time "Getting in" intro (how the
		// doors open now, plus the Wi-Fi). Absent until then; while absent it is
		// shown to anyone whose door access is granted. Per person, so it
		// follows them across devices.
		doorsIntroSeenAt: v.optional(v.number()),
		// Per-category push/email switches from the Notifications drawer. A
		// missing category (or a missing object) means the default: both on.
		notificationPrefs: v.optional(notificationPrefsValidator),
		// --- lifecycle machine state (see docs/lifecycle.md) ---
		tier: tier,
		stage: stage,
		formerOf: v.optional(
			v.union(...ACCESS_TIERS.map((tier) => v.literal(tier)))
		),
		formerReason: v.optional(
			v.union(v.literal("kicked"), v.literal("left"))
		),
		stageSince: v.number(),
		// First time this person entered an active stage of a membership tier. Stamped by
		// `applyEvent`; never cleared. Makes a past activation a fact guards can read.
		activatedAt: v.optional(v.number()),
		door: v.optional(
			v.object({
				override: doorOverride,
				reason: v.optional(v.string()),
				byId: v.optional(v.id("people")),
				at: v.optional(v.number()),
				// Provider account-user id this person mapped to, once resolved —
				// what the per-person revoke matches by, besides the exact email.
				// Nothing resolves new ids any more: existing values are only carried
				// forward (a door override keeps them).
				doorUserId: v.optional(v.string()),
			})
		),
		provenance: v.optional(
			v.union(
				v.literal("signup"),
				v.literal("notion"),
				v.literal("seed"),
				v.literal("manual")
			)
		),
		// --- merged from `applications` ---
		venture: v.optional(ventureValidator),
		board: v.optional(
			v.object({
				score: v.optional(v.number()),
				// Legacy single shared string, already folded into `noteLog`.
				// Nothing writes or reads it any more; drop the field once no
				// deployment still holds it.
				notes: v.optional(v.string()),
				// Attributed board notes, oldest first. Each entry records who
				// wrote it (`authorId`, absent only on the one migrated legacy
				// entry) and when — replacing the manual "[name]:" convention the
				// single string forced.
				noteLog: v.optional(
					v.array(
						v.object({
							authorId: v.optional(v.id("people")),
							text: v.string(),
							at: v.number(),
						})
					)
				),
			})
		),
		submittedAt: v.optional(v.number()),
		verifiedAt: v.optional(v.number()),
		deniedAt: v.optional(v.number()),
	})
		.index("by_email", ["email"])
		.index("by_tier", ["tier"]),
	personEvents: defineTable({
		personId: v.id("people"),
		at: v.number(),
		actorId: v.optional(v.id("people")),
		kind: personEventKind,
		event: v.optional(v.string()),
		from: v.optional(v.string()),
		to: v.optional(v.string()),
		field: v.optional(v.string()),
		before: v.optional(v.any()),
		after: v.optional(v.any()),
		meta: v.optional(v.any()),
	}).index("by_person", ["personId"]),
	purgeLog: defineTable({ at: v.number(), count: v.number() }),
	signatures: defineTable({
		personId: v.id("people"),
		email: v.string(),
		variant: v.union(v.literal("member"), v.literal("guest")),
		signedName: v.string(),
		company: v.optional(v.string()),
		agreementVersion: v.string(),
		agreementHash: v.string(),
		signedAt: v.number(),
		// Crypto-seal audit anchor (in-app signatures only): sha256 of the FINAL
		// sealed PDF bytes, plus the fingerprint of the self-signed cert that
		// sealed it. Optional so legacy/imported rows (sourceUrl) stay valid.
		signedPdfHash: v.optional(v.string()),
		certFingerprint: v.optional(v.string()),
		// In-app signatures store the rendered PDF in _storage (`fileId`).
		// Agreements imported from the legacy Notion DB instead carry only an
		// external link to the original document (`sourceUrl`) — the PDF lives in
		// a Google Drive we don't control, so exactly one of these is set.
		fileId: v.optional(v.id("_storage")),
		sourceUrl: v.optional(v.string()),
	}).index("by_person", ["personId"]),
	projects: defineTable({
		name: v.string(),
		description: v.optional(v.string()),
		leaderId: v.optional(v.id("people")),
		startDate: v.optional(v.number()),
		endDate: v.optional(v.number()),
		createdBy: v.id("people"),
	}),
	tasks: defineTable({
		title: v.string(),
		description: v.optional(v.string()),
		status: taskStatus,
		assigneeIds: v.array(v.id("people")),
		projectId: v.optional(v.id("projects")),
		dueDate: v.optional(v.number()),
		createdBy: v.id("people"),
	})
		.index("by_status", ["status"])
		.index("by_project", ["projectId"]),
	/**
	 * What the system has already told the board about, so a fault that lasts a
	 * week does not send seven identical emails.
	 *
	 * One row per alert KIND (`key`), not per occurrence. `fingerprint` is a
	 * canonical description of the current fault — for the door, the sorted list
	 * of unreachable lock ids — so a CHANGE in what is wrong re-alerts
	 * immediately while the same fault staying wrong only re-alerts on the
	 * re-nag interval. An empty fingerprint means "nothing is wrong", which is
	 * how the all-clear is detected and how the next outage gets a fresh alert
	 * rather than being suppressed as a repeat.
	 */
	opsAlerts: defineTable({
		key: v.string(),
		fingerprint: v.string(),
		lastSentAt: v.number(),
	}).index("by_key", ["key"]),

	/**
	 * A cached door-health reading, so the Diagnostics card's poll does not fan
	 * a live provider round-trip out per viewer per minute. A single keyed row
	 * (`key: "doors"`); `doorHealth` serves it while `checkedAt` is within the
	 * TTL and refreshes it otherwise. The provider 429s under a burst, so bounding
	 * reads to ~one per TTL window is what keeps the poll safe.
	 */
	doorHealthCache: defineTable({
		key: v.string(),
		configured: v.number(),
		unavailable: v.array(
			v.object({
				lockId: v.string(),
				name: v.string(),
				serverState: v.number(),
			})
		),
		// A missing `locks` array is treated as a cache miss and refetched.
		locks: v.optional(
			v.array(
				v.object({
					lockId: v.string(),
					name: v.string(),
					online: v.boolean(),
					serverState: v.number(),
				})
			)
		),
		checkedAt: v.number(),
	}).index("by_key", ["key"]),

	/**
	 * Append-only log of what the app actually did on the lock account: key grants and
	 * revokes, and doors opened or locked from the app (`operation: "unlock"`
	 * / `"lock"`). Not
	 * personEvents: that table records the lifecycle/override that *scheduled*
	 * a reconcile, this one records what the provider was actually asked to do.
	 * No-ops (never had keys) are not written. Old rows may carry outcome
	 * `dry-run` (a GC revoke logged but not performed, from the retired GC
	 * pass). For unlocks this is the only per-person record: the provider's own log
	 * shows every app unlock under the one team-credential identity.
	 */
	doorLog: defineTable({
		at: v.number(),
		...doorLogRow.fields,
	})
		.index("by_at", ["at"])
		.index("by_personId_and_at", ["personId", "at"])
		.index("by_actor", ["actorId"])
		// Exact lookup for the per-door app-action debounce: personId + slot +
		// outcome "ok", newest first. Replaces a 20-row recency scan matched on
		// free-text `detail` — see `doorInternal.doorActionContext`.
		.index("by_personId_and_slot_and_outcome_and_at", [
			"personId",
			"slot",
			"outcome",
			"at",
		]),

	// Last bolt position read per lockable door, shared by every viewer of the
	// Doors card so polling stays off the provider. See `doorActions.doorPosition`.
	doorPositionCache: defineTable({
		slot: lockSlot,
		position: doorPosition,
		checkedAt: v.number(),
	}).index("by_slot", ["slot"]),

	events: defineTable({
		name: v.string(),
		startsAt: v.number(),
		endsAt: v.number(),
		// Zoned source-of-truth (IXDTF strings via lib/time). Required as of the
		// deploy-2 flip: the prod backfill populated every existing row, and
		// `createEvent` always writes both, so no event lacks them.
		startsAtLocal: v.string(),
		endsAtLocal: v.string(),
		createdBy: v.id("people"),
		createdAt: v.number(),
		// The two reminder jobs `notify/eventReminders` scheduled for this
		// event, so a later edit or delete can cancel them. Absent when the
		// reminder time had already passed.
		reminderJobIds: v.optional(
			v.object({
				startingSoon: v.optional(v.id("_scheduled_functions")),
				endingSoon: v.optional(v.id("_scheduled_functions")),
			})
		),
	}),
	eventAttendance: defineTable({
		personId: v.id("people"),
		eventId: v.id("events"),
		confirmedAt: v.number(),
	})
		.index("by_event", ["eventId"])
		.index("by_person", ["personId"])
		.index("by_person_event", ["personId", "eventId"]),
	/**
	 * One row per outstanding confirm link (application verify, visitor
	 * verify, event invite). A consumed row is kept until `expiresAt` so a
	 * repeat click can be told "already"; `purgeConfirmTokens` sweeps.
	 */
	confirmTokens: defineTable({
		/** SHA-256 hex of the raw token; the raw token lives only in the emailed link. */
		tokenHash: v.string(),
		purpose: confirmPurpose,
		personId: v.id("people"),
		eventId: v.optional(v.id("events")),
		expiresAt: v.number(),
		consumedAt: v.optional(v.number()),
		payload: v.optional(reapplyPayload),
		/** The address an `emailChange` token moves the person to once confirmed. */
		newEmail: v.optional(v.string()),
		/** The board member who requested an `emailChange`; recorded in the audit entry on confirm. */
		actorId: v.optional(v.id("people")),
	})
		.index("by_tokenHash", ["tokenHash"])
		.index("by_person_purpose", ["personId", "purpose"])
		.index("by_actorId", ["actorId"])
		.index("by_expiresAt", ["expiresAt"]),

	itemCategories: defineTable({
		name: v.string(),
		description: v.optional(v.string()),
	}).index("by_name", ["name"]),
	itemTypes: defineTable({
		name: v.string(),
		description: v.optional(v.string()),
		categoryId: v.id("itemCategories"),
	})
		.index("by_category", ["categoryId"])
		.index("by_category_and_name", ["categoryId", "name"]),
	items: defineTable({
		typeId: v.id("itemTypes"),
		assetTag: v.string(),
		description: v.optional(v.string()),
	})
		.index("by_assetTag", ["assetTag"])
		.index("by_type", ["typeId"]),

	/**
	 * One row per browser/device that enabled push. `endpoint` is unique per
	 * device; subscribing again from a shared device re-assigns the row to the
	 * signed-in person. Rows the push service reports gone (404/410) are deleted
	 * by `notify/channels/push`.
	 */
	pushSubscriptions: defineTable({
		personId: v.id("people"),
		endpoint: v.string(),
		p256dh: v.string(),
		auth: v.string(),
		userAgent: v.string(),
		createdAt: v.number(),
	})
		.index("by_person", ["personId"])
		.index("by_endpoint", ["endpoint"]),

	/**
	 * Every notification a person was sent, kept 90 days whatever their push
	 * and email switches say (`notify/inbox.ts`). `kind` is a plain string, not
	 * the kind union: removing a kind must not fail validation on rows that
	 * still carry it. `url` is an in-app path, so rows outlive a SITE_URL
	 * change.
	 */
	notifications: defineTable({
		personId: v.id("people"),
		kind: v.string(),
		title: v.string(),
		body: v.string(),
		url: v.string(),
		createdAt: v.number(),
		readAt: v.optional(v.number()),
	})
		.index("by_personId_and_createdAt", ["personId", "createdAt"])
		.index("by_personId_and_readAt", ["personId", "readAt"])
		.index("by_createdAt", ["createdAt"]),

	/** Board members' handwriting PNGs for countersigning, uploaded by an operator. */
	boardSignatures: defineTable({
		slug: v.string(),
		fileId: v.id("_storage"),
	}).index("by_slug", ["slug"]),

	/**
	 * Board-editable space Wi-Fi credentials. A singleton: at most one row,
	 * read via `.first()` (no index needed). `lib/wifi.ts#readWifi` throws when
	 * it is absent.
	 */
	wifiConfig: defineTable({
		ssid: v.string(),
		password: v.string(),
	}),
});
