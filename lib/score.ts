import { GeoFit, Job, RawJob, Settings } from "./types";
import { htmlToText } from "./util";

function esc(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Регексп для ключевого слова: «node.js» ловит и nodejs, и node js */
function kwRegex(kw: string): RegExp {
  const k = kw.trim().toLowerCase();
  const body = esc(k).replace(/\\\.|\s+|-/g, "[\\s.\\-]?");
  return new RegExp(`(?<![a-zа-яё0-9])${body}(?![a-zа-яё0-9])`, "i");
}

const OK_GEO =
  /worldwide|anywhere|global|any location|kazakhstan|казахстан|\bcis\b|снг|central asia|ср\.?\s*азия|asia|удал[её]нн|remote$|^remote\b(?!.*(only|based))/i;
const MAYBE_GEO =
  /emea|apac|europe|европ|\beu\b|\bcet\b|gmt|utc|timezone|time zone|часов|uzbekistan|kyrgyz|georgia|armenia|serbia|turkey|cyprus|russia|росси|беларус/i;
const NO_GEO =
  /\b(usa?|u\.s\.?|united states|america|americas|canada|uk|united kingdom|england|latam|latin america|brazil|argentina|colombia|chile|peru|mexico|india|pakistan|philippines|indonesia|vietnam|japan|singapore|australia|new zealand|germany|deutschland|france|spain|portugal|italy|netherlands|belgium|sweden|norway|denmark|finland|switzerland|austria|poland|czechia|romania|ireland|israel|south africa|nigeria|kenya|egypt|uae|dubai|saudi arabia)\b/i;
const NO_TEXT =
  /(must|need to|required to) (be )?(based|located|reside|live) in (the )?(us|u\.s\.|usa|united states|canada|uk|eu)|us[- ]based only|us citizens? only|authori[sz]ed to work in the (us|united states|uk)|green card|security clearance|w-?2 only/i;

export function detectGeo(location: string, descText: string, hint?: GeoFit): GeoFit {
  if (hint === "no") return "no";
  if (NO_TEXT.test(descText.slice(0, 6000))) return "no";
  if (hint === "ok") return "ok";
  const loc = location.trim();
  if (/kazakhstan|казахстан|worldwide|anywhere|global/i.test(loc)) return "ok";
  if (NO_GEO.test(loc) && !MAYBE_GEO.test(loc) && !/asia/i.test(loc)) return "no";
  if (OK_GEO.test(loc)) return hint ?? "ok";
  if (MAYBE_GEO.test(loc)) return "maybe";
  return hint ?? "maybe";
}

const RATES: Record<string, number> = { USD: 1, EUR: 1.08, GBP: 1.27, RUB: 0.011, KZT: 0.002, CAD: 0.73, AUD: 0.66, PLN: 0.25 };

/** Грубая оценка верхней границы зарплаты в USD/мес. Нужна только для фильтра */
export function salaryUsdMonth(salary?: string): number | undefined {
  if (!salary) return;
  const s = salary.replace(/(\d)[\s ,](?=\d{3}\b)/g, "$1");
  const nums = (s.match(/\d+(?:\.\d+)?\s*[kк]?/gi) ?? [])
    .map((n) => (/[kк]/i.test(n) ? parseFloat(n) * 1000 : parseFloat(n)))
    .filter((n) => n >= 5);
  if (!nums.length) return;
  let cur = "USD";
  if (/€|eur/i.test(s)) cur = "EUR";
  else if (/£|gbp/i.test(s)) cur = "GBP";
  else if (/₽|rub|руб/i.test(s)) cur = "RUB";
  else if (/₸|kzt|тенге|тг/i.test(s)) cur = "KZT";
  else if (/cad/i.test(s)) cur = "CAD";
  else if (/aud/i.test(s)) cur = "AUD";
  else if (/pln|zł/i.test(s)) cur = "PLN";
  let v = Math.max(...nums) * RATES[cur];
  if (/hour|час|\/h\b|hr\b/i.test(s)) v *= 160;
  else if (/year|annual|год|yr|per annum|\/y\b/i.test(s) || (cur !== "RUB" && cur !== "KZT" && v > 25000)) v /= 12;
  return Math.round(v);
}

export function scoreJob(raw: RawJob, s: Settings): { score: number; matched: string[]; excluded: boolean; geo: GeoFit } {
  const descText = htmlToText(raw.description).toLowerCase();
  const title = raw.title.toLowerCase();
  const tags = raw.tags.join(" ").toLowerCase();
  const all = `${title} ${tags} ${descText}`;
  const geo = detectGeo(raw.location, descText, raw.geo);

  const excluded = s.exclude.some((w) => w.trim() && kwRegex(w).test(`${title} ${tags} ${descText.slice(0, 4000)}`));

  const matched: string[] = [];
  let pts = 0;
  for (const kw of s.keywords) {
    if (!kw.trim()) continue;
    const re = kwRegex(kw);
    const inTitle = re.test(title);
    const inTags = re.test(tags);
    const inDesc = re.test(descText);
    if (inTitle || inTags || inDesc) matched.push(kw);
    pts += (inTitle ? 30 : 0) + (inTags ? 12 : 0) + (inDesc ? 6 : 0);
  }
  const kwCount = s.keywords.filter((k) => k.trim()).length || 1;
  let score = Math.min(55, pts) + (matched.length / kwCount) * 25;

  if (s.mustHave.length && !s.mustHave.some((m) => m.trim() && kwRegex(m).test(all))) score -= 40;

  if (s.seniority.length) {
    const hit = s.seniority.some((lvl) => kwRegex(lvl).test(`${title} ${tags}`));
    const other = ["junior", "middle", "senior", "lead", "principal", "staff", "head", "intern"]
      .filter((l) => !s.seniority.some((x) => x.toLowerCase() === l))
      .some((l) => kwRegex(l).test(title));
    score += hit ? 8 : other ? -15 : 0;
  }

  if (raw.postedAt) {
    const days = (Date.now() - new Date(raw.postedAt).getTime()) / 864e5;
    score += days < 2 ? 10 : days < 7 ? 6 : days < 14 ? 3 : 0;
  }
  score += geo === "ok" ? 5 : geo === "no" ? -25 : 0;

  return { score: Math.max(0, Math.min(100, Math.round(score))), matched, excluded, geo };
}

// Площадки, чья гео-метка точная (список стран / регион поиска). Остальным пересчитываем по тексту,
// иначе однажды вычисленное значение «залипает» как подсказка
const GEO_AUTHORITATIVE = new Set(["himalayas", "hh"]);

export function rescore(job: Job, s: Settings): Job {
  const r = scoreJob({ ...job, geo: GEO_AUTHORITATIVE.has(job.source) ? job.geo : undefined }, s);
  return { ...job, score: r.score, matched: r.matched, geo: r.geo, salaryUsdMonth: salaryUsdMonth(job.salary) };
}
