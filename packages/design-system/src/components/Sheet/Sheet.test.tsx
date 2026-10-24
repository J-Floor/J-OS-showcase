import { readFileSync } from "node:fs";

import { render, screen, fireEvent, waitFor } from "@solidjs/testing-library";
import { type JSX, createSignal } from "solid-js";
import {
	afterEach,
	describe,
	expect,
	it,
	onTestFinished,
	test,
	vi,
} from "vitest";

import {
	fakeViewTransitions,
	mockLayoutBoxes,
	namedIds,
	restoreViewTransitions,
	transitionSettled,
} from "../../test/viewTransitionFakes.ts";
import { trackActivation } from "../../utils/activation.ts";
import { defineFields } from "../../utils/fields.ts";
import { MORPH_SCRIM } from "../../utils/morph.ts";
import { MORPH_TITLE, SHEET_SKELETON } from "../../utils/morphPairing.ts";
import { MORPH_HIDDEN } from "../../utils/morphPresence.ts";
import { setDeferredImmediate } from "../Deferred/Deferred.tsx";
import { PropertyRow } from "../PropertyRow/PropertyRow.tsx";

import { SHEET_SKELETON_ROW, Sheet } from "./Sheet.tsx";

function stubViewTransition(onSnapshot?: () => void): void {
	mockLayoutBoxes();
	fakeViewTransitions({ sync: true, onSnapshot });
}

/** The tags of the marked titles that hold a transition name. */
function namedTitleTags(): string[] {
	return [...document.querySelectorAll<HTMLElement>("[data-morph-title]")]
		.filter((element) =>
			element.style.getPropertyValue("view-transition-name")
		)
		.map((element) => element.tagName);
}

/** Records which entity elements hold a name at each new snapshot. */
function recordEntityNames(): string[] {
	const names: string[] = [];
	stubViewTransition(() => names.push(...namedIds("[data-morph-of]")));
	return names;
}

/** jsdom loads no stylesheet: a morph source paints its background inline. */
function fill(element: HTMLElement): void {
	element.style.setProperty("background-color", "rgb(0, 0, 0)");
}

async function openFromButton(morph: false | undefined): Promise<{
	opener: HTMLElement | null;
}> {
	const uninstall = trackActivation();
	onTestFinished(uninstall);
	stubViewTransition();
	const [open, setOpen] = createSignal(false);
	render(() => (
		<>
			{/* Filled: a container, which the sheet takes the place of. */}
			<button id="opener" ref={fill}>
				Open
			</button>
			<Sheet.Root open={open()} onOpenChange={setOpen} morph={morph}>
				<Sheet.Header>
					<Sheet.Title>Task</Sheet.Title>
				</Sheet.Header>
				<Sheet.Body>body</Sheet.Body>
			</Sheet.Root>
		</>
	));
	// Let the shut-at-mount gate settle so the open below is a real change.
	await new Promise((resolve) => setTimeout(resolve, 5));
	const opener = document.getElementById("opener");
	opener?.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }));
	setOpen(true);
	return { opener };
}

