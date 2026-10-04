<img src="assets/icon.svg" width="64" height="64" alt="">

# cf-ai — Cloudflare AI CLI

One-shot AI prompts from the terminal via **Cloudflare AI Gateway** or **Workers AI**, with named agent profiles and stored auth.

Built with [Bun](https://bun.sh) — zero runtime dependencies, TypeScript runs directly.

## Install

```sh
bun install
bun link   # installs the `cf-ai` command globally
```

## Quick start

```sh
cf-ai login
cf-ai agent add coder --model grok/grok-4.5 --system "Answer tersely."
cf-ai ask coder "Explain TCP fast open in one paragraph"
```

## Login

`cf-ai login` opens your browser for Cloudflare OAuth — no copy-paste. It waits on a
local callback (`http://localhost:8976/oauth/callback`), exchanges the code via PKCE,
auto-selects your account (or prompts if you have several), and stores OAuth credentials.
The access token auto-refreshes whenever it expires, and `logout` revokes it server-side.

```sh
cf-ai login --backend gateway --gateway home-ai
cf-ai login --backend workers-ai
```

Flags: `--browser` (force browser flow), `--account <id>` (skip account selection),
`--backend`, `--gateway`.

### Remote / SSH machines

`--device` uses the RFC 8628 device flow — no tunnel, no callback server. The CLI
prints a URL and a code; open the URL in a browser on any machine, approve, and the
CLI polls until you do:

```sh
cf-ai login --device --backend workers-ai
```

Paste-a-token mode still works for scripts/CI:

```sh
cf-ai login --backend gateway --account <ACCOUNT_ID> --gateway home-ai --token <CF_API_TOKEN>
```

- **gateway** — routes through AI Gateway's OpenAI-compatible endpoint. Model IDs use the `provider/name` format (`grok/grok-4.5`, `workers-ai/@cf/...`). Default gateway ID: `home-ai`.
- **workers-ai** — calls `api.cloudflare.com/client/v4/accounts/{account}/ai/v1/chat/completions` directly. Model IDs are plain Workers AI names (`@cf/meta/llama-3.3-70b-instruct-fp8-fast`).

Credentials are stored in `~/.config/cf-ai/auth.json` with `0600` permissions.
`cf-ai whoami` shows the stored config (token masked); `cf-ai logout` deletes it.

## Agents

Named profiles live in `~/.config/cf-ai/agents.json`:

```sh
cf-ai agent add coder --model grok/grok-4.5 --system "Answer tersely." --temperature 0.2
cf-ai agent add quick --backend workers-ai --model @cf/meta/llama-3.3-70b-instruct-fp8-fast --max-tokens 512
cf-ai agent list
cf-ai agent get coder
cf-ai agent remove quick
```

Any flag can be overridden per request:

```sh
cf-ai ask coder "review this" --model anthropic/claude-sonnet-4-5 --max-tokens 2000
```

## Image models

Image agents (`--kind image`) and the standalone `image` command call the Workers AI run
endpoint and save the generated PNG:

```sh
cf-ai agent add art --kind image --model @cf/black-forest-labs/flux-2-klein-9b
cf-ai ask art "a neon koi swimming through clouds" -o koi.png

cf-ai image "sunset over a server rack" --model @cf/black-forest-labs/flux-2-klein-9b -o rack.png
```

`-o` sets the output path (default `cf-ai-<timestamp>.png`). Three output modes:

- `-o file.png` — decode base64 and save as PNG
- `--base64` — print the raw base64 string to stdout (pipeable):
  `cf-ai image "logo" --model @cf/black-forest-labs/flux-2-klein-9b --base64 | base64 -d > out.png`
- `--json` — print the raw API response

Image profiles honor `--backend` per profile: `workers-ai`
uses `/ai/run/{model}`, `gateway` routes via
`gateway.ai.cloudflare.com/v1/{account}/{gateway}/workers-ai/{model}`.

## Ask

```sh
cf-ai ask <agent> <prompt...> [--model <m>] [--system <s>] [--temperature <n>] [--max-tokens <n>] [-o out.png] [--json] [--env]
```

- `--json` prints the raw API response instead of just the message text.
- `--env` skips stored credentials and reads `CF_AI_ACCOUNT_ID`, `CF_AI_TOKEN`, optional `CF_AI_BACKEND` / `CF_AI_GATEWAY_ID` from the environment (CI-friendly):

```sh
CF_AI_ACCOUNT_ID=xxx CF_AI_TOKEN=yyy cf-ai ask coder "hi" --env
```

## Agent skill

This repo ships a reusable agent skill at [`skills/cf-ai/SKILL.md`](skills/cf-ai/SKILL.md)
(compatible with Claude Code, opencode, and other SKILL.md harnesses) that teaches AI
agents how to install, authenticate, and drive `cf-ai` — including model ID formats,
agent profiles, and image generation.

## Notes

- Requires a Cloudflare API token; the gateway path works with BYOK/Unified Billing tokens, the Workers AI path with a Workers AI (Read + Edit) token.
- Non-zero exit codes on errors; provider error messages are surfaced as-is.
