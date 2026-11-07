# Working in apps/web/src

The SolidJS frontend. Component tests run under happy-dom (see
`apps/web/AGENTS.md` for the pragma). Before writing SCSS here, read
`packages/design-system/AGENTS.md`: its token and typography rules apply to
app styles too.

## Layers

`eslint.config.js` (`boundaries/dependencies`) is the source of these rules.
Test files under `src` are exempt, and packages are not layered. A file under
`src/` or `convex/` that is in none of these places fails lint ("belongs to no
layer"), and so does an import of one: place it in a layer.

| Layer  | Folder                                         | May import                                                |
| ------ | ---------------------------------------------- | --------------------------------------------------------- |
| app    | `src/index.tsx`, `src/app.tsx`, `src/routing/` | anything                                                  |
| shell  | `src/shell/`                                   | shell, modules, shared, lib, convex                       |
| module | `src/modules/<name>/`                          | itself, another module's `entity.ts`, shared, lib, convex |
| shared | `src/shared/`                                  | shared, lib, convex                                       |
| lib    | `src/lib/`                                     | lib, convex                                               |
| sw     | `src/sw/`                                      | sw, lib, convex                                           |
| convex | `convex/`                                      | nothing in `src`                                          |

- Used by several modules: put it in `shared/`.
- Used by one module: keep it in that module.
- The app frame goes in `shell/`: code that composes modules (sidebar, command
  palette, notifications, entity peeks) or is mounted only by the app layer
  (splash, install and notification prompts, breadcrumbs, the updating
  overlay).
- A module's `entity.ts` is its public surface. It is the one file another
  module may import.

## Solid + Ark reactivity traps

Each of these rendered correctly on first paint and then quietly stopped
updating, which is the worst failure mode to debug.

- **`<Show when={x}>{(v) => …}` runs its callback ONCE**, when the condition
  first turns truthy. It does NOT re-run while `x` changes from one truthy
  value to another — the accessor updates, the callback does not. Rendering a
  row inside one froze the table's virtual rows: the server changed, the query
  pushed a new row model, the cells kept their original contents. Use
  `<Show keyed>` (re-renders on identity change) or `<For>`, and memoise the
  source so identity is stable when nothing has changed.
- **A sheet that stores the row object shows a snapshot.** All three community
  tabs did `setSelected(row)`; every edit made from inside the sheet wrote to
  Convex, the roster refetched, and the sheet went on rendering the row as it
  was when opened. Store the id and look it up in the live list each render.
- **Never put a wrapper between an Ark compound parent and its items.** Ark's
  Tooltip has to wrap its trigger, so tooltips on `Segment.Item` insert a
  `<span>` — and zag then measures the sliding indicator at `0×0` and the
  selected option loses its highlight. If a part needs a tooltip, the component
  must forward `asChild` to that part.
- **`ref` callbacks run before attributes are applied.** A ref that reads an
  attribute of its own element (TanStack Virtual reading `data-index`) gets
  `null`. Set what you need inside the ref. And anything the ref writes to a
  reactive store must be deferred (`queueMicrotask`) or it re-enters the render
  that is still running.
- **Passing a signal's value into a render prop's JSX call site remounts the
  child on every change.** A render prop (`asChild={(props) => <Child ... />}`,
  a sheet's `content={(item) => <Panel item={item} />}`) runs inside the
  parent's render, but the JSX it returns is evaluated fresh each time a
  tracked signal it reads changes — Solid has no component identity to diff
  against, so it disposes the previous child and creates a new one. Reading
  `signal()` (the value) at that call site puts the read in that tracked scope;
  passing `signal` (the accessor) instead defers the read into the child's own
  render, so the child mounts once and updates in place. This was the inventory
  sheet-animation bug: the sheet content read the selected item's value
  directly in the render-prop call site, so every field edit remounted the
  sheet and killed its open/close CSS transition mid-flight. Pass accessors
  into render props, not values.
- **Never "simplify" a read that looks unused inside a tracked scope.** In
  Solid, reading a signal or store field inside an effect, memo or `on()`
  source is what subscribes to it. `bindConvexAuth` in `shared/data/convex.ts`
  depends on `session().data`, because Better Auth reconciles the session in
  place and `session()` keeps its identity. A cleanup that turned
  `void session().data` into `session()` passed every test and stopped Convex
  from re-authenticating after sign-in. Make such a dependency explicit with
  `on(() => …)`, and pin it with a test.

## Table row actions

A table's action column goes through `actionsColumn`
(`shared/actions/actionsColumn.ts`), never a literal `id: "actions"`. Give it
the number of actions this viewer can have, 0 when they have none, so there is
no empty column. Gate the column, not its cell.

## Testing reactive hooks

- **Mock a store-backed hook the way the library updates it.** A mock that
  returns a new object per change exercises a path the real library never
  takes. `shared/data/convex.test.ts` builds the session with `createStore` and
  updates it with `reconcile`, so identity stays put and only fields change,
  as in Better Auth. Copy that pattern for any hook backed by a Solid store.
- Test pitfalls specific to Solid and mocked Convex (proxy identity of `api`
  references, `<Show>` freezing, measurement in a DOM without layout) are in
  the `solid-testing-pitfalls` skill.
