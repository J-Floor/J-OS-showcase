// @vitest-environment happy-dom
import {
	cleanup,
	fireEvent,
	render,
	screen,
	waitFor,
} from "@solidjs/testing-library";
import { ConvexError } from "convex/values";
import { createSignal } from "solid-js";
import { afterEach, beforeEach, expect, test, vi } from "vitest";

// `mutateAsync` is the unlock action, `lockAsync` the lock action,
// `positionAsync` the door-position read: the mock routes each
// `useAction(ref)` by the ref's function name.
const {
	mutateAsync,
	lockAsync,
	positionAsync,
	fetchPresenceToken,
	currentPerson,
	attemptRows,
	liveAttemptQueries,
} = vi.hoisted(() => {
	/** What `people.getCurrentPerson` returns; `undefined` = still loading.
	 *  An explicit annotation (rather than a cast on the initial value) keeps
	 *  TS from inferring `value`'s type from just the first literal — later
	 *  tests assign shapes (a `door` field, `undefined`) the first literal
	 *  does not have. */
	const currentPerson: {
		value: Record<string, unknown> | null | undefined;
	} = {
		value: { tier: "member", stage: "active" },
	};
	/** What `doorLog.attempt` returns per attempt id; a missing id is still
	 *  loading. `read` is pointed at a signal below, so the card re-renders
	 *  when a test changes a row. */
	const attemptRows: { read: (id: string) => unknown } = {
		read: () => undefined,
	};
	/** How many `doorLog.attempt` subscriptions are open: each `useQuery`
	 *  opens one, its owner's cleanup closes it. */
	const liveAttemptQueries = { count: 0 };
	return {
		mutateAsync: vi.fn(),
		lockAsync: vi.fn(),
		positionAsync: vi.fn(),
		fetchPresenceToken: vi.fn(),
		currentPerson,
		attemptRows,
		liveAttemptQueries,
	};
});

vi.mock("convex-solidjs", async () => {
	const { getFunctionName } = await import("convex/server");
	const { onCleanup } = await import("solid-js");
	function openAttemptQuery() {
		liveAttemptQueries.count += 1;
		onCleanup(() => {
			liveAttemptQueries.count -= 1;
		});
	}
	return {
		useAction: (ref: Parameters<typeof getFunctionName>[0]) => ({
			mutate: vi.fn(),
			mutateAsync:
				{
					"doorActions:lockDoor": lockAsync,
					"doorActions:doorPosition": positionAsync,
				}[getFunctionName(ref)] ?? mutateAsync,
			isLoading: () => false,
			data: () => undefined,
			error: () => undefined,
		}),
		useQuery: (
			ref: Parameters<typeof getFunctionName>[0],
			args: unknown
		) => {
			const name = getFunctionName(ref);
			if (name === "doorLog:attempt") openAttemptQuery();
			return name === "doorLog:attempt"
				? {
						data: () =>
							attemptRows.read((args as { id: string }).id),
						isLoading: () => false,
						error: () => undefined,
					}
				: {
						data: () => currentPerson.value,
						isLoading: () => false,
						error: () => undefined,
					};
		},
	};
});

vi.mock("./presence.ts", () => ({ fetchPresenceToken }));

import { FRESH_MIN_AGE_MS } from "../../../convex/lib/doorLocks.ts";
import { type DoorPosition } from "../../../convex/lib/doorProvider.ts";

import { UnlockCard } from "./UnlockCard.tsx";

type AttemptRow = {
	actuation: "accepted" | "actuated" | "unconfirmed";
	durationMs: number;
	requestedAt: number;
	actuatedAt?: number;
} | null;

const NOW = Date.UTC(2026, 9, 8, 12, 0);
const UNLOCK_ATTEMPT = "attempt-unlock";
const LOCK_ATTEMPT = "attempt-lock";

const [attemptRowsById, setAttemptRows] = createSignal<
	Record<string, AttemptRow>
>({});
// eslint-disable-next-line solid/reactivity -- called from the card's tracked scope, which re-runs on a row change
attemptRows.read = (id) => attemptRowsById()[id];

function attemptRow(
	actuation: "accepted" | "actuated" | "unconfirmed",
	durationMs = 5000
): AttemptRow {
	return {
		actuation,
		durationMs,
		requestedAt: NOW,
		...(actuation === "actuated" ? { actuatedAt: NOW } : {}),
	};
}

function setAttempt(id: string, row: AttemptRow) {
	setAttemptRows((rows) => ({ ...rows, [id]: row }));
}

if (!("ResizeObserver" in globalThis)) {
	globalThis.ResizeObserver = class {
		observe() {}
		unobserve() {}
		disconnect() {}
	};
}

afterEach(cleanup);
beforeEach(() => {
	mutateAsync.mockReset();
	lockAsync.mockReset();
	positionAsync.mockReset();
	fetchPresenceToken.mockReset();
	currentPerson.value = { tier: "member", stage: "active" };
	fetchPresenceToken.mockResolvedValue("tok");
	setAttemptRows({
		[UNLOCK_ATTEMPT]: attemptRow("actuated"),
		[LOCK_ATTEMPT]: attemptRow("actuated"),
	});
	mutateAsync.mockResolvedValue({ status: "ok", attemptId: UNLOCK_ATTEMPT });
	lockAsync.mockResolvedValue({ status: "ok", attemptId: LOCK_ATTEMPT });
	positionAsync.mockResolvedValue("locked");
});

function renderCard() {
	return render(() => <UnlockCard />);
}

test("is shown to a member — app unlock is for everyone the door is open for", () => {
	renderCard();
	expect(screen.getByText("Doors")).toBeInTheDocument();
	expect(
		screen.getByRole("button", { name: "Unlock Downstairs" })
	).toBeInTheDocument();
});

test("is shown to a guest", () => {
	currentPerson.value = { tier: "guest", stage: "active" };
	renderCard();
	expect(screen.getByText("Doors")).toBeInTheDocument();
});

test("is hidden from someone the board has shut out (force_off)", () => {
	currentPerson.value = {
		tier: "member",
		stage: "active",
		door: { override: "force_off" },
	};
	renderCard();
	expect(screen.queryByText("Doors")).not.toBeInTheDocument();
	expect(screen.queryByRole("button")).not.toBeInTheDocument();
});

test("is hidden while the person is still loading", () => {
	currentPerson.value = undefined;
	renderCard();
	expect(screen.queryByText("Doors")).not.toBeInTheDocument();
});