// Only what this compound adds is worth asserting — Ark's dialog machine (open
// state, focus trap, Escape) is Ark's own coverage. Here: the parts render where
// they should, and the Close part is wired to Ark's close trigger.
describe("Sheet", () => {
	it("renders title, body and footer parts when open", () => {
		render(() => (
			<Sheet.Root open={true} onOpenChange={() => {}}>
				<Sheet.Header>
					<Sheet.Title>Details</Sheet.Title>
					<Sheet.HeaderActions>
						<Sheet.Close />
					</Sheet.HeaderActions>
				</Sheet.Header>
				<Sheet.Body>
					<p>Body content</p>
				</Sheet.Body>
				<Sheet.Footer>
					<span>FOOT</span>
				</Sheet.Footer>
			</Sheet.Root>
		));
		expect(screen.getByText("Details")).toBeInTheDocument();
		expect(screen.getByText("Body content")).toBeInTheDocument();
		expect(screen.getByText("FOOT")).toBeInTheDocument();
	});

	it("Sheet.Close activates Ark's close trigger", async () => {
		const onOpenChange = vi.fn();
		render(() => (
			<Sheet.Root open={true} onOpenChange={onOpenChange}>
				<Sheet.Header>
					<Sheet.Title>Details</Sheet.Title>
					<Sheet.HeaderActions>
						<Sheet.Close />
					</Sheet.HeaderActions>
				</Sheet.Header>
				<Sheet.Body>
					<p>Body</p>
				</Sheet.Body>
			</Sheet.Root>
		));
		fireEvent.click(screen.getByRole("button", { name: /close/i }));
		await waitFor(() => {
			expect(onOpenChange).toHaveBeenCalledWith(false);
		});
	});

	test("Body with loading shows the skeleton, not children", () => {
		render(() => (
			<Sheet.Root open onOpenChange={() => {}}>
				<Sheet.Header>
					<Sheet.Title>T</Sheet.Title>
				</Sheet.Header>
				<Sheet.Body loading>
					<p>fields</p>
				</Sheet.Body>
			</Sheet.Root>
		));
		expect(screen.queryByText("fields")).toBeNull();
		expect(
			document.querySelectorAll(`[${SHEET_SKELETON_ROW}]`)
		).toHaveLength(6);
		expect(
			document.querySelector(`[${SHEET_SKELETON}]`)
		).toBeInTheDocument();
	});

	test("a Sheet.Skeleton shows its placeholder shape while loading, not the generic bars or children", () => {
		render(() => (
			<Sheet.Root open onOpenChange={() => {}}>
				<Sheet.Header>
					<Sheet.Title>T</Sheet.Title>
				</Sheet.Header>
				<Sheet.Skeleton>
					<p>placeholder shape</p>
				</Sheet.Skeleton>
				<Sheet.Body loading>
					<p>real fields</p>
				</Sheet.Body>
			</Sheet.Root>
		));
		expect(screen.queryByText("real fields")).toBeNull();
		// jsdom has no layout, so the measured Skeleton falls back to
		// rendering its (hidden-in-a-browser) children as-is — assert the
		// container plus the placeholder content, per Skeleton's own test.
		expect(
			document.querySelector("[data-shimmer-container]")
		).toBeInTheDocument();
		expect(screen.getByText("placeholder shape")).toBeInTheDocument();
		expect(
			document.querySelector(`[${SHEET_SKELETON}]`)
		).toBeInTheDocument();
		expect(
			document.querySelectorAll(`[${SHEET_SKELETON_ROW}]`)
		).toHaveLength(0);
	});

	test("a Sheet.Skeleton goes once the body has loaded", () => {
		const [loading, setLoading] = createSignal(true);
		render(() => (
			<Sheet.Root open onOpenChange={() => {}}>
				<Sheet.Skeleton>
					<p>placeholder shape</p>
				</Sheet.Skeleton>
				<Sheet.Body loading={loading()}>
					<p>real fields</p>
				</Sheet.Body>
			</Sheet.Root>
		));
		expect(screen.getByText("placeholder shape")).toBeInTheDocument();
		setLoading(false);
		expect(screen.queryByText("placeholder shape")).toBeNull();
		expect(
			document.querySelector(`[${SHEET_SKELETON}]`)
		).not.toBeInTheDocument();
		expect(screen.getByText("real fields")).toBeInTheDocument();
	});

	test("a Sheet.Skeleton's placeholder is built once", () => {
		const built = vi.fn();
		function Placeholder(): JSX.Element {
			built();
			return <p>placeholder shape</p>;
		}
		render(() => (
			<Sheet.Root open onOpenChange={() => {}}>
				<Sheet.Skeleton>
					<Placeholder />
				</Sheet.Skeleton>
				<Sheet.Body loading>
					<p>real fields</p>
				</Sheet.Body>
			</Sheet.Root>
		));
		expect(screen.getByText("placeholder shape")).toBeInTheDocument();
		expect(built).toHaveBeenCalledTimes(1);
	});

	test("a Sheet.Skeleton placed after the body still replaces the generic bars", () => {
		render(() => (
			<Sheet.Root open onOpenChange={() => {}}>
				<Sheet.Body loading>
					<p>real fields</p>
				</Sheet.Body>
				<Sheet.Skeleton>
					<p>placeholder shape</p>
				</Sheet.Skeleton>
			</Sheet.Root>
		));
		expect(screen.getByText("placeholder shape")).toBeInTheDocument();
		expect(
			document.querySelectorAll(`[${SHEET_SKELETON_ROW}]`)
		).toHaveLength(0);
	});

	test("a second Sheet.Skeleton is refused", () => {
		expect(() =>
			render(() => (
				<Sheet.Root open onOpenChange={() => {}}>
					<Sheet.Skeleton>
						<p>one</p>
					</Sheet.Skeleton>
					<Sheet.Skeleton>
						<p>two</p>
					</Sheet.Skeleton>
					<Sheet.Body loading>
						<p>real fields</p>
					</Sheet.Body>
				</Sheet.Root>
			))
		).toThrow("one Sheet.Skeleton");
	});

	test("classOverride restyles the backdrop, positioner and content", () => {
		render(() => (
			<Sheet.Root
				open
				onOpenChange={() => {}}
				classOverride={{
					backdropClass: "my-backdrop",
					positionerClass: "my-positioner",
					contentClass: "my-content",
				}}
			>
				<Sheet.Body>body</Sheet.Body>
			</Sheet.Root>
		));
		for (const [part, name] of [
			["backdrop", "my-backdrop"],
			["positioner", "my-positioner"],
			["content", "my-content"],
		]) {
			expect(
				document.querySelector(
					`[data-scope="dialog"][data-part="${part}"]`
				)
			).toHaveClass(name);
		}
	});

	test("Title with loading shows a shimmer, not the text", () => {
		render(() => (
			<Sheet.Root open onOpenChange={() => {}}>
				<Sheet.Header>
					<Sheet.Title loading>Name</Sheet.Title>
				</Sheet.Header>
				<Sheet.Body>
					<p>fields</p>
				</Sheet.Body>
			</Sheet.Root>
		));
		expect(screen.queryByText("Name")).toBeNull();
	});

	test("a loading Title is no morph title (nothing flies into a shimmer); a loaded one is", () => {
		const [isLoading, setLoading] = createSignal(true);
		render(() => (
			<Sheet.Root open onOpenChange={() => {}}>
				<Sheet.Header>
					<Sheet.Title loading={isLoading()}>Name</Sheet.Title>
				</Sheet.Header>
				<Sheet.Body>
					<p>fields</p>
				</Sheet.Body>
			</Sheet.Root>
		));
		expect(document.querySelector(`[${MORPH_TITLE}]`)).toBeNull();
		setLoading(false);
		expect(document.querySelector(`[${MORPH_TITLE}]`)).toHaveTextContent(
			"Name"
		);
	});

	test("Title loading still gives the dialog an accessible name", () => {
		render(() => (
			<Sheet.Root open onOpenChange={() => {}}>
				<Sheet.Header>
					<Sheet.Title loading>Name</Sheet.Title>
				</Sheet.Header>
				<Sheet.Body>
					<p>fields</p>
				</Sheet.Body>
			</Sheet.Root>
		));
		expect(
			screen.getByRole("dialog", { name: "Loading" })
		).toBeInTheDocument();
	});

	test("Body paints the skeleton first, then the children", async () => {
		setDeferredImmediate(false);
		vi.useFakeTimers();
		try {
			render(() => (
				<Sheet.Root open onOpenChange={() => {}}>
					<Sheet.Header>
						<Sheet.Title>T</Sheet.Title>
					</Sheet.Header>
					<Sheet.Body>
						<p>fields</p>
					</Sheet.Body>
				</Sheet.Root>
			));
			expect(screen.queryByText("fields")).toBeNull();
			await vi.runAllTimersAsync();
			expect(screen.getByText("fields")).toBeInTheDocument();
		} finally {
			vi.useRealTimers();
			setDeferredImmediate(true);
		}
	});

	test("initialFocusEl inside a deferred body receives focus once it mounts", async () => {
		setDeferredImmediate(false);
		vi.useFakeTimers();
		let input: HTMLInputElement | undefined;
		try {
			render(() => (
				<Sheet.Root
					open
					onOpenChange={() => {}}
					initialFocusEl={() => input ?? null}
				>
					<Sheet.Header>
						<Sheet.Title>T</Sheet.Title>
					</Sheet.Header>
					<Sheet.Body>
						<input
							ref={(element) => (input = element)}
							aria-label="title"
						/>
					</Sheet.Body>
				</Sheet.Root>
			));
			await vi.runAllTimersAsync();
			expect(document.activeElement).toBe(input);
		} finally {
			vi.useRealTimers();
			setDeferredImmediate(true);
		}
	});

	describe("morph", () => {
		afterEach(() => {
			restoreViewTransitions();
		});

		test("closes into the on-screen element for its entity when the source is gone", async () => {
			const names = recordEntityNames();
			const [open, setOpen] = createSignal(true);
			render(() => (
				<>
					<div id="row" data-morph-of="t1" />
					<Sheet.Root
						open={open()}
						onOpenChange={setOpen}
						morph={"t1"}
					>
						<Sheet.Header>
							<Sheet.Title>Task</Sheet.Title>
						</Sheet.Header>
						<Sheet.Body>body</Sheet.Body>
					</Sheet.Root>
				</>
			));
			setOpen(false);
			await vi.waitFor(() => {
				expect(names).toEqual(["row"]);
			});
		});

		test("stepping to another entity releases the source; close goes to the new one", async () => {
			const names = recordEntityNames();
			const uninstall = trackActivation();
			onTestFinished(uninstall);
			const [open, setOpen] = createSignal(false);
			const [entity, setEntity] = createSignal("a");
			render(() => (
				<>
					<div id="row-a" role="row" data-morph-of="a" />
					<div id="row-b" role="row" data-morph-of="b" />
					<Sheet.Root
						open={open()}
						onOpenChange={setOpen}
						morph={entity()}
					>
						<Sheet.Header>
							<Sheet.Title>Task</Sheet.Title>
						</Sheet.Header>
						<Sheet.Body>body</Sheet.Body>
					</Sheet.Root>
				</>
			));
			await new Promise((resolve) => setTimeout(resolve, 5));
			const rowA = document.getElementById("row-a");
			rowA?.dispatchEvent(
				new PointerEvent("pointerdown", { bubbles: true })
			);
			setOpen(true);
			await transitionSettled();
			expect(rowA).toHaveAttribute(MORPH_HIDDEN);
			setEntity("b");
			expect(rowA).not.toHaveAttribute(MORPH_HIDDEN);
			names.length = 0;
			setOpen(false);
			await vi.waitFor(() => {
				expect(names).toEqual(["row-b"]);
			});
			expect(rowA).not.toHaveAttribute(MORPH_HIDDEN);
		});

		test("opening and naming the entity in one flush still hides the source", async () => {
			stubViewTransition();
			const uninstall = trackActivation();
			onTestFinished(uninstall);
			const [selected, setSelected] = createSignal<string>();
			render(() => (
				<>
					<div id="row-b" role="row" data-morph-of="b" />
					<Sheet.Root
						open={selected() !== undefined}
						onOpenChange={() => {
							setSelected(undefined);
						}}
						morph={selected()}
					>
						<Sheet.Header>
							<Sheet.Title>Task</Sheet.Title>
						</Sheet.Header>
						<Sheet.Body>body</Sheet.Body>
					</Sheet.Root>
				</>
			));
			await new Promise((resolve) => setTimeout(resolve, 5));
			const row = document.getElementById("row-b");
			row?.dispatchEvent(
				new PointerEvent("pointerdown", { bubbles: true })
			);
			setSelected("b");
			await transitionSettled();
			expect(row).toHaveAttribute(MORPH_HIDDEN);
		});

		test("closing flies the sheet's title into the row's title", async () => {
			mockLayoutBoxes();
			const seen = { old: [] as string[][], new: [] as string[][] };
			fakeViewTransitions({
				sync: true,
				onStart: () => seen.old.push(namedTitleTags()),
				onSnapshot: () => seen.new.push(namedTitleTags()),
			});
			const [open, setOpen] = createSignal(true);
			render(() => (
				<>
					<div id="row" data-morph-of="t1">
						<span data-morph-title="">Task</span>
					</div>
					<Sheet.Root
						open={open()}
						onOpenChange={setOpen}
						morph={"t1"}
					>
						<Sheet.Header>
							<Sheet.Title>Task</Sheet.Title>
						</Sheet.Header>
						<Sheet.Body>body</Sheet.Body>
					</Sheet.Root>
				</>
			));
			setOpen(false);
			await transitionSettled();
			expect(seen.old).toEqual([["H2"]]);
			expect(seen.new).toEqual([["SPAN"]]);
		});

		test("a first open over the skeleton names nothing inside it, and the surface still morphs; real fields pair", async () => {
			const fields = defineFields({ status: { label: "Status" } });
			mockLayoutBoxes();
			const seen: { names: string[]; kinds: string }[] = [];
			function record(): void {
				seen.push({
					names: [...document.querySelectorAll<HTMLElement>("*")]
						.filter((element) =>
							element.style.getPropertyValue(
								"view-transition-name"
							)
						)
						.map((element) => {
							const inSkeleton = element.closest(
								`[${SHEET_SKELETON}]`
							);
							const name = element.style.getPropertyValue(
								"view-transition-name"
							);
							return `${inSkeleton ? "skeleton:" : ""}${name}`;
						}),
					kinds: document.documentElement.dataset.vt ?? "",
				});
			}
			fakeViewTransitions({ sync: true, onSnapshot: record });
			const uninstall = trackActivation();
			onTestFinished(uninstall);
			const [open, setOpen] = createSignal(false);
			function Fields(): JSX.Element {
				return (
					<PropertyRow field={fields.status}>
						<span>Done</span>
					</PropertyRow>
				);
			}
			setDeferredImmediate(false);
			onTestFinished(() => {
				setDeferredImmediate(true);
			});
			render(() => (
				<>
					<div id="row" role="row" data-morph-of="t1">
						<span data-morph-title="title">Task</span>
						<span data-morph-key="status">Done</span>
					</div>
					<Sheet.Root
						open={open()}
						onOpenChange={setOpen}
						morph={"t1"}
					>
						<Sheet.Header>
							<Sheet.Title>Task</Sheet.Title>
						</Sheet.Header>
						<Sheet.Skeleton>
							<Fields />
						</Sheet.Skeleton>
						<Sheet.Body>
							<Fields />
						</Sheet.Body>
					</Sheet.Root>
				</>
			));
			await new Promise((resolve) => setTimeout(resolve, 5));
			document
				.getElementById("row")
				?.dispatchEvent(
					new PointerEvent("pointerdown", { bubbles: true })
				);
			setOpen(true);
			await transitionSettled();
			expect(
				seen[0].names.some((name) => name.startsWith("skeleton:"))
			).toBe(false);
			expect(
				seen[0].names.some((name) => name.startsWith("jf-morph-part-"))
			).toBe(false);
			expect(seen[0].kinds.split(" ")).toContain("morph-grow");
			// Once the real fields are in, a reopen pairs them.
			await new Promise((resolve) => setTimeout(resolve, 20));
			setOpen(false);
			await transitionSettled();
			document
				.getElementById("row")
				?.dispatchEvent(
					new PointerEvent("pointerdown", { bubbles: true })
				);
			setOpen(true);
			await transitionSettled();
			expect(
				seen
					.at(-1)
					?.names.some((name) => name.startsWith("jf-morph-part-"))
			).toBe(true);
		});

		test("with nothing activated, opens out of morphFrom", async () => {
			mockLayoutBoxes();
			const oldNames: string[] = [];
			fakeViewTransitions({
				onStart: () => oldNames.push(...namedIds("#bell")),
			});
			const [open, setOpen] = createSignal(false);
			render(() => (
				<>
					<button id="bell" ref={fill}>
						Bell
					</button>
					<Sheet.Root
						open={open()}
						onOpenChange={setOpen}
						morphFrom={() => document.getElementById("bell")}
					>
						<Sheet.Header>
							<Sheet.Title>Notifications</Sheet.Title>
						</Sheet.Header>
						<Sheet.Body>body</Sheet.Body>
					</Sheet.Root>
				</>
			));
			await new Promise((resolve) => setTimeout(resolve, 5));
			setOpen(true);
			await transitionSettled();
			expect(oldNames).toEqual(["bell"]);
		});

		test("opening hides its source while it morphs out of it", async () => {
			const { opener } = await openFromButton(undefined);
			await vi.waitFor(() => {
				expect(opener).toHaveAttribute(MORPH_HIDDEN);
			});
		});

		test("morph={false} opens without hiding its source", async () => {
			const { opener } = await openFromButton(false);
			await screen.findByRole("dialog");
			await new Promise((resolve) => setTimeout(resolve, 20));
			expect(opener).not.toHaveAttribute(MORPH_HIDDEN);
		});

		test("the first open morphs into the sheet: its box exists before it opens", async () => {
			mockLayoutBoxes();
			const morphHolders: string[] = [];
			// Async, like a browser: the update runs a task after the call.
			fakeViewTransitions({
				onSnapshot: () => {
					for (const element of document.querySelectorAll<HTMLElement>(
						"*"
					)) {
						if (
							element.style.getPropertyValue(
								"view-transition-name"
							) === "jf-morph"
						) {
							morphHolders.push(
								element.getAttribute("role") ?? element.id
							);
						}
					}
				},
			});
			const uninstall = trackActivation();
			onTestFinished(uninstall);
			const [open, setOpen] = createSignal(false);
			render(() => (
				<>
					<div id="row" role="row" data-morph-of="t1">
						Task
					</div>
					<Sheet.Root
						open={open()}
						onOpenChange={setOpen}
						morph={"t1"}
					>
						<Sheet.Header>
							<Sheet.Title>Task</Sheet.Title>
						</Sheet.Header>
						<Sheet.Body>body</Sheet.Body>
					</Sheet.Root>
				</>
			));
			await new Promise((resolve) => setTimeout(resolve, 5));
			document
				.getElementById("row")
				?.dispatchEvent(
					new PointerEvent("pointerdown", { bubbles: true })
				);
			setOpen(true);
			await transitionSettled();
			expect(morphHolders).toEqual(["dialog"]);
		});

		test("a never-opened sheet has its shell but builds none of its parts", async () => {
			const built = vi.fn();
			function Probe(): JSX.Element {
				built();
				return <span>probe</span>;
			}
			const [open, setOpen] = createSignal(false);
			render(() => (
				<Sheet.Root open={open()} onOpenChange={setOpen}>
					<Sheet.Header>
						<Sheet.Title>Task</Sheet.Title>
					</Sheet.Header>
					<Probe />
				</Sheet.Root>
			));
			await new Promise((resolve) => setTimeout(resolve, 5));
			const shell = document.querySelector("[data-shortcut-surface]");
			expect(shell).not.toBeNull();
			expect(shell).toHaveAttribute("data-state", "closed");
			expect(shell?.childElementCount).toBe(0);
			expect(built).not.toHaveBeenCalled();
			expect(screen.queryByRole("dialog")).toBeNull();
			setOpen(true);
			await screen.findByRole("dialog");
			expect(built).toHaveBeenCalledTimes(1);
			setOpen(false);
			await waitFor(() => {
				expect(shell).toHaveAttribute("data-state", "closed");
			});
			// Kept once built: a reopen does not rebuild it.
			expect(built).toHaveBeenCalledTimes(1);
		});
	});
});

