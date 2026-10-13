import { AiVerdict, Job, Settings } from "./types";
import { hash, htmlToText, normKey } from "./util";

const FALLBACK_MODELS = ["openrouter/free", "google/gemma-4-31b-it:free", "nvidia/nemotron-3-super-120b-a12b:free"];

/** Сколько вакансий отправлять в одном запросе: экономит дневной лимит бесплатных моделей */
export const AI_BATCH = 5;

/** Ключ кэша оценок: одна и та же вакансия с разных площадок оценивается один раз */
export function aiCacheKey(job: Pick<Job, "title" | "company">): string {
  return hash(normKey(job.title) + "|" + normKey(job.company));
}

/** Оценка из кэша действительна, пока не поменялись резюме и ключевые слова */
export function profileHash(s: Settings): string {
  return hash(
    [s.profile.trim(), s.keywords.join(","), s.seniority.join(","), s.minSalaryUsd, s.aiRejectRules.join("\n")].join("|"),
  );
}

// Абзацы с требованиями — их нельзя терять при обрезке длинного описания
const REQ =
  /requirement|qualification|must have|you have|you bring|experience|years?|yrs|требован|ожидаем|опыт|лет|года|mitbringen|anforderung|erfahrung|jahre|profil/i;

/** Укорачивает длинное описание, сохраняя начало и все фрагменты с требованиями */
function condense(text: string, limit: number): string {
  if (text.length <= limit) return text;
  const head = text.slice(0, Math.floor(limit * 0.4));
  const rest = text.slice(head.length);
  const parts = rest.split(/(?<=[.!?;:])\s+|\s{2,}/);
  const picked: string[] = [];
  let len = head.length;
  for (const p of parts) {
    if (!REQ.test(p)) continue;
    if (len + p.length + 3 > limit) break;
    picked.push(p);
    len += p.length + 3;
  }
  return picked.length ? `${head} … ${picked.join(" … ")}` : text.slice(0, limit);
}

function prompt(jobs: Job[], s: Settings) {
  const rules = s.aiRejectRules.map((r) => r.trim()).filter(Boolean);
  // Бюджет на вакансию: у бесплатных моделей контекст 200k+, пачка из 5 укладывается с запасом
  const per = Math.min(6000, Math.floor(28000 / jobs.length));
  const blocks = jobs
    .map(
      (job, i) => `### ВАКАНСИЯ ${i + 1}
Название: ${job.title}
Компания: ${job.company || "не указана"}
Локация/ограничения: ${job.location}
Зарплата: ${job.salary || "не указана"}
Тип: ${job.employment || "не указан"}
Теги: ${job.tags.filter((t) => !t.startsWith("поиск: ")).join(", ")}
Описание:
${condense(htmlToText(job.description), per) || "(описания нет — оценивай по названию и компании, отметь это в cons)"}`,
    )
    .join("\n\n");
  return `Ты — карьерный консультант. Кандидат живёт в Казахстане и ищет ТОЛЬКО удалённую работу (может работать как ИП/контрактор, получать оплату в USD/EUR через Payoneer/Wise/Deel/крипту, часовой пояс UTC+5).

ПРОФИЛЬ КАНДИДАТА:
${s.profile || "(не заполнен)"}
Ключевые навыки/интересы: ${s.keywords.join(", ")}${
    rules.length
      ? `

ПРАВИЛА ОТСЕВА (жёсткие: если вакансия нарушает хотя бы одно — она кандидату не подходит):
${rules.map((r, i) => `${i + 1}. ${r}`).join("\n")}

Как проверять правила:
- Текст вакансии может быть на любом языке (русский, английский, немецкий и т.д.) — понимай смысл, а не ищи слова. «3+ years», «от 3 лет», «mindestens 3 Jahre», «Senior with 5 years» — это всё требования к опыту.
- Правило нарушено, ТОЛЬКО если в тексте есть явное подтверждение. Если информации нет или она неоднозначна — правило НЕ нарушено.
- Приведи точную цитату из вакансии (на языке оригинала, до 150 символов), которая доказывает нарушение.`
      : ""
  }
${s.seniority.length ? `Желаемый уровень: ${s.seniority.join(", ")}` : ""}
${s.minSalaryUsd ? `Минимальная зарплата: $${s.minSalaryUsd}/мес` : ""}

${blocks}

Оцени КАЖДУЮ вакансию отдельно: насколько она подходит кандидату. Особенно внимательно проверь, может ли человек из Казахстана реально на неё попасть (ограничения по стране, гражданству, разрешению на работу, часовому поясу, юрлицу).

Ответь СТРОГО одним JSON-объектом без markdown, в results ровно ${jobs.length} элемент(ов) в том же порядке:
{"results": [{"n": <номер вакансии>, "score": <0-100 общая пригодность>, "verdict": "<одна фраза-вывод по-русски>", "summary": "<2-4 предложения по-русски: что за компания, что делать, требования>", "pros": ["<плюс>", ...], "cons": ["<минус/риск>", ...], "kz": "yes" | "no" | "unclear", "stack": ["<технология>", ...], "salary": "<зарплата если найдена в тексте, иначе пустая строка>"${
    rules.length ? `, "reject": null | {"rule": <номер нарушенного правила>, "quote": "<цитата из вакансии>"}` : ""
  }}]}`;
}

