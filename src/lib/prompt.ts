import { createInterface, emitKeypressEvents } from "node:readline";

export async function promptLine(label: string, fallback?: string): Promise<string> {
  const suffix = fallback ? ` [${fallback}]` : "";
  process.stdout.write(`${label}${suffix}: `);
  const line = await new Promise<string>((resolve) => {
    const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    rl.once("line", (input) => {
      rl.close();
      resolve(input.trim());
    });
  });
  if (line === "" && fallback !== undefined) return fallback;
  return line;
}

export async function promptHidden(label: string): Promise<string> {
  const { stdin, stdout } = process;
  stdout.write(label);
  if (stdin.isTTY) {
    emitKeypressEvents(stdin);
    stdin.setRawMode(true);
    stdin.resume();
    const chars: string[] = [];
    return await new Promise<string>((resolve) => {
      const cleanup = () => {
        stdin.setRawMode(false);
        stdin.removeListener("keypress", onKeypress);
        stdin.pause();
      };
      const onKeypress = (
        str: string | undefined,
        key: { name?: string; ctrl?: boolean; sequence?: string },
      ) => {
        if (key?.ctrl && key.name === "c") {
          cleanup();
          stdout.write("\n");
          process.exit(130);
        }
        if (key && (key.name === "return" || key.name === "enter")) {
          cleanup();
          stdout.write("\n");
          resolve(chars.join(""));
          return;
        }
        if (key?.name === "backspace") {
          chars.pop();
          return;
        }
        if (str && !key.ctrl && str.charCodeAt(0) >= 32) chars.push(str);
      };
      stdin.on("keypress", onKeypress);
    });
  }
  return await new Promise<string>((resolve) => {
    let data = "";
    const onData = (chunk: Buffer) => {
      data += chunk.toString();
      if (data.includes("\n")) {
        stdin.removeListener("data", onData);
        resolve(data.split("\n")[0].trim());
      }
    };
    stdin.on("data", onData);
  });
}
