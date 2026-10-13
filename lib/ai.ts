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

/** Доступ к модели: OpenRouter с запасными бесплатными моделями или свой OpenAI-совместимый API */
interface Llm {
  models: string[];
  call(model: string, content: string, maxTokens?: number): Promise<{ text: string; model: string }>;
}

export function llmFor(s: Settings): Llm {
  if (s.aiProvider === "custom") {
    const list = s.aiCustomModels.map((m) => m.trim()).filter(Boolean);
    if (!s.aiBaseUrl || !list.length) throw new Error("Укажите адрес API и хотя бы одну модель своего провайдера в настройках");
    const base = s.aiBaseUrl.replace(/\/+$/, "");
    return {
      models: Array.from(new Set(list)),
      call: (model, content, maxTokens) => chat(`${base}/chat/completions`, s.aiApiKey, model, content, maxTokens),
    };
  }
  if (!s.openrouterKey) throw new Error("Добавьте ключ OpenRouter в настройках (бесплатно: openrouter.ai/keys)");
  return {
    // Свои модели по приоритету; встроенные бесплатные — последним запасом, если разрешено
    models: Array.from(
      new Set([
        ...s.aiModels.map((m) => m.trim()).filter(Boolean),
        ...(s.aiBuiltinFallback || !s.aiModels.some((m) => m.trim()) ? FALLBACK_MODELS : []),
      ]),
    ),
    call: (model, content, maxTokens) => openrouterChat(s.openrouterKey, model, content, maxTokens),
  };
}

