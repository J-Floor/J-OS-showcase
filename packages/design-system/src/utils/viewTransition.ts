/**
 * The one way the design system runs a View Transition.
 *
 * At most one transition runs at a time. A call made while another
 * transition's update is still running JOINS it: its update runs inside the
 * running one and its kinds and names are added. A palette pick that changes
 * the route is one transition, not two that cancel each other.
 *
 * The browser holds the old frame on screen while the update runs, so every
 * wait in here is capped at {@link SETTLE_CAP_MS}. Nothing waits for data:
 * a page that is still loading goes into the new snapshot as its skeleton.
 *
 * Without the API, or under reduced motion, the update runs synchronously and
 * nothing animates.
 */
export const SETTLE_CAP_MS = 50;

const PART_PREFIX = "jf-morph-part-";

/**
 * The class every value flight carries: viewTransition.scss styles them all
 * through it, so any number may fly. A browser without
 * `view-transition-class` ignores it and flies them with its default look.
 */
export const PART_CLASS = "jf-morph-part";

/** A value flight's name: `jf-morph-part-` and its field key. */
export type PartName = `${typeof PART_PREFIX}${string}`;

/** The flight name of the value keyed `key`, escaped into a valid CSS
 *  ident; distinct keys keep distinct names. */
export function partName(key: string): PartName {
	return `${PART_PREFIX}${CSS.escape(key)}`;
}

/**
 * An app's own transition name or kind: the app styles it in its own
 * stylesheet (the pseudo-elements match on the document root, so the rules
 * are global). The design system's own names start with `jf-`.
 */
export type AppTransitionName = `app-${string}`;

export type TransitionName =
	| "jf-tab"
	| "jf-morph"
	| "jf-morph-scrim"
	| "jf-morph-source"
	| "jf-morph-title"
	| PartName
	| "jf-sheet-body"
	| "jf-brand-backdrop"
	| "jf-brand-frame"
	| "jf-brand-mark"
	| AppTransitionName;

export type TransitionKind =
	| "morph"
	| "morph-scale"
	| "morph-box"
	| "morph-grow"
	| "morph-shrink"
	| "tab-forward"
	| "tab-back"
	| "sheet-next"
	| "sheet-prev"
	| "brand"
	| "brand-reveal"
	| AppTransitionName;

export type TransitionScope = {
	/**
	 * A name holds one element per session: asking for a name another
	 * element holds is refused, with a dev warning, because a duplicate makes
	 * the browser skip the whole transition.
	 */
	name: (element: HTMLElement, name: TransitionName) => void;
	unname: (element: HTMLElement) => void;
	kind: (kind: TransitionKind) => void;
	/**
	 * Runs after every joined update has settled, just before the new
	 * snapshot. Registered after the session has drained (from an update that
	 * outlived the cap), it runs immediately: the snapshot is already taken.
	 */
	beforeSnapshot: (callback: () => void) => void;
};

type Update = (scope: TransitionScope) => unknown;

/**
 * One transition: what joined it and what it named. Created before
 * startViewTransition: a browser may run the update callback synchronously,
 * and a join inside it returns `finished`.
 */
class Session {
	readonly queue: Update[] = [];
	readonly snapshotCallbacks: (() => void)[] = [];
	readonly kinds = new Set<TransitionKind>();
	/** Each named element and its name; `holders` is the same map inverted. */
	readonly named = new Map<HTMLElement, TransitionName>();
	readonly holders = new Map<TransitionName, HTMLElement>();
	readonly warnedDuplicates = new Set<TransitionName>();
	readonly scope: TransitionScope = createScope(this);
	readonly finished: Promise<void>;
	readonly settle: () => void;

	constructor() {
		// Hand-rolled, not Promise.withResolvers: Chrome 111-118 have View
		// Transitions but not withResolvers, and an old browser must only
		// lose the animation, never the update.
		let settle!: () => void;
		this.finished = new Promise<void>((resolve) => {
			settle = resolve;
		});
		this.settle = settle;
	}
}

/** A direction replaces its opposite: the latest step decides the slide. */
const OPPOSITE_KIND: Partial<Record<TransitionKind, TransitionKind>> = {
	"morph-scale": "morph-box",
	"morph-box": "morph-scale",
	"tab-forward": "tab-back",
	"tab-back": "tab-forward",
	"sheet-next": "sheet-prev",
	"sheet-prev": "sheet-next",
};

/** Without a transition: names and kinds do nothing. Fresh per call, so
 *  state a caller keys on the scope never leaks into the next call. */
function noScope(): TransitionScope {
	return {
		name: () => {},
		unname: () => {},
		kind: () => {},
		beforeSnapshot: (callback) => {
			callback();
		},
	};
}

