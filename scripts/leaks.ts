import { checkLeaks } from "./mirror/leakCheck";

const LEAKS_TIMEOUT_MS = 600_000;
const LEAK_EXIT = 1;
const ERROR_EXIT = 2;
const INTERRUPTED_EXIT = 130;

if (import.meta.main) {
  process.on("SIGINT", () => process.exit(INTERRUPTED_EXIT));
  const result = checkLeaks(process.cwd(), LEAKS_TIMEOUT_MS);
  if (result.status === "missing") {
    console.error(
      "No leak gate in this checkout (scripts/mirror/gate.test.ts).",
    );
    process.exit(ERROR_EXIT);
  }
  process.stdout.write(result.output);
  if (result.status === "pass")
    for (const notice of result.notices) console.log(notice);
  if (result.status === "leak") process.exitCode = LEAK_EXIT;
  if (result.status === "error") {
    console.error(`The leak check could not run: ${result.cause}`);
    process.exitCode = ERROR_EXIT;
  }
}