test("is shown to a guest inside their access window", () => {
	currentPerson.value = {
		tier: "guest",
		stage: "active",
		accessFrom: Date.now() - 86_400_000,
		accessUntil: Date.now() + 86_400_000,
	};
	renderCard();
	expect(screen.getByText("Doors")).toBeInTheDocument();
});

test("is hidden from a guest whose access has expired", () => {
	currentPerson.value = {
		tier: "guest",
		stage: "active",
		accessUntil: Date.now() - 1000,
	};
	renderCard();
	expect(screen.queryByText("Doors")).not.toBeInTheDocument();
	expect(screen.queryByRole("button")).not.toBeInTheDocument();
});

test("is hidden from a guest whose window has not opened yet", () => {
	currentPerson.value = {
		tier: "guest",
		stage: "active",
		accessFrom: Date.now() + 86_400_000,
	};
	renderCard();
	expect(screen.queryByText("Doors")).not.toBeInTheDocument();
});

test("is hidden when there is no person row (null)", () => {
	currentPerson.value = null;
	renderCard();
	expect(screen.queryByText("Doors")).not.toBeInTheDocument();
});

test("opens the chosen door with a fresh presence token", async () => {
	renderCard();
	fireEvent.click(
		await screen.findByRole("button", {
			name: "Unlock Upstairs (4th floor)",
		})
	);
	await waitFor(() => {
		expect(mutateAsync).toHaveBeenCalledWith({
			lock: "upstairs",
			presence: "tok",
		});
	});
	expect(await screen.findByText("Door is unlocking")).toBeInTheDocument();
});

test("off the building network it asks to join the Wi-Fi and never calls unlock", async () => {
	fetchPresenceToken.mockResolvedValue(null);
	renderCard();
	fireEvent.click(screen.getByRole("button", { name: "Unlock Downstairs" }));
	expect(
		await screen.findByText(/Join the J floor Wi-Fi to unlock/)
	).toBeInTheDocument();
	expect(mutateAsync).not.toHaveBeenCalled();
});

test("says so when the lock is offline", async () => {
	mutateAsync.mockResolvedValue({ status: "offline" });
	renderCard();
	fireEvent.click(
		await screen.findByRole("button", {
			name: "Unlock Upstairs (4th floor)",
		})
	);
	expect(
		await screen.findByText(/Upstairs lock is offline/)
	).toBeInTheDocument();
});

test("a debounced repeat tap reads as already opening", async () => {
	mutateAsync.mockResolvedValue({ status: "debounced" });
	renderCard();
	fireEvent.click(screen.getByRole("button", { name: "Unlock Downstairs" }));
	expect(
		await screen.findByText("Downstairs door is already opening.")
	).toBeInTheDocument();
});

test("shows the server's error message", async () => {
	mutateAsync.mockRejectedValue(
		new ConvexError("Door unlock is not configured.")
	);
	renderCard();
	fireEvent.click(
		await screen.findByRole("button", {
			name: "Unlock Upstairs (4th floor)",
		})
	);
	expect(
		await screen.findByText("Door unlock is not configured.")
	).toBeInTheDocument();
});

test("shows a generic message for a non-ConvexError, never the raw error text", async () => {
	mutateAsync.mockRejectedValue(new Error("boom"));
	renderCard();
	fireEvent.click(
		await screen.findByRole("button", {
			name: "Unlock Upstairs (4th floor)",
		})
	);
	expect(
		await screen.findByText("Couldn't open the door.")
	).toBeInTheDocument();
	expect(screen.queryByText("boom")).not.toBeInTheDocument();
});

test("is titled Doors, with the internet notice and no help icon", () => {
	renderCard();
	expect(screen.getByText("Doors")).toBeInTheDocument();
	expect(
		screen.getByText("An internet connection is required.")
	).toBeInTheDocument();
	expect(screen.queryByText("help")).not.toBeInTheDocument();
});

test("a debounced repeat lock reads as already locking", async () => {
	lockAsync.mockResolvedValue({ status: "debounced" });
	positionAsync.mockResolvedValue("unlocked");
	renderCard();
	fireEvent.click(
		await screen.findByRole("button", {
			name: "Lock Upstairs (4th floor)",
		})
	);
	expect(
		await screen.findByText("Upstairs door is already locking.")
	).toBeInTheDocument();
});

test("an offline lock says so", async () => {
	lockAsync.mockResolvedValue({ status: "offline" });
	positionAsync.mockResolvedValue("unlocked");
	renderCard();
	fireEvent.click(
		await screen.findByRole("button", {
			name: "Lock Upstairs (4th floor)",
		})
	);
	expect(
		await screen.findByText(
			"Upstairs lock is offline — try again in a moment."
		)
	).toBeInTheDocument();
});

test("off the building network Lock never calls lockDoor", async () => {
	fetchPresenceToken.mockResolvedValue(null);
	positionAsync.mockResolvedValue("unlocked");
	renderCard();
	fireEvent.click(
		await screen.findByRole("button", {
			name: "Lock Upstairs (4th floor)",
		})
	);
	// Action-aware: Lock asks to join the Wi-Fi to LOCK, not to unlock.
	expect(
		await screen.findByText(
			"Join the J floor Wi-Fi to lock — the Wi-Fi card has the details."
		)
	).toBeInTheDocument();
	expect(lockAsync).not.toHaveBeenCalled();
});

test("a downstairs unlock counts down 'Open — push now' only once the door reacts, then the button returns", async () => {
	vi.useFakeTimers({ shouldAdvanceTime: true });
	try {
		setAttempt(UNLOCK_ATTEMPT, attemptRow("accepted", 3000));
		renderCard();
		fireEvent.click(
			screen.getByRole("button", { name: "Unlock Downstairs" })
		);
		expect(await screen.findByText("Waking the door…")).toBeInTheDocument();
		await vi.advanceTimersByTimeAsync(10_000);
		expect(screen.getByText("Waking the door…")).toBeInTheDocument();
		expect(screen.queryByText(/Open — push now/)).not.toBeInTheDocument();
		setAttempt(UNLOCK_ATTEMPT, attemptRow("actuated", 3000));
		expect(
			await screen.findByText("Open — push now (3s)")
		).toBeInTheDocument();
		expect(
			screen.queryByRole("button", { name: "Unlock Downstairs" })
		).not.toBeInTheDocument();
		vi.advanceTimersByTime(1000);
		expect(
			await screen.findByText("Open — push now (2s)")
		).toBeInTheDocument();
		vi.advanceTimersByTime(2000);
		await waitFor(() => {
			expect(
				screen.getByRole("button", { name: "Unlock Downstairs" })
			).toBeInTheDocument();
		});
		expect(screen.queryByText(/Open — push now/)).not.toBeInTheDocument();
	} finally {
		vi.useRealTimers();
	}
});

