import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { parseArgs } from "node:util";
import { envAuth, loadAgents, type Auth } from "../lib/config";
import { getValidAuth } from "../lib/session";
import { chat, runImage } from "../lib/backends";

export async function runAsk(args: string[]): Promise<void> {
  const { values, positionals } = parseArgs({
    args,
    options: {
      model: { type: "string" },
      system: { type: "string" },
      temperature: { type: "string" },
      "max-tokens": { type: "string" },
      out: { type: "string", short: "o" },
      base64: { type: "boolean", default: false },
      json: { type: "boolean", default: false },
      env: { type: "boolean", default: false },
    },
    allowPositionals: true,
  });

  const name = positionals[0];
  const prompt = positionals.slice(1).join(" ").trim();

  if (!name) {
    console.error("Usage: cf-ai ask <agent> <prompt...> [--model <m>] [--system <s>] [--temperature <n>] [--max-tokens <n>] [-o out.png] [--base64] [--json] [--env]");
    process.exit(1);
  }

  const agents = loadAgents();
  const profile = agents[name];
  if (!profile) {
    const names = Object.keys(agents).sort();
    console.error(`Error: agent "${name}" not found.`);
    console.error(names.length ? `Available: ${names.join(", ")}` : "No agents defined. Use `cf-ai agent add <name> --model <model>`.");
    process.exit(1);
  }

  if (prompt === "") {
    console.error("Error: prompt is required, e.g. cf-ai ask coder \"explain X\"");
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

  const model = values.model?.trim() || profile.model;
  if (model === "") {
    console.error("Error: no model. Use --model or set one with `cf-ai agent add`.");
    process.exit(1);
  }

  const system = values.system ?? profile.system;
  const messages = [] as { role: "system" | "user"; content: string }[];
  if (system) messages.push({ role: "system", content: system });
  messages.push({ role: "user", content: prompt });

  let temperature: number | undefined;
  if (values.temperature !== undefined) {
    temperature = Number.parseFloat(values.temperature);
    if (Number.isNaN(temperature) || temperature < 0 || temperature > 2) {
      console.error("Error: --temperature must be a number between 0 and 2.");
      process.exit(1);
    }
  } else {
    temperature = profile.temperature;
  }

  let maxTokens: number | undefined;
  if (values["max-tokens"] !== undefined) {
    maxTokens = Number.parseInt(values["max-tokens"], 10);
    if (Number.isNaN(maxTokens) || maxTokens <= 0) {
      console.error("Error: --max-tokens must be a positive integer.");
      process.exit(1);
    }
  } else {
    maxTokens = profile.maxTokens;
  }

  const effectiveAuth = profile.backend ? { ...auth, backend: profile.backend } : auth;

  if (profile.kind === "image") {
    const { base64, raw } = await runImage({ auth: effectiveAuth, model, prompt });
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
    return;
  }

  const { text, raw } = await chat({
    auth: effectiveAuth,
    model,
    messages,
    temperature,
    maxTokens,
  });

  if (values.json) {
    console.log(JSON.stringify(raw, null, 2));
  } else {
    console.log(text);
  }
}
