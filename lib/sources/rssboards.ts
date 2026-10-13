import { XMLParser } from "fast-xml-parser";
import { RawJob, Settings } from "../types";
import { arr, cleanHtml, decodeEntities, fetchText, toIso } from "../util";

// Небольшие доски удалёнки с официальными RSS-лентами
const UA = { headers: { "User-Agent": "JobSearchTool/1.0 (local)" } };

export async function jobspresso(_s: Settings): Promise<RawJob[]> {
  const xml = await fetchText("https://jobspresso.co/feed/?post_type=job_listing", UA);
  return arr<any>(new XMLParser().parse(xml)?.rss?.channel?.item).map((it) => {
    // dc:creator: «Компания<br>⚲ Локация»
    const creator = decodeEntities(String(it["dc:creator"] ?? ""));
    const [company, place] = creator.split(/<br\s*\/?>/i).map((x) => x.replace(/⚲| /g, " ").trim());
    return {
      source: "jobspresso" as const,
      sourceLabel: "Jobspresso",
      url: it.link,
      title: decodeEntities(String(it.title ?? "")),
      company: company ?? "",
      location: place ? `Remote · ${place}` : "Remote",
      tags: arr(it.category).map(String).slice(0, 6),
      description: cleanHtml(String(it["content:encoded"] ?? it.description ?? "")),
      postedAt: toIso(it.pubDate),
      enriched: true,
    };
  });
}

export async function nodesk(_s: Settings): Promise<RawJob[]> {
  const xml = await fetchText("https://nodesk.co/remote-jobs/index.xml", UA);
  return arr<any>(new XMLParser().parse(xml)?.rss?.channel?.item).map((it) => {
    const full = decodeEntities(String(it.title ?? ""));
    const m = full.match(/^(.*)\s+at\s+(.+)$/);
    return {
      source: "nodesk" as const,
      sourceLabel: "NoDesk",
      url: it.link,
      title: m?.[1] ?? full,
      company: m?.[2] ?? "",
      location: "Remote",
      tags: [],
      description: cleanHtml(String(it.description ?? "").replace(/\n/g, "<br>")),
      postedAt: toIso(it.pubDate),
      enriched: true,
    };
  });
}