async function chat(
  url: string,
  key: string,
  model: string,
  content: string,
  maxTokens = 1200,
  extra: Record<string, string> = {},
  body: Record<string, unknown> = {},
): Promise<{ text: string; model: string }> {
  const res = await fetch(url, {
    method: "POST",
    headers: {
      ...(key ? { Authorization: `Bearer ${key}` } : {}),
      "Content-Type": "application/json",
      ...extra,
    },
    body: JSON.stringify({
      model,
      messages: [{ role: "user", content }],
      temperature: 0.2,
      max_tokens: maxTokens,
      ...body,
    }),
    signal: AbortSignal.timeout(180000),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.error) {
    throw new Error(`${model}: ${data.error?.message || `HTTP ${res.status}`}`);
  }
  const choice = data.choices?.[0];
  const text = choice?.message?.content;
  if (!text) {
    // «Думающая» модель потратила весь лимит на скрытые рассуждения и не дошла до ответа
    const reasoningTokens = data.usage?.completion_tokens_details?.reasoning_tokens ?? 0;
    if (choice?.finish_reason === "length" && reasoningTokens > 0) throw new Error(`${model}: пустой ответ (ушло на рассуждения)`);
    throw new Error(`${model}: пустой ответ`);
  }
  return { text, model: data.model || model };
}

/**
 * OpenRouter: отключаем скрытые рассуждения — иначе думающие модели (Nemotron и др.) тратят весь
 * лимит токенов на них и возвращают пустой ответ. Если модель не умеет их отключать — повторяем без параметра,
 * если ответ всё равно упёрся в лимит — даём вдвое больше токенов.
 */
async function openrouterChat(key: string, model: string, content: string, maxTokens = 1200) {
  const url = "https://openrouter.ai/api/v1/chat/completions";
  const headers = { "HTTP-Referer": "http://localhost:3100", "X-Title": "JobSearchTool" };
  try {
    return await chat(url, key, model, content, maxTokens, headers, { reasoning: { enabled: false } });
  } catch (e: any) {
    if (/reasoning/i.test(e.message) && !/ушло на рассуждения/.test(e.message))
      return chat(url, key, model, content, maxTokens, headers);
    if (/ушло на рассуждения/.test(e.message)) return chat(url, key, model, content, maxTokens * 2, headers);
    throw e;
  }
}

/** Модели иногда отдают пустой ответ или временную ошибку провайдера — даём вторую попытку */
async function callWithRetry(llm: Llm, model: string, content: string, maxTokens: number) {
  try {
    return await llm.call(model, content, maxTokens);
  } catch (e: any) {
    if (!/пустой ответ|Provider returned error|timeout|aborted|HTTP 5\d\d|429/i.test(e.message)) throw e;
    await new Promise((r) => setTimeout(r, 3000));
    return llm.call(model, content, maxTokens);
  }
}

export async function analyzeJobs(jobs: Job[], s: Settings): Promise<Map<string, AiVerdict>> {
  if (!jobs.length) return new Map();
  const llm = llmFor(s);
  const models = llm.models;
  const errors: string[] = [];
  const p = prompt(jobs, s);
  const ph = profileHash(s);
  const list = (v: any) => (Array.isArray(v) ? v.map(String).filter(Boolean).slice(0, 8) : []);
  for (const m of models) {
    try {
      const { text, model } = await callWithRetry(llm, m, p, 900 * jobs.length + 400);
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
  const llm = llmFor(s);
  const models = llm.models;
  const errors: string[] = [];
  const LEVELS = ["intern", "junior", "middle", "senior", "lead"];
  const list = (v: any, n: number) =>
    Array.isArray(v) ? Array.from(new Set(v.map((x) => String(x).trim().toLowerCase()).filter(Boolean))).slice(0, n) : [];
  for (const m of models) {
    try {
      const { text, model } = await callWithRetry(llm, m, p, 1200);
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

/** Сколько вакансий за один запрос предфильтра: ответ короткий, поэтому пачка крупнее */
export const PRESCREEN_BATCH = 10;

/**
 * Быстрый предфильтр: только правила отсева, без оценки. Ответ — короткий список нарушений,
 * поэтому стоит в разы меньше токенов, чем полная проверка.
 * Возвращает id → нарушение (или undefined, если правила не нарушены).
 */
export async function prescreenJobs(jobs: Job[], s: Settings): Promise<Map<string, AiVerdict["reject"]>> {
  const rules = s.aiRejectRules.map((r) => r.trim()).filter(Boolean);
  const out = new Map<string, AiVerdict["reject"]>();
  if (!rules.length || !jobs.length) return out;
  const llm = llmFor(s);
  const per = Math.min(2500, Math.floor(25000 / jobs.length));
  const blocks = jobs
    .map((j, i) => `### ВАКАНСИЯ ${i + 1}: ${j.title} — ${j.company || "компания не указана"}\n${condense(htmlToText(j.description), per)}`)
    .join("\n\n");
  const p = `Проверь вакансии ТОЛЬКО на нарушение правил отсева. Ничего не оценивай.

ПРАВИЛА ОТСЕВА:
${rules.map((r, i) => `${i + 1}. ${r}`).join("\n")}

- Текст вакансии может быть на любом языке — понимай смысл («3+ years», «от 3 лет», «mindestens 3 Jahre»).
- Нарушение — ТОЛЬКО при явном подтверждении в тексте. Нет информации или неоднозначно — не нарушено.
- Для нарушения приведи точную цитату из вакансии на языке оригинала (до 150 символов).

${blocks}

Ответь СТРОГО JSON без markdown — только вакансии, которые нарушают правила (пустой список, если таких нет):
{"rejected": [{"n": <номер вакансии>, "rule": <номер правила>, "quote": "<цитата>"}]}`;
  const errors: string[] = [];
  for (const m of llm.models) {
    try {
      const { text } = await callWithRetry(llm, m, p, 150 * jobs.length + 300);
      const j = extractJson(text);
      const list: any[] = Array.isArray(j.rejected) ? j.rejected : Array.isArray(j.results) ? j.results : [];
      for (const r of list) {
        const job = jobs[Number(r.n) - 1];
        const reject = parseReject(r, s);
        if (job && reject) out.set(job.id, reject);
      }
      return out;
    } catch (e: any) {
      errors.push(e.message);
      if (/401|user not found|invalid.*key|no auth/i.test(e.message)) break;
    }
  }
  throw new Error(errors.join(" | "));
}

/**
 * Сопроводительное письмо и ответы на типовые вопросы формы.
 * Опирается только на факты из резюме — ничего не придумывает.
 */
export async function writeLetter(
  job: Job,
  s: Settings,
  opts: { lang: "auto" | "ru" | "en"; note?: string },
): Promise<{ text: string; answers: { q: string; a: string }[]; lang: string; model: string }> {
  if (s.profile.trim().length < 40) throw new Error("Заполните резюме в настройках — письмо пишется по нему");
  const llm = llmFor(s);
  const ai = job.ai && !job.ai.quick ? job.ai : undefined;
  const langRule =
    opts.lang === "ru"
      ? "Пиши на русском."
      : opts.lang === "en"
        ? "Write in English."
        : "Пиши на языке текста вакансии (если вакансия на английском — по-английски, на русском — по-русски, на другом языке — по-английски).";
  const p = `Ты помогаешь кандидату откликнуться на вакансию. Кандидат живёт в Казахстане (UTC+5) и работает удалённо.

РЕЗЮМЕ КАНДИДАТА:
${s.profile.slice(0, 8000)}

ВАКАНСИЯ: ${job.title} — ${job.company || "компания не указана"}
Локация: ${job.location}
${job.salary ? `Зарплата: ${job.salary}` : ""}
${condense(htmlToText(job.description), 6000)}
${ai ? `\nРАЗБОР СООТВЕТСТВИЯ (от предыдущей проверки):\nСовпадает: ${ai.pros.join("; ")}\nРиски: ${ai.cons.join("; ")}` : ""}
${opts.note ? `\nПОЖЕЛАНИЕ КАНДИДАТА К ПИСЬМУ: ${opts.note}` : ""}

Задача 1 — сопроводительное письмо:
- ${langRule}
- 120–180 слов, 3–4 коротких абзаца, без заголовка и подписи-плейсхолдеров вроде [Имя].
- Начни с конкретики: почему именно эта роль/компания (опирайся на детали вакансии), без «Я пишу, чтобы выразить интерес».
- 2–3 самых релевантных факта из резюме под требования вакансии — с цифрами/проектами, если они есть в резюме.
- Если есть явный пробел (например, опыта меньше требуемого) — не скрывай и не акцентируй; покажи, чем компенсируешь.
- Упомяни удалёнку из Казахстана и пересечение часовых поясов, только если это уместно для вакансии. Точные факты о времени (не выдумывай другие): Казахстан UTC+5; с Европой (CET/CEST) пересечение около 4–5 часов рабочего дня, с Великобританией около 5 часов; с восточным побережьем США в рабочее время по КЗ пересечения нет (только если работать вечером по КЗ), с западным побережьем — нет.
- Тон: уверенный, живой, без канцелярита и штампов («командный игрок», «стрессоустойчивость», «passionate»).
- НЕ придумывай факты, которых нет в резюме: сроки выхода, рабочее место, интернет, гражданство, зарплатные ожидания, опыт с технологиями. Если для ответа нужен факт, которого нет в резюме, оставь пометку в квадратных скобках для кандидата, например [уточнить: когда можете выйти].

Задача 2 — ответы на типовые вопросы формы отклика (на том же языке, что письмо), 3–5 вопросов, которые реально встречаются в таких формах: почему эта компания, ожидаемая зарплата (если в резюме есть ожидания — используй их; иначе пометка [уточнить: ожидаемая зарплата], можно с подсказкой по вилке вакансии), когда готов начать, опыт с ключевой технологией вакансии, часовой пояс/удалёнка. Ответы по 1–3 предложения. Те же правила: только факты из резюме и вакансии, недостающее — пометкой [уточнить: …].

Ответь СТРОГО JSON без markdown:
{"lang": "<код языка письма: ru/en/…>", "letter": "<текст письма, абзацы через \n\n>", "answers": [{"q": "<вопрос>", "a": "<ответ>"}]}`;
  const errors: string[] = [];
  for (const m of llm.models) {
    try {
      const { text, model } = await callWithRetry(llm, m, p, 1800);
      const j = extractJson(text);
      const letter = String(j.letter ?? "").trim();
      if (letter.length < 80) throw new Error(`${m}: письмо получилось пустым`);
      const answers = (Array.isArray(j.answers) ? j.answers : [])
        .map((x: any) => ({ q: String(x.q ?? "").trim(), a: String(x.a ?? "").trim() }))
        .filter((x: { q: string; a: string }) => x.q && x.a)
        .slice(0, 6);
      return { text: letter, answers, lang: String(j.lang ?? opts.lang).slice(0, 5), model };
    } catch (e: any) {
      errors.push(e.message);
      if (/401|user not found|invalid.*key|no auth/i.test(e.message)) break;
    }
  }
  throw new Error(errors.join(" | "));
}

/** Общий вызов: промпт → JSON с перебором моделей и проверкой результата */
async function askJson<T>(s: Settings, prompt: string, maxTokens: number, validate: (j: any) => T): Promise<T & { model: string }> {
  const llm = llmFor(s);
  const errors: string[] = [];
  for (const m of llm.models) {
    try {
      const { text, model } = await callWithRetry(llm, m, prompt, maxTokens);
      return { ...validate(extractJson(text)), model };
    } catch (e: any) {
      errors.push(`${m}: ${e.message.replace(`${m}: `, "")}`);
      if (/401|user not found|invalid.*key|no auth/i.test(e.message)) break;
    }
  }
  throw new Error(errors.join(" | "));
}

const strList = (v: any, n = 12) => (Array.isArray(v) ? v.map((x) => String(x).trim()).filter(Boolean).slice(0, n) : []);

function jobBlock(job: Job) {
  return `ВАКАНСИЯ: ${job.title} — ${job.company || "компания не указана"}
Локация: ${job.location}
${condense(htmlToText(job.description), 6000)}`;
}

function langRule(lang: "auto" | "ru" | "en") {
  return lang === "ru"
    ? "Пиши на русском."
    : lang === "en"
      ? "Write in English."
      : "Пиши на языке текста вакансии (английский — по-английски, русский — по-русски, другой язык — по-английски).";
}

export interface TailoredResume {
  name: string;
  headline: string;
  contacts: string[];
  summary: string;
  skills: { group: string; items: string[] }[];
  experience: { role: string; company: string; period: string; bullets: string[] }[];
  projects: { name: string; link?: string; bullets: string[] }[];
  education: string[];
  languages: string[];
  changes: string[]; // что и почему переставлено под вакансию
  lang: string;
}

/** Резюме под вакансию: переставляет акценты, не добавляя фактов */
export async function tailorResume(job: Job, s: Settings, lang: "auto" | "ru" | "en") {
  if (s.profile.trim().length < 40) throw new Error("Заполните резюме в настройках");
  const p = `Ты — карьерный консультант. Адаптируй резюме кандидата под конкретную вакансию.

ИСХОДНОЕ РЕЗЮМЕ:
${s.profile.slice(0, 10000)}

${jobBlock(job)}

Правила:
- ${langRule(lang)}
- Используй ТОЛЬКО факты из исходного резюме. Не добавляй технологии, опыт, цифры, должности, даты, которых там нет. Можно переформулировать, сокращать, переставлять и группировать.
- Подними наверх то, что важно для этой вакансии: релевантный опыт и проекты первыми, в каждом пункте — сначала то, что совпадает с требованиями.
- Навыки сгруппируй, и в каждой группе первыми поставь те, что упомянуты в вакансии. Нерелевантное можно убрать.
- headline — одна строка под вакансию (роль + ключевой стек), summary — 2–3 предложения.
- bullets — короткие, с глаголом действия и результатом/масштабом, если он есть в исходнике. 2–5 на позицию.
- Даты/периоды бери из резюме как есть; если их нет — пустая строка.
- changes — 3–5 коротких пунктов ПО-РУССКИ для кандидата: что ты поднял/убрал и почему.

Ответь СТРОГО JSON без markdown:
{"lang":"ru|en|…","name":"","headline":"","contacts":["email/telegram/github/сайт из резюме"],"summary":"","skills":[{"group":"","items":[""]}],"experience":[{"role":"","company":"","period":"","bullets":[""]}],"projects":[{"name":"","link":"","bullets":[""]}],"education":[""],"languages":[""],"changes":[""]}`;
  return askJson<TailoredResume>(s, p, 2600, (j) => {
    const r: TailoredResume = {
      lang: String(j.lang ?? lang),
      name: String(j.name ?? ""),
      headline: String(j.headline ?? ""),
      contacts: strList(j.contacts, 6),
      summary: String(j.summary ?? ""),
      skills: (Array.isArray(j.skills) ? j.skills : [])
        .map((g: any) => ({ group: String(g.group ?? ""), items: strList(g.items, 20) }))
        .filter((g: any) => g.items.length),
      experience: (Array.isArray(j.experience) ? j.experience : [])
        .map((e: any) => ({ role: String(e.role ?? ""), company: String(e.company ?? ""), period: String(e.period ?? ""), bullets: strList(e.bullets, 6) }))
        .filter((e: any) => e.role || e.company),
      projects: (Array.isArray(j.projects) ? j.projects : [])
        .map((p: any) => ({ name: String(p.name ?? ""), link: p.link ? String(p.link) : undefined, bullets: strList(p.bullets, 5) }))
        .filter((p: any) => p.name),
      education: strList(j.education, 4),
      languages: strList(j.languages, 6),
      changes: strList(j.changes, 6),
    };
    if (!r.summary && !r.experience.length) throw new Error("резюме получилось пустым");
    return r;
  });
}

export interface InterviewPrep {
  focus: string; // главное, на чём будут проверять
  stack: { q: string; hint: string }[];
  gaps: { q: string; how: string }[];
  behavioral: { q: string; hint: string }[];
  ask: string[];
}

/** Подготовка к интервью: вопросы по стеку, по пробелам кандидата и что спросить у компании */
export async function interviewPrep(job: Job, s: Settings) {
  if (s.profile.trim().length < 40) throw new Error("Заполните резюме в настройках");
  const ai = job.ai && !job.ai.quick ? job.ai : undefined;
  const p = `Ты готовишь кандидата к собеседованию на конкретную вакансию. Отвечай по-русски; сами вопросы интервьюера можно давать на языке вакансии.

РЕЗЮМЕ КАНДИДАТА:
${s.profile.slice(0, 8000)}

${jobBlock(job)}
${ai ? `\nРАЗБОР СООТВЕТСТВИЯ:\nСовпадает: ${ai.pros.join("; ")}\nРиски: ${ai.cons.join("; ")}` : ""}

Подготовь:
1. focus — 1–2 предложения: на чём, скорее всего, будут проверять.
2. stack — 6–8 вероятных технических вопросов именно по стеку и задачам этой вакансии (не общие). hint — что важно сказать, со ссылкой на опыт кандидата из резюме, если он есть.
3. gaps — 2–4 неудобных вопроса про пробелы кандидата относительно требований (меньше опыта, нет технологии и т.п.). how — как честно ответить и чем компенсировать, опираясь только на факты из резюме.
4. behavioral — 3 поведенческих вопроса, типичных для такой роли, с подсказкой, какой случай из резюме рассказать.
5. ask — 4–6 сильных вопросов кандидата к компании, учитывая удалёнку из Казахстана (часовой пояс, оформление, оплата) и детали вакансии.

Ответь СТРОГО JSON без markdown:
{"focus":"","stack":[{"q":"","hint":""}],"gaps":[{"q":"","how":""}],"behavioral":[{"q":"","hint":""}],"ask":[""]}`;
  return askJson<InterviewPrep>(s, p, 2600, (j) => {
    const pairs = (v: any, a: string, b: string) =>
      (Array.isArray(v) ? v : [])
        .map((x: any) => ({ q: String(x.q ?? "").trim(), [b]: String(x[b] ?? x[a] ?? "").trim() }))
        .filter((x: any) => x.q)
        .slice(0, 10);
    const r: InterviewPrep = {
      focus: String(j.focus ?? ""),
      stack: pairs(j.stack, "hint", "hint") as any,
      gaps: pairs(j.gaps, "how", "how") as any,
      behavioral: pairs(j.behavioral, "hint", "hint") as any,
      ask: strList(j.ask, 8),
    };
    if (!r.stack.length) throw new Error("пустая подготовка");
    return r;
  });
}
