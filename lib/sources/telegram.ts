import { RawJob, Settings } from "../types";
import { cleanHtml, fetchText, htmlToText, toIso } from "../util";

// Публичное веб-превью каналов: https://t.me/s/<channel>
export async function telegram(s: Settings): Promise<RawJob[]> {
  const out: RawJob[] = [];
  const errors: string[] = [];
  for (const raw of s.telegramChannels) {
    const ch = raw.replace(/^@/, "").replace(/^https?:\/\/t\.me\/(s\/)?/, "").trim();
    if (!ch) continue;
    try {
      const html = await fetchText(`https://t.me/s/${ch}`);
      const blocks = html.split('class="tgme_widget_message_wrap').slice(1);
      for (const b of blocks) {
        const post = b.match(/data-post="([^"]+)"/)?.[1];
        const textHtml = b.match(/<div class="tgme_widget_message_text[^"]*"[^>]*>([\s\S]*?)<\/div>/)?.[1];
        if (!post || !textHtml) continue;
        const withBreaks = textHtml.replace(/<br\s*\/?>/gi, "\n");
        const text = withBreaks
          .split("\n")
          .map((l) => htmlToText(l))
          .join("\n");
        if (text.length < 80) continue;
        const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);
        const title = (lines.find((l) => /[a-zа-яё]{3}/i.test(l)) ?? lines[0] ?? "")
          .replace(/^[^a-zа-яё0-9]+/i, "")
          .slice(0, 140);
        const field = (re: RegExp) => text.match(re)?.[1]?.trim();
        out.push({
          source: "telegram",
          sourceLabel: `TG @${ch}`,
          url: `https://t.me/${post}`,
          title,
          company: field(/(?:компания|company)\s*[:—–-]\s*([^\n]{2,60})/i) ?? "",
          location: field(/(?:локация|location|формат|format)\s*[:—–-]\s*([^\n]{2,60})/i) ?? "Telegram",
          geo: "maybe",
          tags: Array.from(new Set((text.match(/#[\wа-яё]+/gi) ?? []).map((t) => t.slice(1)))).slice(0, 10),
          salary: field(/(?:зп|з\/п|зарплата|salary|оклад|вилка)\s*[:—–-]?\s*([^\n]{2,60})/i),
          description: cleanHtml(textHtml),
          postedAt: toIso(b.match(/<time datetime="([^"]+)"/)?.[1]),
        });
      }
    } catch (e: any) {
      errors.push(`${ch}: ${e.message}`);
    }
  }
  if (!out.length && errors.length) throw new Error(errors.join("; "));
  return out;
}
