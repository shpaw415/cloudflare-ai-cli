import { parseArgs } from "node:util";
import { DEFAULT_GATEWAY_ID, saveAuth, type Auth, type Backend } from "../lib/config";
import { maskToken } from "../lib/backends";
import { promptHidden, promptLine } from "../lib/prompt";

function normalizeBackend(value: string): Backend | null {
  const v = value.trim().toLowerCase();
  if (v === "gateway") return "gateway";
  if (v === "workers-ai" || v === "workersai" || v === "workers_ai") return "workers-ai";
  return null;
}

export async function runLogin(args: string[]): Promise<void> {
  const { values } = parseArgs({
    args,
    options: {
      backend: { type: "string" },
      account: { type: "string" },
      gateway: { type: "string" },
      token: { type: "string" },
    },
    allowPositionals: true,
  });

  console.log("Login to Cloudflare AI (gateway or Workers AI).");

  let backend: Backend | null = values.backend ? normalizeBackend(values.backend) : null;
  while (backend === null) {
    const answer = await promptLine("Backend (gateway / workers-ai)", "gateway");
    backend = normalizeBackend(answer);
    if (backend === null) console.error("  Invalid backend. Type `gateway` or `workers-ai`.");
  }

  let accountId = values.account?.trim() ?? "";
  while (accountId === "") {
    accountId = await promptLine("Cloudflare account ID");
  }

  let gatewayId: string | undefined;
  if (backend === "gateway") {
    gatewayId = (values.gateway ?? (await promptLine("Gateway ID", DEFAULT_GATEWAY_ID))).trim();
    if (gatewayId === "") gatewayId = DEFAULT_GATEWAY_ID;
  }

  let token = values.token?.trim() ?? "";
  while (token === "") {
    token = await promptHidden("API token (input hidden): ");
    if (token === "") console.error("  Token cannot be empty.");
  }

  const auth: Auth = { backend, accountId, token };
  if (gatewayId) auth.gatewayId = gatewayId;
  saveAuth(auth);

  console.log(`Logged in: backend=${backend} account=${accountId}${gatewayId ? ` gateway=${gatewayId}` : ""}`);
  console.log(`Token saved (0600): ${maskToken(token)}`);
}
