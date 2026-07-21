import readline from "node:readline";

interface SelectOptions {
  /** Prompt shown above the list. */
  message?: string;
}

/**
 * Interactive arrow-key list picker built on Node's built-in readline.
 *
 * - Up/Down (or k/j) move the highlight, Enter selects.
 * - Esc / q / Ctrl-C cancels and resolves to `null`.
 * - In a non-interactive shell (no TTY), resolves to the first item without
 *   prompting, so scripts and piped invocations don't hang.
 *
 * Restores the terminal (raw mode + listeners + cursor) in all exit paths.
 */
export function selectFromList<T>(
  items: T[],
  render: (item: T) => string,
  opts: SelectOptions = {},
): Promise<T | null> {
  // Non-interactive fallback: pick the first item.
  if (!process.stdin.isTTY || items.length === 0) {
    return Promise.resolve(items[0] ?? null);
  }

  const { message = "Select an option:" } = opts;

  return new Promise<T | null>((resolve) => {
    let active = 0;
    let rendered = 0; // number of lines drawn (for redraw)

    const stdin = process.stdin;
    const stdout = process.stdout;

    readline.emitKeypressEvents(stdin);
    const wasRaw = stdin.isRaw ?? false;
    if (stdin.setRawMode) stdin.setRawMode(true);
    stdin.resume();
    stdout.write("\x1B[?25l"); // hide cursor

    function draw(first = false): void {
      if (!first) {
        // Move cursor up to the start of the previously drawn block.
        stdout.write(`\x1B[${rendered}A`);
      }
      const lines = items.map((item, i) => {
        const pointer = i === active ? "\x1B[36m>\x1B[0m" : " ";
        const label = i === active ? `\x1B[36m${render(item)}\x1B[0m` : render(item);
        // Clear the line, then write it.
        return `\x1B[2K${pointer} ${label}`;
      });
      stdout.write(lines.join("\n") + "\n");
      rendered = items.length;
    }

    function cleanup(): void {
      stdin.removeListener("keypress", onKeypress);
      if (stdin.setRawMode) stdin.setRawMode(wasRaw);
      stdin.pause();
      stdout.write("\x1B[?25h"); // show cursor
    }

    function onKeypress(_str: string, key: readline.Key): void {
      if (!key) return;

      if (key.name === "up" || key.name === "k") {
        active = (active - 1 + items.length) % items.length;
        draw();
      } else if (key.name === "down" || key.name === "j") {
        active = (active + 1) % items.length;
        draw();
      } else if (key.name === "return" || key.name === "enter") {
        cleanup();
        resolve(items[active]);
      } else if (
        key.name === "escape" ||
        key.name === "q" ||
        (key.ctrl && key.name === "c")
      ) {
        cleanup();
        resolve(null);
      }
    }

    if (message) stdout.write(message + "\n");
    stdin.on("keypress", onKeypress);
    draw(true);
  });
}
