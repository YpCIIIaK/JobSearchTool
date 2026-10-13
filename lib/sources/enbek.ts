import { RawJob, Settings } from "../types";
import { cleanHtml, decodeEntities, politeFetchText, toIso } from "../util";
import { queries } from "./common";

// Enbek.kz — государственная биржа труда Казахстана. Публичные страницы поиска без входа, с паузами.
// Вакансии в основном офисные по городам КЗ — для удалёнки полезны как запасной вариант
const BASE = "https://www.enbek.kz";

const txt = (s?: string) => (s ? decodeEntities(s.replace(/<!--[\s\S]*?-->|<[^>]+>/g, " ")).replace(/\s+/g, " ").trim() : "");

export async function enbek(s: Settings): Promise<RawJob[]> {
  const out: RawJob[] = [];
  for (const q of queries(s)) {
    const html = await politeFetchText(`${BASE}/ru/search/vacancy?prof=${encodeURIComponent(q)}`);
    for (const block of html.split('class="item-list"').slice(1)) {
      const link = block.match(/href="(\/ru\/vacancy\/[^"]+)"/)?.[1];
      if (!link) continue;
      const profession = txt(block.match(/class="title">([\s\S]*?)<\/div>/)?.[1]);
      const subtitle = txt(block.match(/class="subtitle">([\s\S]*?)<\/div>/)?.[1]);
      const date = block.match(/Опубликовано\s+(\d{2})\.(\d{2})\.(\d{4})/);
      const experience = txt(block.match(/class="experience[^"]*">([\s\S]*?)<\/li>/)?.[1]);
      const schedule = txt(block.match(/class="time[^"]*">([\s\S]*?)<\/li>/)?.[1]);
      const location = txt(block.match(/class="location[^"]*">([\s\S]*?)<\/li>/)?.[1]);
      const salary = txt(block.match(/class="price">([\s\S]*?)<\/div>/)?.[1]);
      const area = txt(block.match(/class="profobl"><span>([\s\S]*?)<\/span>/)?.[1]);
      const remote = /удал[её]н|дистанц/i.test(`${subtitle} ${schedule} ${location}`);
      out.push({
        source: "enbek",
        sourceLabel: "Enbek.kz",
        url: BASE + link,
        title: subtitle || profession,
        company: txt(block.match(/class="company-name">([\s\S]*?)<\/span>/)?.[1]).replace(/^(Частная компания|ТОО|АО|ИП)\s+/i, ""),
        location: remote ? `Удалённо · ${location}` : location || "Казахстан",
        geo: "ok",
        tags: [area, experience, schedule, profession !== subtitle ? profession : ""].filter(Boolean),
        employment: schedule || undefined,
        salary: salary || undefined,
        description: cleanHtml(
          `<p>${[subtitle, profession, area, location, experience, schedule].filter(Boolean).join(" · ")}</p>`,
        ),
        postedAt: date ? toIso(`${date[3]}-${date[2]}-${date[1]}`) : undefined,
      });
    }
  }
  return out;
}

/** Полное описание со страницы вакансии */
export async function enbekFullDescription(url: string): Promise<string | undefined> {
  const html = (await politeFetchText(url)).replace(/<!--[\s\S]*?-->/g, "");
  // Страница состоит из блоков <div class="single-line"><div class="label">…</div><div class="value">…</div></div>
  const parts: string[] = [];
  for (const m of html.matchAll(/class="single-line">\s*<div class="label">([\s\S]*?)<\/div>\s*<div class="value">([\s\S]*?)<\/div>\s*<\/div>/g)) {
    const label = txt(m[1]);
    if (label && m[2].trim()) parts.push(`<h3>${label}</h3>${m[2]}`);
  }
  return parts.length ? cleanHtml(parts.join("")) : undefined;
}
