import { XMLParser } from "fast-xml-parser";
import { RawJob, Settings } from "../types";
import { arr, cleanHtml, decodeEntities, fetchText, toIso } from "../util";
import { queries } from "./common";

// Официальная RSS-лента Djinni: фильтр по ключевому слову и удалёнке, полное описание в ленте
export async function djinni(s: Settings): Promise<RawJob[]> {
  const parser = new XMLParser();
  const out: RawJob[] = [];
  for (const q of queries(s)) {
    const xml = await fetchText(
      `https://djinni.co/jobs/rss/?all_keywords=${encodeURIComponent(q)}&employment=remote`,
      { headers: { "User-Agent": "JobSearchTool/1.0 (local)" } },
    );
    for (const it of arr<any>(parser.parse(xml)?.rss?.channel?.item)) {
      const html = decodeEntities(String(it.description ?? ""));
      // Компания обычно первой фразой описания: «X — продуктова IT-компанія…» / «At X we…»
      const company =
        html.replace(/<[^>]+>/g, " ").match(/^\s*([A-ZА-ЯЁІЇЄ][\w.&'’ -]{1,40}?)\s+(?:—|–|-|is|це|это)\s/)?.[1]?.trim() ?? "";
      out.push({
        source: "djinni",
        sourceLabel: "Djinni",
        url: it.link,
        title: String(it.title ?? ""),
        company,
        location: "Remote",
        geo: "maybe",
        tags: arr(it.category).map(String).filter(Boolean),
        description: cleanHtml(html),
        postedAt: toIso(it.pubDate),
      });
    }
  }
  return out;
}