test("keyboard focus returns to the door button when it comes back", async () => {
	vi.useFakeTimers({ shouldAdvanceTime: true });
	try {
		renderCard();
		const before = await screen.findByRole("button", {
			name: "Unlock Upstairs (4th floor)",
		});
		before.focus();
		fireEvent.click(before);
		await vi.advanceTimersByTimeAsync(0);
		expect(document.activeElement).toBe(document.body);
		vi.advanceTimersByTime(5000);
		await waitFor(() => {
			expect(
				screen.getByRole("button", {
					name: "Unlock Upstairs (4th floor)",
				})
			).toBe(document.activeElement);
		});
	} finally {
		vi.useRealTimers();
	}
});

test("an upstairs unlock reads 'Door is unlocking' and the button returns after durationMs", async () => {
	vi.useFakeTimers({ shouldAdvanceTime: true });
	try {
		renderCard();
		fireEvent.click(
			await screen.findByRole("button", {
				name: "Unlock Upstairs (4th floor)",
			})
		);
		await vi.advanceTimersByTimeAsync(0);
		expect(screen.getByText("Door is unlocking")).toBeInTheDocument();
		expect(mutateAsync).toHaveBeenCalled();
		vi.advanceTimersByTime(4000);
		expect(screen.getByText("Door is unlocking")).toBeInTheDocument();
		vi.advanceTimersByTime(1000);
		await waitFor(() => {
			expect(
				screen.getByRole("button", {
					name: "Unlock Upstairs (4th floor)",
				})
			).toBeInTheDocument();
		});
		expect(screen.queryByText("Door is unlocking")).not.toBeInTheDocument();
	} finally {
		vi.useRealTimers();
	}
});

test("an upstairs lock reads 'Door is locking' and the button returns after durationMs", async () => {
	vi.useFakeTimers({ shouldAdvanceTime: true });
	try {
		setAttempt(LOCK_ATTEMPT, attemptRow("actuated", 4000));
		positionAsync.mockResolvedValue("unlocked");
		renderCard();
		fireEvent.click(
			await screen.findByRole("button", {
				name: "Lock Upstairs (4th floor)",
			})
		);
		await vi.advanceTimersByTimeAsync(0);
		expect(screen.getByText("Door is locking")).toBeInTheDocument();
		expect(lockAsync).toHaveBeenCalled();
		vi.advanceTimersByTime(3000);
		expect(screen.getByText("Door is locking")).toBeInTheDocument();
		vi.advanceTimersByTime(1000);
		await waitFor(() => {
			expect(
				screen.getByRole("button", {
					name: "Lock Upstairs (4th floor)",
				})
			).toBeInTheDocument();
		});
		expect(screen.queryByText("Door is locking")).not.toBeInTheDocument();
	} finally {
		vi.useRealTimers();
	}
});

test("a rejected action shows the error in the door's slot, and the button returns after 5s", async () => {
	vi.useFakeTimers({ shouldAdvanceTime: true });
	try {
		mutateAsync.mockRejectedValue(new Error("boom"));
		renderCard();
		fireEvent.click(
			await screen.findByRole("button", {
				name: "Unlock Upstairs (4th floor)",
			})
		);
		const text = await screen.findByText("Couldn't open the door.");
		expect(text).toHaveRole("alert");
		expect(text.className).toMatch(/statusError/);
		expect(text.parentElement?.className).toMatch(/slot/);
		vi.advanceTimersByTime(5000);
		await waitFor(() => {
			expect(
				screen.getByRole("button", {
					name: "Unlock Upstairs (4th floor)",
				})
			).toBeInTheDocument();
		});
	} finally {
		vi.useRealTimers();
	}
});

test("an offline result shows its copy in the slot, and the button returns after 5s", async () => {
	vi.useFakeTimers({ shouldAdvanceTime: true });
	try {
		mutateAsync.mockResolvedValue({ status: "offline" });
		renderCard();
		fireEvent.click(
			await screen.findByRole("button", {
				name: "Unlock Upstairs (4th floor)",
			})
		);
		const text = await screen.findByText(/Upstairs lock is offline/);
		expect(text.className).toMatch(/statusWarning/);
		vi.advanceTimersByTime(5000);
		await waitFor(() => {
			expect(
				screen.getByRole("button", {
					name: "Unlock Upstairs (4th floor)",
				})
			).toBeInTheDocument();
		});
	} finally {
		vi.useRealTimers();
	}
});

function spokenStatuses() {
	return screen.queryAllByRole("status").filter((el) => el.textContent);
}

const REFRESH = "Check again";

test("no status renders at the card bottom: the only status element stands in the door's slot", async () => {
	mutateAsync.mockResolvedValue({ status: "busy" });
	renderCard();
	await screen.findByRole("button", { name: "Unlock Upstairs (4th floor)" });
	expect(spokenStatuses()).toEqual([]);
	expect(screen.queryByRole("alert")).not.toBeInTheDocument();
	fireEvent.click(screen.getByRole("button", { name: "Unlock Downstairs" }));
	const text = await screen.findByText(/Downstairs door is still opening/);
	expect(spokenStatuses()).toEqual([text]);
	expect(text.parentElement?.className).toMatch(/slot/);
	expect(
		screen.getByRole("button", { name: "Unlock Upstairs (4th floor)" })
	).toBeInTheDocument();
});

test("a debounced result shows its copy in the slot, and the button returns after 5s", async () => {
	vi.useFakeTimers({ shouldAdvanceTime: true });
	try {
		mutateAsync.mockResolvedValue({ status: "debounced" });
		renderCard();
		fireEvent.click(
			screen.getByRole("button", { name: "Unlock Downstairs" })
		);
		const text = await screen.findByText(
			"Downstairs door is already opening."
		);
		expect(text.className).not.toMatch(/statusWarning|statusError/);
		vi.advanceTimersByTime(5000);
		await waitFor(() => {
			expect(
				screen.getByRole("button", { name: "Unlock Downstairs" })
			).toBeInTheDocument();
		});
	} finally {
		vi.useRealTimers();
	}
});