test("its scrim is marked to fade with the morph", () => {
	render(() => (
		<Sheet.Root open onOpenChange={() => {}}>
			<Sheet.Header>
				<Sheet.Title>Task</Sheet.Title>
			</Sheet.Header>
		</Sheet.Root>
	));
	expect(
		document.querySelector('[data-scope="dialog"][data-part="backdrop"]')
	).toHaveAttribute(MORPH_SCRIM);
});

test("its scrim runs no fade of its own while a morph fades it", () => {
	const styles = readFileSync(
		`${import.meta.dirname}/Sheet.module.scss`,
		"utf8"
	);
	const start = styles.indexOf(".backdrop {");
	const backdrop = styles.slice(start, styles.indexOf("\n}\n", start));
	expect(backdrop).toMatch(
		/:root\[data-vt~="morph"\] & \{\s*transition: none;\s*\}/
	);
});

test("on a phone it fills the screen: no margin around it, no card edges", () => {
	const styles = readFileSync(
		`${import.meta.dirname}/Sheet.module.scss`,
		"utf8"
	);
	/** The `bp.phone` block inside the top-level rule `selector`. */
	function phoneBlock(selector: string): string {
		const start = styles.indexOf(`\n${selector} {`);
		const rule = styles.slice(start, styles.indexOf("\n}\n", start));
		const phone = rule.indexOf("@include bp.phone {");
		return phone === -1
			? ""
			: rule.slice(phone, rule.indexOf("\t}", phone));
	}
	expect(phoneBlock(".positioner")).toContain("padding: 0;");
	const content = phoneBlock(".content");
	for (const declaration of [
		"inline-size: 100%;",
		"block-size: 100%;",
		"border: none;",
		"border-radius: 0;",
		"box-shadow: none;",
	]) {
		expect(content).toContain(declaration);
	}
});