/** The session whose update is still running; joins go here. */
let updating: Session | undefined;
/** The latest session started; only it owns `data-vt` and the names. */
let latest: Session | undefined;
const owner = new WeakMap<HTMLElement, Session>();

export function canAnimate(): boolean {
	return typeof document === "undefined" ||
		// eslint-disable-next-line no-restricted-properties -- the one place allowed to touch the View Transitions API
		typeof document.startViewTransition !== "function"
		? false
		: !(
				typeof matchMedia === "function" &&
				matchMedia("(prefers-reduced-motion: reduce)").matches
			);
}

/** True while a transition's update runs; given a kind, only if it has it. */
export function isTransitionRunning(kind?: TransitionKind): boolean {
	return (
		updating !== undefined &&
		(kind === undefined || updating.kinds.has(kind))
	);
}

/**
 * The running transition's end, from its start until its animation finishes;
 * `undefined` when none runs. While it runs, the page under the snapshots
 * can see pointer events that are artefacts of the swap (a `mouseleave` while
 * rendering is suppressed): a hover state can wait for this and re-read.
 */
export function activeTransition(): Promise<void> | undefined {
	return latest?.finished;
}

/** Resolves when the running transition finishes, at once when none runs. */
export function afterTransition(): Promise<void> {
	return activeTransition() ?? Promise.resolve();
}

/** The scope of the session whose update is running, if any. */
export function runningScope(): TransitionScope | undefined {
	return updating?.scope;
}

