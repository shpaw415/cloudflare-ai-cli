#!/usr/bin/env bun
import { runLogin } from "./commands/login";
import { runLogout } from "./commands/logout";
import { runWhoami } from "./commands/whoami";
import { runAgent } from "./commands/agent";
import { runAsk } from "./commands/ask";
import { runImageCommand } from "./commands/image";

const VERSION = "0.1.0";

const HELP = `cf-ai — one-shot AI prompts via Cloudflare AI Gateway or Workers AI

Usage:
  cf-ai login [--browser] [--device] [--backend gateway|workers-ai] [--account <id>] [--gateway <id>] [--token <t>]
  cf-ai logout
  cf-ai whoami
  cf-ai agent add <name> --model <model> [--kind chat|image] [--backend gateway|workers-ai] [--system <text>]
                              [--temperature <n>] [--max-tokens <n>]
  cf-ai agent list
  cf-ai agent get <name>
  cf-ai agent remove <name>
  cf-ai ask <agent> <prompt...> [--model <m>] [--system <s>] [--temperature <n>]
                [--max-tokens <n>] [-o out.png] [--base64] [--json] [--env]
  cf-ai image "<prompt...>" --model <model> [-o out.png] [--base64] [--backend gateway|workers-ai] [--json] [--env]

Backends:
  gateway      AI Gateway OpenAI-compatible endpoint (model: provider/name, e.g. grok/grok-4.5)
  workers-ai   Workers AI REST endpoint (model: @cf/..., e.g. @cf/meta/llama-3.3-70b-instruct-fp8-fast)

Image:
  image agents (kind=image) and the image command call the Workers AI run endpoint and save
  the generated PNG, e.g. --model @cf/black-forest-labs/flux-2-klein-9b.
  Output modes: -o file.png saves; --base64 prints the raw base64 (pipeable); --json dumps the API response.

Config:
  ~/.config/cf-ai/auth.json    credentials (chmod 600)
  ~/.config/cf-ai/agents.json  agent profiles

Login:
  cf-ai login opens a browser for Cloudflare OAuth (no copy-paste); the access token
  auto-refreshes. Use --token to paste an API token instead (scripts/CI).
  On a remote/SSH machine without a browser, use --device: it prints a URL + code,
  you approve from any browser, and the CLI polls until you do.

Env overrides (with --env): CF_AI_ACCOUNT_ID, CF_AI_TOKEN, CF_AI_BACKEND, CF_AI_GATEWAY_ID

Examples:
  cf-ai login
  cf-ai agent add coder --model grok/grok-4.5 --system "Answer tersely."
  cf-ai ask coder "Explain TCP fast open in one paragraph"
  cf-ai agent add quick --backend workers-ai --model @cf/meta/llama-3.3-70b-instruct-fp8-fast
  cf-ai ask quick "Write a haiku about caches" --temperature 0.8
  cf-ai agent add art --kind image --model @cf/black-forest-labs/flux-2-klein-9b
  cf-ai ask art "a neon koi swimming through clouds" -o koi.png
  cf-ai image "sunset over a server rack" --model @cf/black-forest-labs/flux-2-klein-9b -o rack.png`;

async function main(): Promise<void> {
  const [cmd, ...rest] = process.argv.slice(2);
  switch (cmd) {
    case "login":
      return await runLogin(rest);
    case "logout":
      return await runLogout();
    case "whoami":
      return await runWhoami();
    case "agent":
      return await runAgent(rest);
    case "ask":
      return await runAsk(rest);
    case "image":
      return await runImageCommand(rest);
    case "help":
    case "--help":
    case "-h":
      console.log(HELP);
      return;
    case "--version":
    case "-v":
      console.log(VERSION);
      return;
    case undefined:
      console.log(HELP);
      return;
    default:
      console.error(`Unknown command: ${cmd}`);
      console.error("Run `cf-ai --help` for usage.");
      process.exit(1);
  }
}

try {
  await main();
} catch (err) {
  console.error(`error: ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
}