test("the countdown never renders 0s, and the button is absent until durationMs and present after", async () => {
	vi.useFakeTimers({ shouldAdvanceTime: true });
	try {
		setAttempt(UNLOCK_ATTEMPT, attemptRow("actuated", 3000));
		renderCard();
		fireEvent.click(
			screen.getByRole("button", { name: "Unlock Downstairs" })
		);
		await vi.advanceTimersByTimeAsync(0);
		const seen: string[] = [];
		const observer = new MutationObserver(() => {
			seen.push(document.body.textContent);
		});
		observer.observe(document.body, {
			childList: true,
			subtree: true,
			characterData: true,
		});
		vi.advanceTimersByTime(2500);
		expect(
			screen.queryByRole("button", { name: "Unlock Downstairs" })
		).not.toBeInTheDocument();
		vi.advanceTimersByTime(1000);
		await waitFor(() => {
			expect(
				screen.getByRole("button", { name: "Unlock Downstairs" })
			).toBeInTheDocument();
		});
		await Promise.resolve();
		observer.disconnect();
		expect(seen.some((t) => t.includes("(0s)"))).toBe(false);
		expect(screen.queryByText(/0s/)).not.toBeInTheDocument();
	} finally {
		vi.useRealTimers();
	}
});

const POSITION_POLL_MS = 30_000;
const EARLY_MARGIN_MS = 500;

async function settle() {
	await new Promise((resolve) => setTimeout(resolve, 0));
}

function pendingPosition() {
	const pending: {
		resolve: (v: DoorPosition) => void;
	} = { resolve() {} };
	positionAsync.mockReturnValueOnce(
		new Promise((resolve) => {
			pending.resolve = resolve;
		})
	);
	return pending;
}

test("the refresh button re-checks fresh, shows loading, and the Unlock button returns when it reads locked", async () => {
	positionAsync.mockResolvedValue("unlocked");
	renderCard();
	await screen.findByRole("button", { name: "Lock Upstairs (4th floor)" });
	const pending = pendingPosition();
	fireEvent.click(screen.getByRole("button", { name: REFRESH }));
	expect(positionAsync).toHaveBeenLastCalledWith({
		lock: "upstairs",
		fresh: true,
	});
	await waitFor(() => {
		expect(screen.getByRole("button", { name: REFRESH })).toHaveClass(
			/loading/
		);
	});
	expect(screen.getByRole("button", { name: REFRESH })).not.toBeDisabled();
	pending.resolve("locked");
	expect(
		await screen.findByRole("button", {
			name: "Unlock Upstairs (4th floor)",
		})
	).toBeInTheDocument();
	expect(
		screen.queryByRole("button", { name: "Lock Upstairs (4th floor)" })
	).not.toBeInTheDocument();
	expect(screen.getByRole("button", { name: REFRESH })).not.toHaveClass(
		/loading/
	);
});

test("a refresh that still reads unlocked keeps the Lock button", async () => {
	positionAsync.mockResolvedValue("unlocked");
	renderCard();
	await screen.findByRole("button", { name: "Lock Upstairs (4th floor)" });
	fireEvent.click(screen.getByRole("button", { name: REFRESH }));
	await settle();
	expect(
		screen.getByRole("button", { name: "Lock Upstairs (4th floor)" })
	).toBeInTheDocument();
	expect(screen.getByRole("button", { name: REFRESH })).not.toHaveClass(
		/loading/
	);
});

test("two refresh clicks while the first is in flight send one request", async () => {
	renderCard();
	await screen.findByRole("button", { name: "Unlock Upstairs (4th floor)" });
	const refresh = screen.getByRole("button", { name: REFRESH });
	positionAsync.mockClear();
	pendingPosition();
	fireEvent.click(refresh);
	fireEvent.click(refresh);
	await settle();
	expect(positionAsync).toHaveBeenCalledTimes(1);
});

function freshCalls() {
	return positionAsync.mock.calls.filter(
		(call: unknown[]) => (call[0] as { fresh?: boolean }).fresh === true
	);
}

test("a refresh within 5s of the last fresh request waits out the 5s, once, with loading and never disabled", async () => {
	vi.useFakeTimers({ shouldAdvanceTime: true });
	try {
		renderCard();
		await vi.advanceTimersByTimeAsync(0);
		const refresh = screen.getByRole("button", { name: REFRESH });
		fireEvent.click(refresh);
		await vi.advanceTimersByTimeAsync(0);
		expect(freshCalls()).toHaveLength(1);
		await vi.advanceTimersByTimeAsync(1000);
		fireEvent.click(screen.getByRole("button", { name: REFRESH }));
		fireEvent.click(screen.getByRole("button", { name: REFRESH }));
		await vi.advanceTimersByTimeAsync(0);
		expect(freshCalls()).toHaveLength(1);
		const waiting = screen.getByRole("button", { name: REFRESH });
		expect(waiting).toHaveClass(/loading/);
		expect(waiting).not.toBeDisabled();
		await vi.advanceTimersByTimeAsync(3000);
		expect(freshCalls()).toHaveLength(1);
		await vi.advanceTimersByTimeAsync(1000);
		expect(freshCalls()).toHaveLength(2);
		await vi.advanceTimersByTimeAsync(0);
		expect(screen.getByRole("button", { name: REFRESH })).not.toHaveClass(
			/loading/
		);
	} finally {
		vi.useRealTimers();
	}
});

test("a routine read in flight when refresh is clicked is discarded: the wait stays, a second click is a no-op, one fresh read fires", async () => {
	vi.useFakeTimers({ shouldAdvanceTime: true });
	try {
		renderCard();
		await vi.advanceTimersByTimeAsync(0);
		fireEvent.click(screen.getByRole("button", { name: REFRESH }));
		await vi.advanceTimersByTimeAsync(1000);
		expect(freshCalls()).toHaveLength(1);
		const routine = pendingPosition();
		document.dispatchEvent(new Event("visibilitychange"));
		await vi.advanceTimersByTimeAsync(0);
		fireEvent.click(screen.getByRole("button", { name: REFRESH }));
		await vi.advanceTimersByTimeAsync(0);
		routine.resolve("unlocked");
		await vi.advanceTimersByTimeAsync(0);
		expect(screen.getByRole("button", { name: REFRESH })).toHaveClass(
			/loading/
		);
		fireEvent.click(screen.getByRole("button", { name: REFRESH }));
		await vi.advanceTimersByTimeAsync(3000);
		expect(freshCalls()).toHaveLength(1);
		await vi.advanceTimersByTimeAsync(1500);
		expect(freshCalls()).toHaveLength(2);
		await vi.advanceTimersByTimeAsync(10_000);
		expect(freshCalls()).toHaveLength(2);
	} finally {
		vi.useRealTimers();
	}
});