function wait(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Waits for `promise`, at most `ms`; the timer never outlives the wait. */
async function waitAtMost(
	promise: Promise<unknown>,
	ms: number
): Promise<void> {
	let timer: ReturnType<typeof setTimeout> | undefined;
	try {
		await Promise.race([
			promise,
			new Promise((resolve) => {
				timer = setTimeout(resolve, ms);
			}),
		]);
	} finally {
		clearTimeout(timer);
	}
}

/** An update's own error (or a morph cleanup's) must not vanish into the
 *  transition: it is thrown on its own, where the console reports it. */
export function surfaceError(error: unknown): void {
	queueMicrotask(() => {
		throw error;
	});
}

function writeKinds(session: Session): void {
	if (latest !== session) return;
	document.documentElement.dataset.vt = [...session.kinds].join(" ");
}

function warnDuplicate(session: Session, name: TransitionName): void {
	if (!import.meta.env.DEV || session.warnedDuplicates.has(name)) return;
	session.warnedDuplicates.add(name);
	// eslint-disable-next-line no-console -- a warning for the developer, not the user
	console.warn(
		`viewTransition: "${name}" is already assigned in this transition; the second element keeps no name (a duplicate would skip the transition).`
	);
}

/** Sets `name` on `element`, with the part class when it is a part's. */
function writeName(element: HTMLElement, name: TransitionName): void {
	element.style.setProperty("view-transition-name", name);
	if (name.startsWith(PART_PREFIX)) {
		element.style.setProperty("view-transition-class", PART_CLASS);
	} else {
		element.style.removeProperty("view-transition-class");
	}
}

function clearName(element: HTMLElement): void {
	element.style.removeProperty("view-transition-name");
	element.style.removeProperty("view-transition-class");
	owner.delete(element);
}

/** Frees the name `element` holds in this session, if any. */
function release(session: Session, element: HTMLElement): void {
	const held = session.named.get(element);
	if (held !== undefined) session.holders.delete(held);
	session.named.delete(element);
}

function createScope(session: Session): TransitionScope {
	return {
		name(element, name) {
			const holder = session.holders.get(name);
			if (holder && holder !== element) {
				warnDuplicate(session, name);
				return;
			}
			release(session, element);
			session.holders.set(name, element);
			session.named.set(element, name);
			writeName(element, name);
			owner.set(element, session);
		},
		unname(element) {
			release(session, element);
			if (owner.get(element) === session) clearName(element);
		},
		kind(kind) {
			const opposite = OPPOSITE_KIND[kind];
			if (opposite) session.kinds.delete(opposite);
			session.kinds.add(kind);
			writeKinds(session);
		},
		beforeSnapshot(callback) {
			if (updating === session) {
				session.snapshotCallbacks.push(callback);
				return;
			}
			callback();
		},
	};
}

function cleanUp(session: Session): void {
	for (const element of session.named.keys()) {
		if (owner.get(element) === session) clearName(element);
	}
	if (latest !== session) return;
	delete document.documentElement.dataset.vt;
	latest = undefined;
}

/**
 * Starts every queued update; each one's error is surfaced on its own, so
 * the returned promise never rejects.
 */
function runQueued(session: Session): Promise<unknown> {
	const running: Promise<unknown>[] = [];
	for (
		let update = session.queue.shift();
		update;
		update = session.queue.shift()
	) {
		try {
			running.push(
				Promise.resolve(update(session.scope)).catch(surfaceError)
			);
		} catch (error) {
			surfaceError(error);
		}
	}
	return Promise.all(running);
}

function runSnapshotCallbacks(session: Session): void {
	for (const callback of session.snapshotCallbacks.splice(0)) {
		try {
			callback();
		} catch (error) {
			surfaceError(error);
		}
	}
}

/** Runs queued updates until a whole task passes with nothing new, capped. */
async function drain(session: Session): Promise<void> {
	const deadline = performance.now() + SETTLE_CAP_MS;
	function timeLeft(): number {
		return deadline - performance.now();
	}
	do {
		const running = runQueued(session);
		if (timeLeft() > 0) await waitAtMost(running, timeLeft());
		if (timeLeft() > 0) await wait(0);
	} while (session.queue.length > 0 && timeLeft() > 0);
	// Past the cap nothing waits, but nothing that joined is dropped either.
	flushNow(session);
}

/**
 * Runs everything still queued, and the snapshot callbacks, without waiting,
 * then ends the session's update synchronously so nothing can join it after.
 */
function flushNow(session: Session): void {
	while (session.queue.length > 0 || session.snapshotCallbacks.length > 0) {
		void runQueued(session);
		runSnapshotCallbacks(session);
	}
	if (updating === session) updating = undefined;
}

/** No API or reduced motion: the update runs now, its errors surfaced. */
function runWithoutTransition(update: Update): Promise<void> {
	try {
		return Promise.resolve(update(noScope())).then(() => {}, surfaceError);
	} catch (error) {
		surfaceError(error);
		return Promise.resolve();
	}
}

function warnStartFailed(error: unknown): void {
	if (!import.meta.env.DEV) return;
	// eslint-disable-next-line no-console -- a warning for the developer, not the user
	console.warn(
		"viewTransition: startViewTransition threw; ran the update without animating.",
		error
	);
}

type TransitionOptions = {
	kind?: TransitionKind;
	names?: [HTMLElement, TransitionName][];
};

/** Adds the call's kind, names and update to `session`. */
function enqueue(
	session: Session,
	update: Update,
	options: TransitionOptions
): void {
	const { kind, names = [] } = options;
	if (kind) session.scope.kind(kind);
	for (const [element, name] of names) {
		session.scope.name(element, name);
	}
	session.queue.push(update);
}

export function viewTransition(
	update: Update,
	options: TransitionOptions = {}
): Promise<void> {
	if (updating) {
		enqueue(updating, update, options);
		return updating.finished;
	}
	if (!canAnimate()) return runWithoutTransition(update);
	const session = new Session();
	latest = session;
	writeKinds(session);
	enqueue(session, update, options);
	updating = session;
	function finish(): void {
		cleanUp(session);
		session.settle();
	}
	let transition: ViewTransition;
	try {
		// eslint-disable-next-line no-restricted-properties -- the one place allowed to call the View Transitions API
		transition = document.startViewTransition(async () => {
			try {
				await drain(session);
			} finally {
				if (updating === session) updating = undefined;
			}
		});
	} catch (error) {
		// E.g. a hidden document: no animation, but the update still runs.
		warnStartFailed(error);
		flushNow(session);
		finish();
		return session.finished;
	}
	// A skipped transition (a duplicate name, say) rejects `ready`; some
	// Chromes log that as uncaught. `finished` below covers the cleanup.
	// Promise.resolve: test fakes return no `ready`.
	void Promise.resolve(transition.ready).catch(() => {});
	transition.finished.then(finish, finish);
	return session.finished;
}

type Move = {
	from: HTMLElement | null | undefined;
	to: (scope: TransitionScope) => HTMLElement | null | undefined;
	name: TransitionName;
};

/**
 * Moves `name` from `from` (old snapshot) to `to(scope)` (new snapshot),
 * never on both at once. `to` runs just before the new snapshot, after every
 * joined update, so it finds what the update rendered. `also` moves more
 * names in the same transition, resolved in order after the first.
 */
export function moveName(
	options: Move & {
		kind: TransitionKind;
		update: (scope: TransitionScope) => unknown;
		also?: Move[];
	}
): Promise<void> {
	const moves = [options, ...(options.also ?? [])];
	const names: [HTMLElement, TransitionName][] = [];
	for (const { from, name } of moves) if (from) names.push([from, name]);
	return viewTransition(
		(scope) => {
			for (const [from] of names) scope.unname(from);
			scope.beforeSnapshot(() => {
				for (const { to, name } of moves) {
					const target = to(scope);
					if (target) scope.name(target, name);
				}
			});
			return options.update(scope);
		},
		{ kind: options.kind, names }
	);
}
