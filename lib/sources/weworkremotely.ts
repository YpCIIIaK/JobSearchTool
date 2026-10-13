import { XMLParser } from "fast-xml-parser";
import { RawJob, Settings } from "../types";
import { arr, cleanHtml, fetchText, toIso } from "../util";

const FEEDS = [
  "remote-programming-jobs",
  "remote-full-stack-programming-jobs",
  "remote-front-end-programming-jobs",
  "remote-back-end-programming-jobs",
  "remote-devops-sysadmin-jobs",
  "remote-design-jobs",
  "remote-product-jobs",
  "remote-customer-support-jobs",
  "remote-sales-and-marketing-jobs",
  "all-other-remote-jobs",
];

export async function weworkremotely(_s: Settings): Promise<RawJob[]> {
  const parser = new XMLParser({ ignoreAttributes: false });
  const out: RawJob[] = [];
  const results = await Promise.allSettled(
    FEEDS.map((f) => fetchText(`https://weworkremotely.com/categories/${f}.rss`)),
  );
  for (const r of results) {
    if (r.status !== "fulfilled") continue;
    for (const it of arr<any>(parser.parse(r.value)?.rss?.channel?.item)) {
      const full = String(it.title ?? "");
      const idx = full.indexOf(":");
      out.push({
        source: "weworkremotely",
        sourceLabel: "We Work Remotely",
        url: it.link,
        title: idx > 0 ? full.slice(idx + 1).trim() : full,
        company: idx > 0 ? full.slice(0, idx).trim() : "",
        companyLogo: it["media:content"]?.["@_url"],
        location: it.region || "Anywhere",
        tags: arr(it.category).map(String),
        employment: it.type,
        description: cleanHtml(String(it.description ?? "")),
        postedAt: toIso(it.pubDate),
      });
    }
  }
  if (!out.length && results.every((r) => r.status === "rejected"))
    throw (results[0] as PromiseRejectedResult).reason;
  return out;
}