test("starting an action clears a scheduled refresh: its timer fires nothing", async () => {
	vi.useFakeTimers({ shouldAdvanceTime: true });
	try {
		positionAsync.mockResolvedValue("unlocked");
		setAttempt(LOCK_ATTEMPT, attemptRow("actuated", 60_000));
		renderCard();
		await vi.advanceTimersByTimeAsync(0);
		fireEvent.click(screen.getByRole("button", { name: REFRESH }));
		await vi.advanceTimersByTimeAsync(1000);
		fireEvent.click(screen.getByRole("button", { name: REFRESH }));
		await vi.advanceTimersByTimeAsync(0);
		fireEvent.click(
			screen.getByRole("button", { name: "Lock Upstairs (4th floor)" })
		);
		await vi.advanceTimersByTimeAsync(0);
		const before = freshCalls().length;
		await vi.advanceTimersByTimeAsync(10_000);
		expect(freshCalls()).toHaveLength(before);
	} finally {
		vi.useRealTimers();
	}
});

test("a refresh more than 5s after the last fresh request sends at once", async () => {
	vi.useFakeTimers({ shouldAdvanceTime: true });
	try {
		renderCard();
		await vi.advanceTimersByTimeAsync(0);
		fireEvent.click(screen.getByRole("button", { name: REFRESH }));
		await vi.advanceTimersByTimeAsync(5001);
		expect(freshCalls()).toHaveLength(1);
		fireEvent.click(screen.getByRole("button", { name: REFRESH }));
		await vi.advanceTimersByTimeAsync(0);
		expect(freshCalls()).toHaveLength(2);
	} finally {
		vi.useRealTimers();
	}
});

test("unmounting with a scheduled refresh fires no request afterwards", async () => {
	vi.useFakeTimers({ shouldAdvanceTime: true });
	try {
		renderCard();
		await vi.advanceTimersByTimeAsync(0);
		fireEvent.click(screen.getByRole("button", { name: REFRESH }));
		await vi.advanceTimersByTimeAsync(1000);
		fireEvent.click(screen.getByRole("button", { name: REFRESH }));
		await vi.advanceTimersByTimeAsync(0);
		cleanup();
		positionAsync.mockClear();
		await vi.advanceTimersByTimeAsync(10_000);
		expect(positionAsync).not.toHaveBeenCalled();
	} finally {
		vi.useRealTimers();
	}
});

test("after an upstairs unlock's hold ends it re-reads fresh, and an unlocked door shows the Lock button", async () => {
	vi.useFakeTimers({ shouldAdvanceTime: true });
	try {
		renderCard();
		const unlockButton = await screen.findByRole("button", {
			name: "Unlock Upstairs (4th floor)",
		});
		positionAsync.mockClear();
		positionAsync.mockResolvedValue("unlocked");
		fireEvent.click(unlockButton);
		await vi.advanceTimersByTimeAsync(0);
		expect(screen.getByText("Door is unlocking")).toBeInTheDocument();
		expect(positionAsync).not.toHaveBeenCalled();
		await vi.advanceTimersByTimeAsync(5000);
		expect(positionAsync).toHaveBeenCalledWith({
			lock: "upstairs",
			fresh: true,
		});
		expect(
			await screen.findByRole("button", {
				name: "Lock Upstairs (4th floor)",
			})
		).toBeInTheDocument();
	} finally {
		vi.useRealTimers();
	}
});

test("a poll or visibility read during an upstairs action's hold sends no routine read", async () => {
	vi.useFakeTimers({ shouldAdvanceTime: true });
	try {
		setAttempt(
			UNLOCK_ATTEMPT,
			attemptRow("actuated", POSITION_POLL_MS * 2)
		);
		renderCard();
		const unlockButton = await screen.findByRole("button", {
			name: "Unlock Upstairs (4th floor)",
		});
		fireEvent.click(unlockButton);
		await vi.advanceTimersByTimeAsync(0);
		expect(screen.getByText("Door is unlocking")).toBeInTheDocument();
		positionAsync.mockClear();
		await vi.advanceTimersByTimeAsync(POSITION_POLL_MS);
		document.dispatchEvent(new Event("visibilitychange"));
		await vi.advanceTimersByTimeAsync(0);
		expect(positionAsync).not.toHaveBeenCalledWith({ lock: "upstairs" });
	} finally {
		vi.useRealTimers();
	}
});

test("a downstairs action ending never reads a position", async () => {
	vi.useFakeTimers({ shouldAdvanceTime: true });
	try {
		renderCard();
		await vi.advanceTimersByTimeAsync(0);
		positionAsync.mockClear();
		fireEvent.click(
			screen.getByRole("button", { name: "Unlock Downstairs" })
		);
		await vi.advanceTimersByTimeAsync(6000);
		expect(positionAsync).not.toHaveBeenCalled();
	} finally {
		vi.useRealTimers();
	}
});

test("polls the position again every 30s while the page is visible", async () => {
	vi.useFakeTimers({ shouldAdvanceTime: true });
	try {
		renderCard();
		await vi.advanceTimersByTimeAsync(0);
		expect(positionAsync).toHaveBeenCalledTimes(1);
		await vi.advanceTimersByTimeAsync(POSITION_POLL_MS);
		expect(positionAsync).toHaveBeenCalledTimes(2);
	} finally {
		vi.useRealTimers();
	}
});

test("does not poll while the page is hidden, and reads again when it becomes visible", async () => {
	vi.useFakeTimers({ shouldAdvanceTime: true });
	const visibility = vi
		.spyOn(document, "visibilityState", "get")
		.mockReturnValue("hidden");
	try {
		renderCard();
		await vi.advanceTimersByTimeAsync(0);
		positionAsync.mockClear();
		await vi.advanceTimersByTimeAsync(POSITION_POLL_MS * 2);
		expect(positionAsync).not.toHaveBeenCalled();
		visibility.mockReturnValue("visible");
		document.dispatchEvent(new Event("visibilitychange"));
		await vi.advanceTimersByTimeAsync(0);
		expect(positionAsync).toHaveBeenCalledTimes(1);
	} finally {
		visibility.mockRestore();
		vi.useRealTimers();
	}
});

test("stops polling once the card is unmounted", async () => {
	vi.useFakeTimers({ shouldAdvanceTime: true });
	try {
		renderCard();
		await vi.advanceTimersByTimeAsync(0);
		cleanup();
		positionAsync.mockClear();
		await vi.advanceTimersByTimeAsync(POSITION_POLL_MS * 2);
		expect(positionAsync).not.toHaveBeenCalled();
	} finally {
		vi.useRealTimers();
	}
});