/** Чинит типовые поломки JSON от небольших моделей: висячие запятые, «умные» кавычки, переносы в строках */
function repairJson(s: string): string {
  return s
    .replace(/[“”]/g, '\\"')
    .replace(/,\s*([}\]])/g, "$1")
    .replace(/"(?:[^"\\]|\\.)*"/g, (str) => str.replace(/\n/g, "\\n").replace(/\t/g, " "));
}

/** Выделяет из текста все объекты верхнего уровня внутри массива results — запасной путь, если общий JSON битый */
function extractObjects(text: string): any[] {
  const out: any[] = [];
  let depth = 0,
    start = -1,
    inStr = false,
    esc = false;
  const body = text.slice(Math.max(0, text.indexOf("[")));
  for (let i = 0; i < body.length; i++) {
    const c = body[i];
    if (inStr) {
      if (esc) esc = false;
      else if (c === "\\") esc = true;
      else if (c === '"') inStr = false;
      continue;
    }
    if (c === '"') inStr = true;
    else if (c === "{") {
      if (depth === 0) start = i;
      depth++;
    } else if (c === "}") {
      depth--;
      if (depth === 0 && start >= 0) {
        const chunk = body.slice(start, i + 1);
        try {
          out.push(JSON.parse(chunk));
        } catch {
          try {
            out.push(JSON.parse(repairJson(chunk)));
          } catch {
            /* пропускаем неразборчивую вакансию, остальные сохраняем */
          }
        }
        start = -1;
      }
    }
  }
  return out;
}

