import { Job } from "./types";
import { hash, htmlToText } from "./util";

// Юридические формы и шум в названиях компаний
const LEGAL =
  /\b(inc|llc|ltd|limited|gmbh|ag|ab|as|sa|s\.a|bv|b\.v|corp|corporation|co|plc|oy|srl|sarl|pte|pty|kft|sp\.? z o\.?o|тоо|ооо|ао|зао|ип|частная компания)\b\.?/gi;
// Слова в названии вакансии, которые не меняют её суть
const TITLE_NOISE = new Set([
  "remote", "remotely", "fully", "worldwide", "anywhere", "global", "hybrid", "onsite", "office", "contract", "contractor",
  "freelance", "fulltime", "full", "time", "part", "parttime", "job", "position", "role", "opening", "hiring", "urgent", "new",
  "mwd", "fmd", "mfd", "wmd", "mfx", "fmx", "all", "genders", "gn", "d", "m", "w", "f", "x",
  "удаленно", "удалённо", "удаленка", "удалёнка", "удаленная", "удалённая", "работа", "вакансия", "срочно",
  "europe", "eu", "emea", "us", "usa", "uk", "latam", "apac", "cet", "kz", "kazakhstan",
]);

export function normCompany(c: string): string {
  return c.toLowerCase().replace(LEGAL, " ").replace(/[^a-zа-яё0-9]+/gi, "");
}

export function titleTokens(t: string): string[] {
  const words = t
    .toLowerCase()
    .replace(/ё/g, "е")
    .replace(/[^a-zа-я0-9+#.]+/gi, " ")
    .split(/\s+/)
    .map((w) => w.replace(/^\.+|\.+$/g, ""))
    .filter((w) => w && !TITLE_NOISE.has(w));
  return Array.from(new Set(words)).sort();
}

/** Ключ группы дублей: одна и та же вакансия с разных площадок даёт одинаковый ключ */
export function dupKey(j: Pick<Job, "title" | "company" | "description">): string {
  const tokens = titleTokens(j.title).join(" ");
  const company = normCompany(j.company);
  if (company) return hash(`c:${company}|${tokens}`);
  // Без компании название слишком общее («Frontend Developer») — добавляем отпечаток начала описания
  const body = htmlToText(j.description).toLowerCase().replace(/[^a-zа-яё0-9]+/gi, "").slice(0, 240);
  return hash(`t:${tokens}|${body}`);
}

/** Кого показывать из группы: ваш выбор → проверенные ИИ → с полным описанием → лучший рейтинг */
export function pickRepresentative<T extends Pick<Job, "status" | "ai" | "enriched" | "score">>(
  group: T[],
  descLen: (j: T) => number,
): T {
  const weight = (j: T) =>
    (j.status === "applied" ? 1e6 : j.status === "saved" ? 5e5 : 0) +
    (j.ai ? 1e4 : 0) +
    (j.enriched ? 5e3 : 0) +
    Math.min(4000, descLen(j)) +
    j.score;
  return group.reduce((best, j) => (weight(j) > weight(best) ? j : best));
}