test("an older read that resolves after a newer one is discarded", async () => {
	const older = pendingPosition();
	renderCard();
	await waitFor(() => {
		expect(positionAsync).toHaveBeenCalledTimes(1);
	});
	positionAsync.mockResolvedValueOnce("locked");
	document.dispatchEvent(new Event("visibilitychange"));
	await waitFor(() => {
		expect(positionAsync).toHaveBeenCalledTimes(2);
	});
	await settle();
	older.resolve("unlocked");
	await settle();
	expect(
		screen.queryByRole("button", { name: "Lock Upstairs (4th floor)" })
	).not.toBeInTheDocument();
	expect(
		screen.getByRole("button", { name: "Unlock Upstairs (4th floor)" })
	).toBeInTheDocument();
});

test("a routine read issued before a re-check cannot overwrite the re-check's result", async () => {
	positionAsync.mockResolvedValue("unlocked");
	renderCard();
	await screen.findByRole("button", { name: "Lock Upstairs (4th floor)" });
	const refresh = screen.getByRole("button", { name: REFRESH });
	const routine = pendingPosition();
	document.dispatchEvent(new Event("visibilitychange"));
	await waitFor(() => {
		expect(positionAsync).toHaveBeenCalledTimes(2);
	});
	const recheck = pendingPosition();
	fireEvent.click(refresh);
	await waitFor(() => {
		expect(positionAsync).toHaveBeenCalledTimes(3);
	});
	recheck.resolve("locked");
	expect(
		await screen.findByRole("button", {
			name: "Unlock Upstairs (4th floor)",
		})
	).toBeInTheDocument();
	routine.resolve("unlocked");
	await settle();
	expect(
		screen.queryByRole("button", { name: "Lock Upstairs (4th floor)" })
	).not.toBeInTheDocument();
	expect(
		screen.getByRole("button", { name: "Unlock Upstairs (4th floor)" })
	).toBeInTheDocument();
});

test("no tabs: Upstairs on top, the route row, then Downstairs, each button naming its action and door", async () => {
	renderCard();
	expect(screen.queryByRole("tab")).not.toBeInTheDocument();
	const upstairs = await screen.findByRole("button", {
		name: "Unlock Upstairs (4th floor)",
	});
	const downstairs = screen.getByRole("button", {
		name: "Unlock Downstairs",
	});
	expect(upstairs).toHaveTextContent(
		"lock_open_rightUnlock Upstairs (4th floor)"
	);
	expect(downstairs).toHaveTextContent("lock_open_rightUnlock Downstairs");
	const card = upstairs.closest("section");
	expect(card).toHaveTextContent(
		/Unlock Upstairs \(4th floor\)stairsorelevatorlock_open_rightUnlock Downstairs/
	);
});

test("an unlocked upstairs door shows the Lock button, which locks through lockDoor", async () => {
	positionAsync.mockResolvedValue("unlocked");
	renderCard();
	const lockButton = await screen.findByRole("button", {
		name: "Lock Upstairs (4th floor)",
	});
	expect(lockButton).toHaveTextContent("lockLock Upstairs (4th floor)");
	expect(
		screen.queryByRole("button", { name: "Unlock Upstairs (4th floor)" })
	).not.toBeInTheDocument();
	fireEvent.click(lockButton);
	await waitFor(() => {
		expect(lockAsync).toHaveBeenCalledWith({
			lock: "upstairs",
			presence: "tok",
		});
	});
	expect(mutateAsync).not.toHaveBeenCalled();
	expect(await screen.findByText("Door is locking")).toBeInTheDocument();
	for (const [args] of positionAsync.mock.calls)
		expect(args).toMatchObject({ lock: "upstairs" });
});

test("downstairs never offers Lock and shows no lock note", async () => {
	positionAsync.mockResolvedValue("unknown");
	renderCard();
	await screen.findByText("Upstairs (4th floor)", { selector: "p" });
	expect(
		screen.queryByRole("button", { name: /Lock Downstairs/ })
	).not.toBeInTheDocument();
	expect(
		screen.queryByText("The street door locks by itself.")
	).not.toBeInTheDocument();
});

test.each([
	["unknown", () => positionAsync.mockResolvedValue("unknown")],
	["a failed read", () => positionAsync.mockRejectedValue(new Error("boom"))],
] as const)(
	"%s shows the door heading and both actions side by side, with no error",
	async (_label, arrange) => {
		arrange();
		renderCard();
		expect(
			await screen.findByText("Upstairs (4th floor)", { selector: "p" })
		).toBeInTheDocument();
		const unlockButton = screen.getByRole("button", {
			name: "Unlock Upstairs (4th floor)",
		});
		const lockButton = screen.getByRole("button", {
			name: "Lock Upstairs (4th floor)",
		});
		expect(unlockButton).toHaveTextContent("lock_open_rightUnlock");
		expect(lockButton).toHaveTextContent("lockLock");
		expect(screen.queryByRole("alert")).not.toBeInTheDocument();
		expect(screen.queryByText("boom")).not.toBeInTheDocument();
	}
);

test("an offline reading shows the offline text, not the buttons, until the lock is back", async () => {
	positionAsync.mockResolvedValue("offline");
	renderCard();
	expect(
		await screen.findByText(
			"Upstairs lock is offline — try again in a moment."
		)
	).toBeInTheDocument();
	expect(
		screen.queryByRole("button", { name: /Upstairs/ })
	).not.toBeInTheDocument();
	positionAsync.mockResolvedValue("locked");
	fireEvent.click(screen.getByRole("button", { name: REFRESH }));
	expect(
		await screen.findByRole("button", { name: /Unlock Upstairs/ })
	).toBeInTheDocument();
});

test("tapping one of the two side-by-side buttons replaces both with that action's status", async () => {
	positionAsync.mockResolvedValue("unknown");
	renderCard();
	fireEvent.click(
		await screen.findByRole("button", { name: "Lock Upstairs (4th floor)" })
	);
	expect(await screen.findByText("Door is locking")).toBeInTheDocument();
	expect(
		screen.queryByRole("button", { name: /Upstairs/ })
	).not.toBeInTheDocument();
	expect(
		screen.queryByText("Upstairs (4th floor)", { selector: "p" })
	).not.toBeInTheDocument();
});

