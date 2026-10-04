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
    throw new Error(`API error ${res.status}: ${extractApiError(json, text, res.statusText)}`);
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

function extractApiError(json: any, text: string, statusText: string): string {
  const e = json?.error;
  return (
    (typeof e === "string" ? e : undefined) ??
    (Array.isArray(e) ? e[0]?.message : undefined) ??
    (!Array.isArray(e) && e?.message ? e.message : undefined) ??
    json?.errors?.[0]?.message ??
    json?.messages?.[0]?.message ??
    json?.message ??
    (text ? text.slice(0, 500) : statusText)
  );
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
    () => {
      const form = new FormData();
      for (const [key, value] of Object.entries(inputs)) {
        form.append(key, typeof value === "string" ? value : JSON.stringify(value));
      }
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
      lastError = extractApiError(json, text, res.statusText);
      if (res.status === 400 && i < attempts.length - 1) {
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

export type TtsOptions = {
  auth: Auth;
  model: string;
  text: string;
  speaker?: string;
  lang?: string;
  encoding?: string;
  container?: string;
};

export type TtsResult = { bytes: Uint8Array; contentType: string | null };

export async function runTts(opts: TtsOptions): Promise<TtsResult> {
  const url =
    opts.auth.backend === "gateway"
      ? `https://gateway.ai.cloudflare.com/v1/${opts.auth.accountId}/${opts.auth.gatewayId ?? "home-ai"}/workers-ai/${opts.model}`
      : `https://api.cloudflare.com/client/v4/accounts/${opts.auth.accountId}/ai/run/${opts.model}`;

  const base: Record<string, unknown> = {};
  if (opts.speaker) base.speaker = opts.speaker;
  if (opts.lang) base.lang = opts.lang;
  if (opts.encoding) base.encoding = opts.encoding;
  if (opts.container) base.container = opts.container;

  const attempts: Array<() => RequestInit> = [
    () => ({
      method: "POST",
      headers: { ...authHeaders(opts.auth), "Content-Type": "application/json" },
      body: JSON.stringify({ ...base, text: opts.text }),
    }),
    () => ({
      method: "POST",
      headers: { ...authHeaders(opts.auth), "Content-Type": "application/json" },
      body: JSON.stringify({ ...base, prompt: opts.text }),
    }),
  ];

  let lastError = "";
  for (let i = 0; i < attempts.length; i++) {
    let res: Response;
    try {
      res = await fetch(url, attempts[i]());
    } catch (err) {
      throw new Error(`Network error calling ${url}: ${err instanceof Error ? err.message : String(err)}`);
    }

    const contentType = res.headers.get("content-type");

    if (!res.ok) {
      const text = await res.text();
      let json: any = null;
      try {
        json = JSON.parse(text);
      } catch {
        json = null;
      }
      lastError = extractApiError(json, text, res.statusText);
      if (res.status === 400 && i < attempts.length - 1) {
        continue;
      }
      throw new Error(`API error ${res.status}: ${lastError}`);
    }

    if (contentType?.includes("application/json")) {
      const json: any = await res.json();
      const base64 = json?.result?.audio ?? json?.audio;
      if (typeof base64 !== "string" || base64 === "") {
        throw new Error(`Unexpected response shape: ${JSON.stringify(json).slice(0, 500)}`);
      }
      return { bytes: new Uint8Array(Buffer.from(base64, "base64")), contentType: null };
    }

    const bytes = new Uint8Array(await res.arrayBuffer());
    if (bytes.length === 0) {
      throw new Error("Empty audio response from API.");
    }
    return { bytes, contentType };
  }
  throw new Error(`API error 400: ${lastError}`);
}

const AUDIO_EXT: Record<string, string> = {
  "audio/mpeg": ".mp3",
  "audio/mp3": ".mp3",
  "audio/wav": ".wav",
  "audio/x-wav": ".wav",
  "audio/wave": ".wav",
  "audio/ogg": ".ogg",
  "audio/flac": ".flac",
  "audio/aac": ".aac",
  "audio/mp4": ".m4a",
  "audio/opus": ".opus",
  "audio/l16": ".raw",
  "audio/pcm": ".raw",
};

export function audioExtFor(contentType: string | null, bytes?: Uint8Array): string {
  if (bytes && bytes.length >= 12) {
    if (bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46 && bytes[8] === 0x57 && bytes[9] === 0x41 && bytes[10] === 0x56 && bytes[11] === 0x45) return ".wav";
    if (bytes[0] === 0x49 && bytes[1] === 0x44 && bytes[2] === 0x33) return ".mp3";
    if (bytes[0] === 0xff && (bytes[1] & 0xe0) === 0xe0) return ".mp3";
    if (bytes[0] === 0x4f && bytes[1] === 0x67 && bytes[2] === 0x67 && bytes[3] === 0x53) return ".ogg";
    if (bytes[0] === 0x66 && bytes[1] === 0x4c && bytes[2] === 0x61 && bytes[3] === 0x43) return ".flac";
  }
  if (!contentType) return ".mp3";
  const base = contentType.split(";")[0].trim().toLowerCase();
  return AUDIO_EXT[base] ?? ".mp3";
}

function authHeaders(auth: Auth): Record<string, string> {
  return { Authorization: `Bearer ${auth.token}` };
}
