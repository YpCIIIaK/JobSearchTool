import sanitizeHtml from "sanitize-html";
import crypto from "node:crypto";

export const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) JobFinderLocal/0.1";

export async function fetchText(url: string, init: RequestInit = {}, timeoutMs = 25000): Promise<string> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      ...init,
      signal: ctrl.signal,
      headers: { "User-Agent": UA, Accept: "*/*", ...(init.headers || {}) },
      cache: "no-store",
    });
    const body = await res.text();
    if (!res.ok) throw new Error(`HTTP ${res.status}: ${body.slice(0, 160)}`);
    return body;
  } finally {
    clearTimeout(t);
  }
}

export async function fetchJson<T = any>(url: string, init: RequestInit = {}, timeoutMs?: number): Promise<T> {
  return JSON.parse(await fetchText(url, init, timeoutMs)) as T;
}

export function cleanHtml(html: string): string {
  return sanitizeHtml(html || "", {
    allowedTags: [
      "p", "br", "ul", "ol", "li", "strong", "b", "em", "i", "a", "h1", "h2", "h3", "h4", "h5",
      "blockquote", "code", "pre", "div", "span", "hr", "table", "thead", "tbody", "tr", "td", "th",
    ],
    allowedAttributes: { a: ["href"] },
    transformTags: {
      a: sanitizeHtml.simpleTransform("a", { target: "_blank", rel: "noopener noreferrer" }),
      h1: "h3",
      h2: "h3",
    },
    allowedSchemes: ["http", "https", "mailto"],
  }).trim();
}

export function htmlToText(html: string): string {
  return sanitizeHtml(html || "", { allowedTags: [], allowedAttributes: {} })
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

export function textToHtml(text: string): string {
  const esc = text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  return esc
    .split(/\n{2,}/)
    .map((p) => `<p>${p.replace(/\n/g, "<br>")}</p>`)
    .join("");
}

export function hash(s: string): string {
  return crypto.createHash("sha1").update(s).digest("hex").slice(0, 16);
}

export function normKey(s: string): string {
  return s.toLowerCase().replace(/[^a-zа-яё0-9]+/gi, "");
}

export function toIso(v: unknown): string | undefined {
  if (v == null || v === "") return;
  const d = typeof v === "number" ? new Date(v < 1e12 ? v * 1000 : v) : new Date(String(v));
  return isNaN(d.getTime()) ? undefined : d.toISOString();
}

export function arr<T>(v: T | T[] | undefined | null): T[] {
  if (v == null) return [];
  return Array.isArray(v) ? v : [v];
}

export const BROWSER_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0 Safari/537.36";

const hostNext = new Map<string, Promise<void>>();
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Запрос к публичным страницам сайтов без API (hh, LinkedIn): строго по одному запросу на хост,
 * пауза 2–3.5 с между запросами, при 429 — одна повторная попытка после долгой паузы.
 */
export async function politeFetchText(url: string, init: RequestInit = {}): Promise<string> {
  const host = new URL(url).hostname.split(".").slice(-2).join(".");
  const prev = hostNext.get(host) ?? Promise.resolve();
  let release!: () => void;
  hostNext.set(host, new Promise<void>((r) => (release = r)));
  await prev;
  try {
    for (let attempt = 0; ; attempt++) {
      try {
        return await fetchText(url, {
          ...init,
          headers: {
            "User-Agent": BROWSER_UA,
            Accept: "text/html,application/xhtml+xml",
            "Accept-Language": "ru-RU,ru;q=0.9,en;q=0.8",
            ...(init.headers || {}),
          },
        });
      } catch (e: any) {
        if (attempt === 0 && /HTTP 429/.test(e.message)) {
          await sleep(15000);
          continue;
        }
        throw e;
      }
    }
  } finally {
    setTimeout(release, 2000 + Math.random() * 1500);
  }
}

export function decodeEntities(s: string): string {
  return s
    .replace(/&#34;|&quot;/g, '"')
    .replace(/&#39;|&#x27;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&amp;/g, "&");
}