test.each([
	["unlocking", "Door is unlocking"],
	["locking", "Door is locking"],
] as const)(
	"a bolt reading %s shows '%s' with no button, then re-reads fresh",
	async (position, text) => {
		vi.useFakeTimers({ shouldAdvanceTime: true });
		try {
			positionAsync.mockResolvedValueOnce(position);
			positionAsync.mockResolvedValue("locked");
			renderCard();
			expect(await screen.findByText(text)).toBeInTheDocument();
			expect(
				screen.queryByRole("button", { name: /Upstairs/ })
			).not.toBeInTheDocument();
			await vi.advanceTimersByTimeAsync(
				FRESH_MIN_AGE_MS - EARLY_MARGIN_MS
			);
			expect(positionAsync).not.toHaveBeenCalledWith({
				lock: "upstairs",
				fresh: true,
			});
			await vi.advanceTimersByTimeAsync(EARLY_MARGIN_MS);
			await waitFor(() => {
				expect(positionAsync).toHaveBeenCalledWith({
					lock: "upstairs",
					fresh: true,
				});
			});
			expect(
				await screen.findByRole("button", {
					name: "Unlock Upstairs (4th floor)",
				})
			).toBeInTheDocument();
		} finally {
			vi.useRealTimers();
		}
	}
);

test("before the first read lands upstairs reads 'Checking door…'", async () => {
	const pending = pendingPosition();
	renderCard();
	expect(await screen.findByText("Checking door…")).toBeInTheDocument();
	expect(
		screen.queryByRole("button", { name: /Upstairs/ })
	).not.toBeInTheDocument();
	pending.resolve("locked");
	expect(
		await screen.findByRole("button", {
			name: "Unlock Upstairs (4th floor)",
		})
	).toBeInTheDocument();
});

test("a refresh keeps the last button, still tappable, while it reads", async () => {
	positionAsync.mockResolvedValue("unlocked");
	renderCard();
	const lockButton = await screen.findByRole("button", {
		name: "Lock Upstairs (4th floor)",
	});
	pendingPosition();
	fireEvent.click(screen.getByRole("button", { name: REFRESH }));
	await waitFor(() => {
		expect(screen.getByRole("button", { name: REFRESH })).toHaveClass(
			/loading/
		);
	});
	expect(lockButton).toBeInTheDocument();
	expect(lockButton).not.toBeDisabled();
	expect(screen.queryByText("Checking door…")).not.toBeInTheDocument();
});

test("the refresh button sits in the card header and is disabled while the upstairs action runs", async () => {
	const pending: {
		resolve: (v: { status: "ok"; attemptId: string }) => void;
	} = { resolve() {} };
	mutateAsync.mockReturnValue(
		new Promise((resolve) => {
			pending.resolve = resolve;
		})
	);
	renderCard();
	const refresh = screen.getByRole("button", { name: REFRESH });
	expect(refresh.closest("header")).not.toBeNull();
	fireEvent.click(
		await screen.findByRole("button", {
			name: "Unlock Upstairs (4th floor)",
		})
	);
	await waitFor(() => {
		expect(screen.getByRole("button", { name: REFRESH })).toBeDisabled();
	});
	pending.resolve({ status: "ok", attemptId: UNLOCK_ATTEMPT });
});

test("an action on one door leaves the other door's button enabled", async () => {
	mutateAsync.mockReturnValue(new Promise(() => {}));
	renderCard();
	fireEvent.click(
		await screen.findByRole("button", {
			name: "Unlock Upstairs (4th floor)",
		})
	);
	expect(await screen.findByText("Sending…")).toBeInTheDocument();
	expect(
		screen.getByRole("button", { name: "Unlock Downstairs" })
	).not.toBeDisabled();
});

test("focus lands on the Lock button when an upstairs unlock's fresh read returns unlocked", async () => {
	vi.useFakeTimers({ shouldAdvanceTime: true });
	try {
		setAttempt(UNLOCK_ATTEMPT, attemptRow("actuated", 3000));
		renderCard();
		const unlockButton = await screen.findByRole("button", {
			name: "Unlock Upstairs (4th floor)",
		});
		unlockButton.focus();
		positionAsync.mockResolvedValue("unlocked");
		fireEvent.click(unlockButton);
		await screen.findByText("Door is unlocking");
		await vi.advanceTimersByTimeAsync(3000);
		const lockButton = await screen.findByRole("button", {
			name: "Lock Upstairs (4th floor)",
		});
		await waitFor(() => {
			expect(document.activeElement).toBe(lockButton);
		});
	} finally {
		vi.useRealTimers();
	}
});

test("once focus has returned to the slot, a later view change never pulls it back from elsewhere", async () => {
	vi.useFakeTimers({ shouldAdvanceTime: true });
	try {
		setAttempt(UNLOCK_ATTEMPT, attemptRow("actuated", 3000));
		renderCard();
		const unlockButton = await screen.findByRole("button", {
			name: "Unlock Upstairs (4th floor)",
		});
		unlockButton.focus();
		positionAsync.mockResolvedValue("unlocked");
		fireEvent.click(unlockButton);
		await screen.findByText("Door is unlocking");
		await vi.advanceTimersByTimeAsync(3000);
		const lockButton = await screen.findByRole("button", {
			name: "Lock Upstairs (4th floor)",
		});
		await waitFor(() => {
			expect(document.activeElement).toBe(lockButton);
		});
		lockButton.blur();
		expect(document.activeElement).toBe(document.body);
		positionAsync.mockResolvedValue("unknown");
		document.dispatchEvent(new Event("visibilitychange"));
		await vi.advanceTimersByTimeAsync(0);
		await screen.findByRole("button", {
			name: "Unlock Upstairs (4th floor)",
		});
		expect(document.activeElement).toBe(document.body);
	} finally {
		vi.useRealTimers();
	}
});

test("the first read landing never takes focus", async () => {
	renderCard();
	await screen.findByRole("button", { name: "Unlock Upstairs (4th floor)" });
	expect(document.activeElement).toBe(document.body);
});

test("the visibilitychange listener is removed on unmount", async () => {
	const remove = vi.spyOn(document, "removeEventListener");
	try {
		renderCard();
		await settle();
		cleanup();
		expect(remove).toHaveBeenCalledWith(
			"visibilitychange",
			expect.any(Function)
		);
		positionAsync.mockClear();
		document.dispatchEvent(new Event("visibilitychange"));
		await settle();
		expect(positionAsync).not.toHaveBeenCalled();
	} finally {
		remove.mockRestore();
	}
});

test("while the action is in flight the slot reads 'Sending…' with no button", async () => {
	mutateAsync.mockReturnValue(new Promise(() => {}));
	renderCard();
	fireEvent.click(screen.getByRole("button", { name: "Unlock Downstairs" }));
	expect(await screen.findByText("Sending…")).toBeInTheDocument();
	expect(
		screen.queryByRole("button", { name: "Unlock Downstairs" })
	).not.toBeInTheDocument();
});

