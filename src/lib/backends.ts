import type { Auth } from "./config";

export type ChatMessage = { role: "system" | "user" | "assistant"; content: string };

export type ChatOptions = {
  auth: Auth;
  model: string;
  messages: ChatMessage[];
  temperature?: number;
  maxTokens?: number;
};

export type ChatResult = { text: string; raw: unknown };

export function resolveEndpoint(auth: Auth): { url: string; headers: Record<string, string> } {
  if (auth.backend === "gateway") {
    const gatewayId = auth.gatewayId ?? "home-ai";
    return {
      url: `https://gateway.ai.cloudflare.com/v1/${auth.accountId}/${gatewayId}/compat/chat/completions`,
      headers: { Authorization: `Bearer ${auth.token}` },
    };
  }
  return {
    url: `https://api.cloudflare.com/client/v4/accounts/${auth.accountId}/ai/v1/chat/completions`,
    headers: { Authorization: `Bearer ${auth.token}` },
  };
}

export async function chat(opts: ChatOptions): Promise<ChatResult> {
  const { url, headers } = resolveEndpoint(opts.auth);
  const body: Record<string, unknown> = {
    model: opts.model,
    messages: opts.messages,
    stream: false,
  };
  if (opts.temperature !== undefined) body.temperature = opts.temperature;
  if (opts.maxTokens !== undefined) body.max_tokens = opts.maxTokens;

  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: { ...headers, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  } catch (err) {
    throw new Error(`Network error calling ${url}: ${err instanceof Error ? err.message : String(err)}`);
  }

  const text = await res.text();
  let json: any = null;
  try {
    json = JSON.parse(text);
  } catch {
    json = null;
  }

  if (!res.ok) {
    const e = json?.error;
    const message =
      (typeof e === "string" ? e : undefined) ??
      (Array.isArray(e) ? e[0]?.message : undefined) ??
      (!Array.isArray(e) && e?.message ? e.message : undefined) ??
      json?.errors?.[0]?.message ??
      json?.messages?.[0]?.message ??
      json?.message ??
      (text ? text.slice(0, 500) : res.statusText);
    throw new Error(`API error ${res.status}: ${message}`);
  }

  if (json === null) {
    throw new Error(`Unexpected non-JSON response: ${text.slice(0, 500)}`);
  }

  const content = json?.choices?.[0]?.message?.content;
  if (typeof content !== "string") {
    throw new Error(`Unexpected response shape: ${JSON.stringify(json).slice(0, 500)}`);
  }
  return { text: content, raw: json };
}

export function maskToken(token: string): string {
  if (token.length <= 10) return "•".repeat(token.length);
  return `${token.slice(0, 6)}••••${token.slice(-4)}`;
}

export type ImageOptions = {
  auth: Auth;
  model: string;
  prompt: string;
};

export type ImageResult = { base64: string; raw: unknown };

export async function runImage(opts: ImageOptions): Promise<ImageResult> {
  const url =
    opts.auth.backend === "gateway"
      ? `https://gateway.ai.cloudflare.com/v1/${opts.auth.accountId}/${opts.auth.gatewayId ?? "home-ai"}/workers-ai/${opts.model}`
      : `https://api.cloudflare.com/client/v4/accounts/${opts.auth.accountId}/ai/run/${opts.model}`;

  const inputs: Record<string, unknown> = { prompt: opts.prompt };
  const attempts: Array<() => RequestInit> = [
    () => ({
      method: "POST",
      headers: { ...authHeaders(opts.auth), "Content-Type": "application/json" },
      body: JSON.stringify(inputs),
    }),
    () => ({
      method: "POST",
      headers: { ...authHeaders(opts.auth), "Content-Type": "application/json" },
      body: JSON.stringify({
        multipart: { body: inputs, contentType: "application/json" },
      }),
    }),
    () => {
      const form = new FormData();
      form.append("prompt", opts.prompt);
      return { method: "POST", headers: authHeaders(opts.auth), body: form };
    },
  ];

  let lastError = "";
  for (let i = 0; i < attempts.length; i++) {
    let res: Response;
    try {
      res = await fetch(url, attempts[i]());
    } catch (err) {
      throw new Error(`Network error calling ${url}: ${err instanceof Error ? err.message : String(err)}`);
    }

    const text = await res.text();
    let json: any = null;
    try {
      json = JSON.parse(text);
    } catch {
      json = null;
    }

    if (!res.ok) {
      const e = json?.error;
      lastError =
        (typeof e === "string" ? e : undefined) ??
        (Array.isArray(e) ? e[0]?.message : undefined) ??
        (!Array.isArray(e) && e?.message ? e.message : undefined) ??
        json?.errors?.[0]?.message ??
        json?.messages?.[0]?.message ??
        json?.message ??
        (text ? text.slice(0, 500) : res.statusText);
      if (res.status === 400 && /multipart/i.test(lastError) && i < attempts.length - 1) {
        continue;
      }
      throw new Error(`API error ${res.status}: ${lastError}`);
    }

    if (json === null) {
      throw new Error(`Unexpected non-JSON response: ${text.slice(0, 500)}`);
    }

    const base64 = json?.result?.image ?? json?.image;
    if (typeof base64 !== "string" || base64 === "") {
      throw new Error(`Unexpected response shape: ${JSON.stringify(json).slice(0, 500)}`);
    }
    return { base64, raw: json };
  }
  throw new Error(`API error 400: ${lastError}`);
}

function authHeaders(auth: Auth): Record<string, string> {
  return { Authorization: `Bearer ${auth.token}` };
}
