import { render, screen } from "@solidjs/testing-library";
import { createSignal, For, Show } from "solid-js";
import { describe, expect, it, vi } from "vitest";

import { Query } from "./Query.tsx";

const skeletonListCalls = vi.hoisted(() => vi.fn());

vi.mock("../Skeleton/SkeletonList.tsx", async (importOriginal) => {
	const original =
		await importOriginal<typeof import("../Skeleton/SkeletonList.tsx")>();
	return {
		...original,
		SkeletonList: (props: Parameters<typeof original.SkeletonList>[0]) => {
			skeletonListCalls();
			return original.SkeletonList(props);
		},
	};
});

type Row = { id: string; name: string };

function List(props: {
	data: Row[] | null | undefined;
	empty?: boolean;
	skeleton?: boolean;
}) {
	return (
		<Query.Root data={props.data}>
			<span data-testid="count">
				<Query.Count />
			</span>
			<Show when={props.skeleton}>
				<Query.Skeleton>
					<p>custom skeleton</p>
				</Query.Skeleton>
			</Show>
			<Query.Content of={props.data}>
				{(rows) => (
					<ul>
						<For each={rows()}>{(r) => <li>{r.name}</li>}</For>
						<li data-testid="content">{rows().length}</li>
					</ul>
				)}
			</Query.Content>
			<Show when={props.empty}>
				<Query.Empty>
					<p>nothing here</p>
				</Query.Empty>
			</Show>
		</Query.Root>
	);
}

describe("Query", () => {
	it("loading shows the default SkeletonList and a count skeleton", () => {
		const { container } = render(() => <List data={undefined} empty />);
		expect(container.querySelector("[data-skeleton-list]")).not.toBeNull();
		expect(screen.queryByTestId("content")).toBeNull();
		expect(screen.queryByText("nothing here")).toBeNull();
		expect(screen.getByTestId("count").textContent).toBe("");
		expect(
			screen.getByTestId("count").querySelector("[aria-hidden]")
		).not.toBeNull();
	});

	it("a Query.Skeleton replaces the default while loading", () => {
		const { container } = render(() => <List data={undefined} skeleton />);
		expect(screen.getByText("custom skeleton")).toBeTruthy();
		expect(container.querySelector("[data-skeleton-list]")).toBeNull();
	});

	it("an empty array with Empty shows only Empty (Empty placed after Content)", () => {
		render(() => <List data={[]} empty />);
		expect(screen.getByText("nothing here")).toBeTruthy();
		expect(screen.queryByTestId("content")).toBeNull();
		expect(screen.getByTestId("count").textContent).toBe("0");
	});

	it("an empty array without Empty still renders Content", () => {
		render(() => <List data={[]} />);
		expect(screen.getByTestId("content").textContent).toBe("0");
	});

	it("null with Empty shows Empty; null without Empty renders nothing", () => {
		const a = render(() => <List data={null} empty />);
		expect(screen.getByText("nothing here")).toBeTruthy();
		a.unmount();
		render(() => <List data={null} />);
		expect(screen.queryByTestId("content")).toBeNull();
	});

	it("loaded data renders Content and the count", () => {
		render(() => <List data={[{ id: "1", name: "Ada" }]} empty />);
		expect(screen.getByText("Ada")).toBeTruthy();
		expect(screen.getByTestId("count").textContent).toBe("1");
		expect(screen.queryByText("nothing here")).toBeNull();
	});

	it("Content is not rebuilt when the data changes (non-keyed)", () => {
		const [data, setData] = createSignal<Row[]>([{ id: "1", name: "Ada" }]);
		let builds = 0;
		render(() => (
			<Query.Root data={data()}>
				<Query.Content of={data()}>
					{(rows) => {
						builds++;
						return <p>{rows().length}</p>;
					}}
				</Query.Content>
			</Query.Root>
		));
		setData([
			{ id: "1", name: "Ada" },
			{ id: "2", name: "Alan" },
		]);
		expect(screen.getByText("2")).toBeTruthy();
		expect(builds).toBe(1);
	});

	it("Count renders nothing for a loaded non-array value", () => {
		render(() => (
			<Query.Root data={{ name: "x" }}>
				<span data-testid="c">
					<Query.Count />
				</span>
			</Query.Root>
		));
		expect(screen.getByTestId("c").textContent).toBe("");
		expect(screen.getByTestId("c").children.length).toBe(0);
	});

	it("Count updates when the array length changes", () => {
		const [data, setData] = createSignal<Row[]>([{ id: "1", name: "Ada" }]);
		render(() => (
			<Query.Root data={data()}>
				<span data-testid="c">
					<Query.Count />
				</span>
			</Query.Root>
		));
		expect(screen.getByTestId("c").textContent).toBe("1");
		setData([
			{ id: "1", name: "Ada" },
			{ id: "2", name: "Alan" },
			{ id: "3", name: "Grace" },
		]);
		expect(screen.getByTestId("c").textContent).toBe("3");
	});

	it("Root renders no element of its own", () => {
		const { container } = render(() => (
			<Query.Root data={[]}>
				<b>child</b>
			</Query.Root>
		));
		expect(container.firstElementChild?.tagName).toBe("B");
	});

	it("a part outside Root throws a clear error", () => {
		expect(() => render(() => <Query.Count />)).toThrow(/Query.Root/);
	});

	it("Empty after Content: empty data at mount never builds Content", () => {
		let builds = 0;
		render(() => (
			<Query.Root data={[]}>
				<Query.Content of={[] as Row[]}>
					{() => {
						builds++;
						return <p>content</p>;
					}}
				</Query.Content>
				<Query.Empty>
					<p>nothing here</p>
				</Query.Empty>
			</Query.Root>
		));
		expect(builds).toBe(0);
		expect(screen.getByText("nothing here")).toBeTruthy();
	});

	it("Skeleton after Content: loading at mount never creates the default skeleton", () => {
		let builds = 0;
		skeletonListCalls.mockClear();
		const { container } = render(() => (
			<Query.Root data={undefined}>
				<Query.Content of={undefined as Row[] | undefined}>
					{() => {
						builds++;
						return <p>content</p>;
					}}
				</Query.Content>
				<Query.Skeleton>
					<p>custom skeleton</p>
				</Query.Skeleton>
			</Query.Root>
		));
		expect(skeletonListCalls).not.toHaveBeenCalled();
		expect(builds).toBe(0);
		expect(container.querySelector("[data-skeleton-list]")).toBeNull();
		expect(screen.getByText("custom skeleton")).toBeTruthy();
	});

	it("Empty after Content with non-empty data builds Content exactly once", () => {
		let builds = 0;
		render(() => (
			<Query.Root data={[{ id: "1", name: "Ada" }]}>
				<Query.Content of={[{ id: "1", name: "Ada" }]}>
					{(rows) => {
						builds++;
						return <p>{rows().length}</p>;
					}}
				</Query.Content>
				<Query.Empty>
					<p>nothing here</p>
				</Query.Empty>
			</Query.Root>
		));
		expect(builds).toBe(1);
		expect(screen.queryByText("nothing here")).toBeNull();
	});
});