test("once the server accepts, the slot reads 'Waking the door…' while the attempt loads and while it is accepted", async () => {
	vi.useFakeTimers({ shouldAdvanceTime: true });
	try {
		mutateAsync.mockResolvedValue({
			status: "ok",
			attemptId: "attempt-loading",
		});
		renderCard();
		fireEvent.click(
			screen.getByRole("button", { name: "Unlock Downstairs" })
		);
		expect(await screen.findByText("Waking the door…")).toBeInTheDocument();
		setAttempt("attempt-loading", attemptRow("accepted", 3000));
		await vi.advanceTimersByTimeAsync(10_000);
		expect(screen.getByText("Waking the door…")).toBeInTheDocument();
		expect(
			screen.queryByRole("button", { name: "Unlock Downstairs" })
		).not.toBeInTheDocument();
	} finally {
		vi.useRealTimers();
	}
});

test("the countdown runs on the phone's clock: a server actuatedAt a minute off still counts the full durationMs", async () => {
	setAttempt(UNLOCK_ATTEMPT, {
		actuation: "actuated",
		durationMs: 3000,
		requestedAt: NOW - 60_000,
		actuatedAt: NOW - 58_000,
	});
	renderCard();
	fireEvent.click(screen.getByRole("button", { name: "Unlock Downstairs" }));
	expect(await screen.findByText("Open — push now (3s)")).toBeInTheDocument();
});

test("a door that never responds says so as a warning, and the button returns after 5s", async () => {
	vi.useFakeTimers({ shouldAdvanceTime: true });
	try {
		setAttempt(UNLOCK_ATTEMPT, attemptRow("unconfirmed"));
		renderCard();
		fireEvent.click(
			screen.getByRole("button", { name: "Unlock Downstairs" })
		);
		const text = await screen.findByText(
			"Downstairs door didn't respond — try again."
		);
		expect(text.className).toMatch(/statusWarning/);
		vi.advanceTimersByTime(5000);
		await waitFor(() => {
			expect(
				screen.getByRole("button", { name: "Unlock Downstairs" })
			).toBeInTheDocument();
		});
	} finally {
		vi.useRealTimers();
	}
});

test.each([
	[
		"the attempt row was not written",
		() => {
			mutateAsync.mockResolvedValue({ status: "ok", attemptId: null });
		},
	],
	[
		"the attempt query has nothing",
		() => {
			setAttempt(UNLOCK_ATTEMPT, null);
		},
	],
] as const)(
	"when %s the provider still took the command, so the slot says so without a warning, then the button returns after 5s",
	async (_label, arrange) => {
		vi.useFakeTimers({ shouldAdvanceTime: true });
		try {
			arrange();
			renderCard();
			fireEvent.click(
				screen.getByRole("button", { name: "Unlock Downstairs" })
			);
			const text = await screen.findByText(
				"Sent — the door should open shortly."
			);
			expect(text.className).not.toMatch(/statusWarning|statusError/);
			expect(
				screen.queryByText("Couldn't open the door.")
			).not.toBeInTheDocument();
			vi.advanceTimersByTime(5000);
			await waitFor(() => {
				expect(
					screen.getByRole("button", { name: "Unlock Downstairs" })
				).toBeInTheDocument();
			});
		} finally {
			vi.useRealTimers();
		}
	}
);

test("a lock whose attempt row was not written says the door should lock shortly", async () => {
	positionAsync.mockResolvedValue("unlocked");
	lockAsync.mockResolvedValue({ status: "ok", attemptId: null });
	renderCard();
	fireEvent.click(
		await screen.findByRole("button", {
			name: "Lock Upstairs (4th floor)",
		})
	);
	const text = await screen.findByText(
		"Sent — the door should lock shortly."
	);
	expect(text.className).not.toMatch(/statusWarning|statusError/);
});

test("a second tap follows its own attempt, never the last one's outcome", async () => {
	vi.useFakeTimers({ shouldAdvanceTime: true });
	try {
		setAttempt(UNLOCK_ATTEMPT, attemptRow("actuated", 3000));
		renderCard();
		fireEvent.click(
			screen.getByRole("button", { name: "Unlock Downstairs" })
		);
		expect(
			await screen.findByText("Open — push now (3s)")
		).toBeInTheDocument();
		await vi.advanceTimersByTimeAsync(3000);
		mutateAsync.mockResolvedValue({
			status: "ok",
			attemptId: "attempt-second",
		});
		fireEvent.click(
			await screen.findByRole("button", { name: "Unlock Downstairs" })
		);
		expect(await screen.findByText("Waking the door…")).toBeInTheDocument();
		await vi.advanceTimersByTimeAsync(5000);
		expect(screen.getByText("Waking the door…")).toBeInTheDocument();
	} finally {
		vi.useRealTimers();
	}
});

test("unmounting while the action is in flight leaves no timer and never follows its attempt", async () => {
	vi.useFakeTimers({ shouldAdvanceTime: true });
	try {
		const pending: {
			resolve: (v: { status: "ok"; attemptId: string }) => void;
		} = { resolve() {} };
		mutateAsync.mockReturnValue(
			new Promise((resolve) => {
				pending.resolve = resolve;
			})
		);
		renderCard();
		fireEvent.click(
			screen.getByRole("button", { name: "Unlock Downstairs" })
		);
		await screen.findByText("Sending…");
		cleanup();
		pending.resolve({ status: "ok", attemptId: UNLOCK_ATTEMPT });
		await vi.advanceTimersByTimeAsync(0);
		expect(liveAttemptQueries.count).toBe(0);
		expect(vi.getTimerCount()).toBe(0);
	} finally {
		vi.useRealTimers();
	}
});

test("unmounting while waking the door closes its attempt: a later reaction starts no countdown", async () => {
	vi.useFakeTimers({ shouldAdvanceTime: true });
	try {
		setAttempt(UNLOCK_ATTEMPT, attemptRow("accepted", 3000));
		renderCard();
		fireEvent.click(
			screen.getByRole("button", { name: "Unlock Downstairs" })
		);
		await screen.findByText("Waking the door…");
		expect(liveAttemptQueries.count).toBe(1);
		cleanup();
		expect(liveAttemptQueries.count).toBe(0);
		setAttempt(UNLOCK_ATTEMPT, attemptRow("actuated", 3000));
		await vi.advanceTimersByTimeAsync(0);
		expect(vi.getTimerCount()).toBe(0);
	} finally {
		vi.useRealTimers();
	}
});
