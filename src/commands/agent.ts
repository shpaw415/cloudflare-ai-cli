import { parseArgs } from "node:util";
import {
  BACKENDS,
  loadAgents,
  saveAgents,
  type AgentProfile,
  type Backend,
  type Kind,
} from "../lib/config";

const NAME_RE = /^[a-zA-Z0-9][a-zA-Z0-9._-]*$/;
const KINDS: Kind[] = ["chat", "image"];

function parseBackend(value: string): Backend | null {
  const v = value.trim().toLowerCase();
  return (BACKENDS as string[]).includes(v) ? (v as Backend) : null;
}

export async function runAgent(args: string[]): Promise<void> {
  const [sub, ...rest] = args;
  switch (sub) {
    case "add":
      return await agentAdd(rest);
    case "list":
      return agentList();
    case "get":
      return agentGet(rest);
    case "remove":
    case "rm":
      return agentRemove(rest);
    default:
      console.error("Usage: cf-ai agent <add|list|get|remove> [name] [options]");
      console.error("  add <name> --model <model> [--backend gateway|workers-ai] [--system <text>] [--temperature <n>] [--max-tokens <n>]");
      console.error("  list");
      console.error("  get <name>");
      console.error("  remove <name>");
      process.exit(sub === undefined || sub === "--help" || sub === "-h" ? 0 : 1);
  }
}

async function agentAdd(args: string[]): Promise<void> {
  const { values, positionals } = parseArgs({
    args,
    options: {
      model: { type: "string" },
      kind: { type: "string" },
      backend: { type: "string" },
      system: { type: "string" },
      temperature: { type: "string" },
      "max-tokens": { type: "string" },
    },
    allowPositionals: true,
  });

  const name = positionals[0];
  if (!name || !NAME_RE.test(name)) {
    console.error("Error: agent name is required (letters, digits, . _ -).");
    process.exit(1);
  }

  const model = values.model?.trim() ?? "";
  if (model === "") {
    console.error("Error: --model is required, e.g. --model grok/grok-4.5");
    process.exit(1);
  }

  let kind: Kind | undefined;
  if (values.kind !== undefined) {
    const k = values.kind.trim().toLowerCase() as Kind;
    if (!(KINDS as string[]).includes(k)) {
      console.error(`Error: --kind must be one of ${KINDS.join(", ")}.`);
      process.exit(1);
    }
    kind = k;
  }

  let backend: Backend | undefined;
  if (values.backend) {
    const parsed = parseBackend(values.backend);
    if (!parsed) {
      console.error(`Error: --backend must be one of ${BACKENDS.join(", ")}.`);
      process.exit(1);
    }
    backend = parsed;
  }

  let temperature: number | undefined;
  if (values.temperature !== undefined) {
    temperature = Number.parseFloat(values.temperature);
    if (Number.isNaN(temperature) || temperature < 0 || temperature > 2) {
      console.error("Error: --temperature must be a number between 0 and 2.");
      process.exit(1);
    }
  }

  let maxTokens: number | undefined;
  if (values["max-tokens"] !== undefined) {
    maxTokens = Number.parseInt(values["max-tokens"], 10);
    if (Number.isNaN(maxTokens) || maxTokens <= 0) {
      console.error("Error: --max-tokens must be a positive integer.");
      process.exit(1);
    }
  }

  const agents = loadAgents();
  const existing = agents[name] !== undefined;
  const profile: AgentProfile = { name, model };
  if (kind) profile.kind = kind;
  if (backend) profile.backend = backend;
  if (values.system !== undefined && values.system !== "") profile.system = values.system;
  if (temperature !== undefined) profile.temperature = temperature;
  if (maxTokens !== undefined) profile.maxTokens = maxTokens;
  agents[name] = profile;
  saveAgents(agents);

  console.log(`${existing ? "Updated" : "Created"} agent "${name}": model=${model}${kind ? ` kind=${kind}` : ""}${backend ? ` backend=${backend}` : ""}`);
}

function agentList(): void {
  const agents = loadAgents();
  const names = Object.keys(agents).sort();
  if (names.length === 0) {
    console.log("No agents. Create one with `cf-ai agent add <name> --model <model>`.");
    return;
  }
  const width = Math.max(...names.map((n) => n.length), 5);
  console.log(`${"NAME".padEnd(width)}  BACKEND     MODEL`);
  for (const name of names) {
    const a = agents[name];
    console.log(`${name.padEnd(width)}  ${(a.backend ?? "-").padEnd(11)} ${a.model}`);
  }
}

function agentGet(args: string[]): void {
  const name = args[0];
  const agents = loadAgents();
  const profile = name ? agents[name] : undefined;
  if (!profile) {
    console.error(`Error: agent "${name ?? ""}" not found.`);
    process.exit(1);
  }
  console.log(JSON.stringify(profile, null, 2));
}

function agentRemove(args: string[]): void {
  const name = args[0];
  const agents = loadAgents();
  if (!name || agents[name] === undefined) {
    console.error(`Error: agent "${name ?? ""}" not found.`);
    process.exit(1);
  }
  delete agents[name];
  saveAgents(agents);
  console.log(`Removed agent "${name}".`);
}
