import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { parseArgs } from "node:util";
import { envAuth, type Auth } from "../lib/config";
import { getValidAuth } from "../lib/session";
import { runImage } from "../lib/backends";

export async function runImageCommand(args: string[]): Promise<void> {
  const { values, positionals } = parseArgs({
    args,
    options: {
      model: { type: "string" },
      out: { type: "string", short: "o" },
      base64: { type: "boolean", default: false },
      backend: { type: "string" },
      json: { type: "boolean", default: false },
      env: { type: "boolean", default: false },
    },
    allowPositionals: true,
  });

  const prompt = positionals.join(" ").trim();
  if (prompt === "") {
    console.error('Usage: cf-ai image "<prompt...>" --model <model> [-o out.png] [--backend gateway|workers-ai] [--json] [--env]');
    process.exit(1);
  }

  const model = values.model?.trim() ?? "";
  if (model === "") {
    console.error("Error: --model is required, e.g. --model @cf/black-forest-labs/flux-2-klein-9b");
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

  const { base64, raw } = await runImage({ auth, model, prompt });

  if (values.json) {
    console.log(JSON.stringify(raw, null, 2));
    return;
  }

  if (values.base64) {
    console.log(base64);
    return;
  }

  const out = values.out ?? `cf-ai-${Date.now()}.png`;
  const buf = Buffer.from(base64, "base64");
  const abs = resolve(out);
  mkdirSync(dirname(abs), { recursive: true });
  writeFileSync(abs, buf);
  console.log(`Saved image to ${abs} (${buf.length} bytes)`);
}
