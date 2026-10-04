import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { parseArgs } from "node:util";
import { envAuth, type Auth } from "../lib/config";
import { getValidAuth } from "../lib/session";
import { audioExtFor, runTts } from "../lib/backends";

export async function runTtsCommand(args: string[]): Promise<void> {
  const { values, positionals } = parseArgs({
    args,
    options: {
      model: { type: "string" },
      speaker: { type: "string" },
      lang: { type: "string" },
      encoding: { type: "string" },
      container: { type: "string" },
      out: { type: "string", short: "o" },
      base64: { type: "boolean", default: false },
      backend: { type: "string" },
      env: { type: "boolean", default: false },
    },
    allowPositionals: true,
  });

  const text = positionals.join(" ").trim();
  if (text === "") {
    console.error('Usage: cf-ai tts "<text...>" --model <model> [--speaker <name>] [--lang <code>] [--encoding <enc>] [--container <c>] [-o out.mp3] [--base64] [--backend gateway|workers-ai] [--env]');
    process.exit(1);
  }

  const model = values.model?.trim() ?? "";
  if (model === "") {
    console.error("Error: --model is required, e.g. --model @cf/deepgram/aura-1");
    process.exit(1);
  }

  let auth: Auth;
  if (values.env) {
    const fromEnv = envAuth();
    if (!fromEnv) {
      console.error("Error: --env set but CF_AI_ACCOUNT_ID and/or CF_AI_TOKEN are missing.");
      process.exit(1);
    }
    auth = fromEnv;
  } else {
    auth = await getValidAuth();
  }

  if (values.backend) {
    const b = values.backend.trim().toLowerCase();
    if (b !== "gateway" && b !== "workers-ai") {
      console.error("Error: --backend must be gateway or workers-ai.");
      process.exit(1);
    }
    auth = { ...auth, backend: b };
  }

  const { bytes, contentType } = await runTts({
    auth,
    model,
    text,
    speaker: values.speaker?.trim().toLowerCase(),
    lang: values.lang?.trim().toLowerCase(),
    encoding: values.encoding?.trim().toLowerCase(),
    container: values.container?.trim().toLowerCase(),
  });

  if (values.base64) {
    process.stdout.write(Buffer.from(bytes).toString("base64"));
    return;
  }

  const out = values.out ?? `cf-ai-${Date.now()}${audioExtFor(contentType, bytes)}`;
  const abs = resolve(out);
  mkdirSync(dirname(abs), { recursive: true });
  writeFileSync(abs, bytes);
  console.log(`Saved audio to ${abs} (${bytes.length} bytes${contentType ? `, ${contentType}` : ""})`);
}
