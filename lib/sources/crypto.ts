import { XMLParser } from "fast-xml-parser";
import { RawJob, Settings } from "../types";
import { arr, cleanHtml, fetchText, toIso } from "../util";

// Web3/крипто-доски: там чаще всего берут из любой страны
export async function cryptojobslist(_s: Settings): Promise<RawJob[]> {
  const xml = await fetchText("https://api.cryptojobslist.com/jobs.rss");
  const items = arr<any>(new XMLParser({ ignoreAttributes: false }).parse(xml)?.rss?.channel?.item);
  return items.map((it) => {
    const title = String(it.title ?? "");
    // Убираем из описания блок «Tags: …» со ссылками на категории доски
    const desc = String(it.description ?? "")
      .replace(/<img[^>]*>/g, "")
      .replace(/<p>\s*Tags:[\s\S]*?(?=<h\d|<p>(?!\s*Tags))/i, "");
    const company = String(it["dc:creator"] ?? it.author ?? "").trim() || (it.link?.match(/-at-([a-z0-9-]+)$/)?.[1]?.replace(/-/g, " ") ?? "");
    return {
      source: "cryptojobslist" as const,
      sourceLabel: "CryptoJobsList",
      url: it.link,
      title,
      company,
      location: String(it["media:location"] ?? "Remote"),
      tags: arr(it.category).map(String).slice(0, 8),
      description: cleanHtml(desc),
      postedAt: toIso(it.pubDate),
    };
  });
}

export async function cryptocurrencyjobs(_s: Settings): Promise<RawJob[]> {
  const xml = await fetchText("https://cryptocurrencyjobs.co/index.xml");
  const items = arr<any>(new XMLParser().parse(xml)?.rss?.channel?.item);
  return items.map((it) => {
    const full = String(it.title ?? "");
    const m = full.match(/^(.*)\s+at\s+(.+)$/);
    const desc = String(it.description ?? "");
    const where = desc.match(/can be done remotely ([^.]+)|remote(?:ly)? (?:in|from) ([^.]+)/i);
    return {
      source: "cryptocurrencyjobs" as const,
      sourceLabel: "Cryptocurrency Jobs",
      url: it.link,
      title: m?.[1] ?? full,
      company: m?.[2] ?? "",
      location: where ? `Remote ${where[1] ?? where[2]}` : /remote/i.test(desc) ? "Remote" : "См. описание",
      tags: [],
      description: cleanHtml(`<p>${desc}</p>`),
      postedAt: toIso(it.pubDate),
    };
  });
}