function extractJson(text: string): any {
  const cleaned = text.replace(/```(?:json)?/gi, "").trim();
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start < 0 || end < start) throw new Error("модель вернула не JSON");
  const raw = cleaned.slice(start, end + 1);
  try {
    return JSON.parse(raw);
  } catch {
    try {
      return JSON.parse(repairJson(raw));
    } catch (e) {
      const objs = extractObjects(raw).filter((o) => o && o.score != null);
      if (objs.length) return { results: objs };
      throw e;
    }
  }
}

async function callModel(model: string, key: string, content: string, maxTokens = 1200): Promise<{ text: string; model: string }> {
  const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
      "HTTP-Referer": "http://localhost:3000",
      "X-Title": "JobFinder Local",
    },
    body: JSON.stringify({
      model,
      messages: [{ role: "user", content }],
      temperature: 0.2,
      max_tokens: maxTokens,
    }),
    signal: AbortSignal.timeout(180000),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.error) {
    throw new Error(`${model}: ${data.error?.message || `HTTP ${res.status}`}`);
  }
  const text = data.choices?.[0]?.message?.content;
  if (!text) throw new Error(`${model}: пустой ответ`);
  return { text, model: data.model || model };
}

/** Бесплатные модели иногда отдают пустой ответ или временную ошибку провайдера — даём вторую попытку */
async function callWithRetry(model: string, key: string, content: string, maxTokens: number) {
  try {
    return await callModel(model, key, content, maxTokens);
  } catch (e: any) {
    if (!/пустой ответ|Provider returned error|timeout|aborted|HTTP 5\d\d|429/i.test(e.message)) throw e;
    await new Promise((r) => setTimeout(r, 3000));
    return callModel(model, key, content, maxTokens);
  }
}

export async function analyzeJobs(jobs: Job[], s: Settings): Promise<Map<string, AiVerdict>> {
  if (!s.openrouterKey) throw new Error("Добавьте ключ OpenRouter в настройках (бесплатно: openrouter.ai/keys)");
  if (!jobs.length) return new Map();
  const models = Array.from(new Set([s.aiModel || FALLBACK_MODELS[0], ...FALLBACK_MODELS]));
  const errors: string[] = [];
  const p = prompt(jobs, s);
  const ph = profileHash(s);
  const list = (v: any) => (Array.isArray(v) ? v.map(String).filter(Boolean).slice(0, 8) : []);
  for (const m of models) {
    try {
      const { text, model } = await callWithRetry(m, s.openrouterKey, p, 900 * jobs.length + 400);
      const j = extractJson(text);
      // Модели иногда возвращают один объект вместо массива, если вакансия одна
      const results: any[] = Array.isArray(j.results) ? j.results : Array.isArray(j) ? j : [j];
      const out = new Map<string, AiVerdict>();
      results.forEach((r, i) => {
        const idx = Number.isInteger(Number(r.n)) && Number(r.n) >= 1 && Number(r.n) <= jobs.length ? Number(r.n) - 1 : i;
        const job = jobs[idx];
        if (!job || out.has(job.id) || r.score == null) return;
        out.set(job.id, {
          score: Math.max(0, Math.min(100, Math.round(Number(r.score) || 0))),
          verdict: String(r.verdict ?? ""),
          summary: String(r.summary ?? ""),
          pros: list(r.pros),
          cons: list(r.cons),
          kz: ["yes", "no", "unclear"].includes(r.kz) ? r.kz : "unclear",
          stack: list(r.stack),
          salary: r.salary ? String(r.salary) : undefined,
          model,
          at: new Date().toISOString(),
          profileHash: ph,
          reject: parseReject(r.reject, s),
        });
      });
      if (!out.size) throw new Error(`${m}: в ответе нет оценок`);
      return out;
    } catch (e: any) {
      errors.push(e.message);
      // Невалидный ключ — нет смысла перебирать модели
      if (/401|user not found|invalid.*key|no auth/i.test(e.message)) break;
    }
  }
  throw new Error(errors.join(" | "));
}

export interface ProfileSuggestion {
  keywords: string[];
  mustHave: string[];
  exclude: string[];
  seniority: string[];
  minSalaryUsd: number;
  roles: string[];
  note: string;
  model: string;
}

/** Разбирает резюме и предлагает настройки поиска */
export async function extractProfile(s: Settings): Promise<ProfileSuggestion> {
  if (!s.openrouterKey) throw new Error("Добавьте ключ OpenRouter (бесплатно: openrouter.ai/keys)");
  if (s.profile.trim().length < 40) throw new Error("Вставьте резюме в поле профиля — сейчас оно почти пустое");
  const p = `Ты — IT-рекрутер. Ниже резюме кандидата из Казахстана, который ищет удалённую работу на зарубежных и русскоязычных площадках.
Подбери настройки для поиска вакансий.

РЕЗЮМЕ:
${s.profile.slice(0, 12000)}

Правила:
- keywords: 4-8 коротких поисковых запросов на английском в нижнем регистре, по которым площадки найдут подходящие вакансии: главный стек и названия ролей (например "react", "frontend", "node.js", "typescript"). Только то, в чём у кандидата реальный опыт. Без общих слов вроде "developer", "it", "remote".
- mustHave: 0-3 технологии, без которых вакансия точно не подойдёт (пусто, если кандидат универсал).
- exclude: 2-8 стоп-слов в нижнем регистре: чуждые кандидату технологии и роли, которые часто попадаются в выдаче, но не подходят (например "php", "1c", "sales"), плюс "security clearance".
- seniority: уровни из списка intern, junior, middle, senior, lead, подходящие по опыту (1-2 значения).
- minSalaryUsd: разумный минимум в USD в месяц для такого уровня на удалёнке; если в резюме указаны ожидания — используй их; 0, если непонятно.
- roles: 2-4 названия ролей, на которые стоит откликаться.
- note: одна фраза по-русски — кратко, кто кандидат.

Ответь СТРОГО одним JSON-объектом без markdown:
{"keywords":[],"mustHave":[],"exclude":[],"seniority":[],"minSalaryUsd":0,"roles":[],"note":""}`;
  const models = Array.from(new Set([s.aiModel || FALLBACK_MODELS[0], ...FALLBACK_MODELS]));
  const errors: string[] = [];
  const LEVELS = ["intern", "junior", "middle", "senior", "lead"];
  const list = (v: any, n: number) =>
    Array.isArray(v) ? Array.from(new Set(v.map((x) => String(x).trim().toLowerCase()).filter(Boolean))).slice(0, n) : [];
  for (const m of models) {
    try {
      const { text, model } = await callModel(m, s.openrouterKey, p);
      const j = extractJson(text);
      const keywords = list(j.keywords, 8);
      if (!keywords.length) throw new Error(`${m}: не вернула ключевые слова`);
      return {
        keywords,
        mustHave: list(j.mustHave, 3),
        exclude: list(j.exclude, 10),
        seniority: list(j.seniority, 2).filter((l) => LEVELS.includes(l)),
        minSalaryUsd: Math.max(0, Math.round(Number(j.minSalaryUsd) || 0)),
        roles: Array.isArray(j.roles) ? j.roles.map(String).slice(0, 4) : [],
        note: String(j.note ?? ""),
        model,
      };
    } catch (e: any) {
      errors.push(e.message);
      if (/401|user not found|invalid.*key|no auth/i.test(e.message)) break;
    }
  }
  throw new Error(errors.join(" | "));
}

function parseReject(v: any, s: Settings): AiVerdict["reject"] {
  if (!v || typeof v !== "object") return;
  const rules = s.aiRejectRules.map((r) => r.trim()).filter(Boolean);
  const n = Number(v.rule);
  // Модель может вернуть номер или текст правила
  const rule = Number.isInteger(n) && n >= 1 && n <= rules.length ? rules[n - 1] : typeof v.rule === "string" ? v.rule : "";
  const quote = String(v.quote ?? "").trim();
  // Без цитаты-доказательства не отсеиваем: защита от галлюцинаций
  if (!rule || quote.length < 3) return;
  return { rule, quote: quote.slice(0, 220) };
}
