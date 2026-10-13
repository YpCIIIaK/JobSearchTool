import { Ats, FETCHERS } from "./sources/ats";
import { allJobs, getSettings } from "./store";
import { rank } from "./types";

export interface DiscoveredCompany {
  id: string; // "ashby:linear"
  name: string;
  remote: number; // открытых удалённых вакансий
  sample: string[]; // пара названий для наглядности
  matched: number; // сколько из них совпадают с вашими ключевыми словами
  from: "link" | "name";
}

const LINK_RE: [Ats, RegExp][] = [
  ["greenhouse", /(?:boards|job-boards)\.greenhouse\.io\/(?:embed\/job_board\?for=)?([a-z0-9][a-z0-9_-]{1,40})/gi],
  ["lever", /jobs\.lever\.co\/([a-z0-9][a-z0-9_-]{1,40})/gi],
  ["ashby", /jobs\.ashbyhq\.com\/([a-z0-9][a-z0-9._-]{1,40})/gi],
];
const SKIP_SLUGS = new Set(["embed", "api", "jobs", "careers", "v1", "boards"]);

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Варианты slug из названия компании: «Grafana Labs» → grafanalabs, grafana-labs, grafana */
function slugsFromName(name: string): string[] {
  const clean = name
    .toLowerCase()
    .replace(/\b(inc|llc|ltd|gmbh|corp|corporation|co|limited|plc|s\.?a|b\.?v|ag)\b\.?/g, "")
    .replace(/[^a-z0-9 ]+/g, " ")
    .trim();
  if (!clean || /[а-яё]/i.test(name)) return [];
  const words = clean.split(/\s+/).filter(Boolean);
  // Только полное название: догадка по первому слову даёт однофамильцев («Sanctuary Computer» ≠ «Sanctuary»)
  return Array.from(new Set([words.join(""), words.join("-")])).filter((s) => s.length >= 3);
}

/**
 * Ищет компании с открытыми удалёнными вакансиями на Greenhouse/Lever/Ashby через их официальные API.
 * Запросы последовательные с паузой — API открытые, но не нагружаем.
 */
export async function discoverCompanies(limit = 30): Promise<DiscoveredCompany[]> {
  const s = getSettings();
  const known = new Set(s.atsCompanies.map((c) => c.trim().toLowerCase()));
  const kw = s.keywords.map((k) => k.trim().toLowerCase()).filter(Boolean);

  // 1) Прямые ссылки на карьерные страницы в собранных вакансиях
  const fromLinks = new Map<string, string>(); // id → имя
  const jobs = allJobs();
  for (const j of jobs) {
    const text = `${j.url} ${j.description}`;
    for (const [ats, re] of LINK_RE) {
      for (const m of text.matchAll(re)) {
        const slug = m[1].toLowerCase().replace(/[._-]+$/, "");
        if (SKIP_SLUGS.has(slug)) continue;
        const id = `${ats}:${slug}`;
        if (!known.has(id)) fromLinks.set(id, j.company || slug);
      }
    }
  }

  // 2) Компании из лучших вакансий, у которых ещё нет подключённой карьерной страницы
  const knownSlugs = new Set([...known].map((c) => c.split(":")[1]));
  const names = Array.from(
    new Map(
      jobs
        .filter((j) => j.source !== "ats" && j.company && j.status !== "hidden")
        .sort((a, b) => rank(b) - rank(a))
        .map((j) => [j.company.toLowerCase(), j.company] as const),
    ).values(),
  ).slice(0, 25);

  const found: DiscoveredCompany[] = [];
  const tried = new Set<string>();

  const probe = async (id: string, name: string, from: DiscoveredCompany["from"]) => {
    if (tried.has(id) || known.has(id)) return false;
    tried.add(id);
    const [ats, slug] = id.split(":") as [Ats, string];
    try {
      const remote = await FETCHERS[ats](slug);
      await sleep(400);
      if (!remote.length) return false;
      const matched = remote.filter((r) => kw.some((k) => r.title.toLowerCase().includes(k))).length;
      found.push({ id, name: remote[0].company || name, remote: remote.length, sample: remote.slice(0, 3).map((r) => r.title), matched, from });
      return true;
    } catch {
      await sleep(250);
      return false;
    }
  };

  for (const [id, name] of fromLinks) {
    if (found.length >= limit) break;
    await probe(id, name, "link");
  }
  for (const name of names) {
    if (found.length >= limit) break;
    const slugs = slugsFromName(name).filter((sl) => !knownSlugs.has(sl));
    outer: for (const slug of slugs) {
      for (const ats of ["ashby", "greenhouse", "lever"] as Ats[]) {
        if (await probe(`${ats}:${slug}`, name, "name")) break outer;
      }
    }
  }
  return found.sort((a, b) => b.matched - a.matched || b.remote - a.remote);
}
