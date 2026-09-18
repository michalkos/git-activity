/** Copy text to the system clipboard, with OSC 52 so SSH sessions still work. */

export async function copyToClipboard(text: string): Promise<void> {
  process.stdout.write(
    `\x1b]52;c;${Buffer.from(text, "utf8").toString("base64")}\x07`
  );

  const command = clipboardCommand();
  if (!command) {
    return;
  }
  try {
    const proc = Bun.spawn(command, {
      stdin: new Response(text),
      stdout: "ignore",
      stderr: "ignore",
    });
    await proc.exited;
  } catch {
    // OSC 52 already sent.
  }
}

function clipboardCommand(): string[] | null {
  switch (process.platform) {
    case "darwin":
      return ["pbcopy"];
    case "win32":
      return ["clip"];
    default:
      if (Bun.which("wl-copy")) {
        return ["wl-copy"];
      }
      if (Bun.which("xclip")) {
        return ["xclip", "-selection", "clipboard"];
      }
      return null;
  }
}
