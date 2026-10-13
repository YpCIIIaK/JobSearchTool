export type SourceId =
  | "remotive"
  | "remoteok"
  | "himalayas"
  | "jobicy"
  | "arbeitnow"
  | "weworkremotely"
  | "workingnomads"
  | "habr"
  | "hh"
  | "linkedin"
  | "ats"
  | "cryptojobslist"
  | "cryptocurrencyjobs"
  | "telegram";

/** Можно ли работать из Казахстана по данным вакансии */
export type GeoFit = "ok" | "maybe" | "no";

export type JobStatus = "new" | "saved" | "applied" | "hidden";

export interface AiVerdict {
  score: number; // 0..100
  verdict: string; // короткий вывод
  summary: string; // 2-4 предложения о вакансии по-русски
  pros: string[];
  cons: string[];
  kz: "yes" | "no" | "unclear";
  stack: string[];
  salary?: string;
  model: string;
  at: string;
  profileHash?: string; // для кэша: оценка актуальна, пока не поменялось резюме
  reject?: { rule: string; quote: string }; // нарушенное правило отсева и цитата-доказательство из вакансии
}

export interface Job {
  id: string;
  source: SourceId;
  sourceLabel: string;
  url: string;
  title: string;
  company: string;
  companyLogo?: string;
  location: string;
  geo: GeoFit;
  tags: string[];
  employment?: string;
  salary?: string;
  salaryUsdMonth?: number; // нормализованная оценка
  description: string; // санитизированный HTML
  postedAt?: string; // ISO
  firstSeenAt: string;
  lastSeenAt: string;
  score: number; // эвристика 0..100
  matched: string[];
  status: JobStatus;
  ai?: AiVerdict;
  hiddenBy?: "ai" | "user"; // кто скрыл: правило отсева ИИ или вы
  enriched?: boolean; // полное описание уже догружено со страницы вакансии
}

export type RawJob = Omit<
  Job,
  "id" | "geo" | "firstSeenAt" | "lastSeenAt" | "score" | "matched" | "status" | "ai" | "salaryUsdMonth"
> & { geo?: GeoFit };

export interface Settings {
  keywords: string[]; // что ищем (стек/роли)
  mustHave: string[]; // обязательно хотя бы одно из
  exclude: string[]; // стоп-слова
  seniority: string[]; // junior / middle / senior / lead
  minSalaryUsd: number; // 0 = не важно
  hideGeoRestricted: boolean;
  maxAgeDays: number;
  sources: Record<SourceId, boolean>;
  telegramChannels: string[];
  hhAreas: string[]; // id регионов hh: 40 — Казахстан, 113 — Россия, 16 — Беларусь, 97 — Узбекистан
  linkedinLocations: string[];
  atsCompanies: string[]; // "greenhouse:gitlab", "lever:toptal", "ashby:linear"
  openrouterKey: string;
  aiModel: string;
  profile: string; // резюме / о себе для ИИ
  aiAutoTop: number; // сколько лучших анализировать автоматически после скана
  aiRejectRules: string[]; // правила отсева своими словами: ИИ скрывает вакансию, если нашёл нарушение
  language: "ru" | "en";
}

export const SOURCE_LABELS: Record<SourceId, string> = {
  remotive: "Remotive",
  remoteok: "RemoteOK",
  himalayas: "Himalayas",
  jobicy: "Jobicy",
  arbeitnow: "Arbeitnow",
  weworkremotely: "We Work Remotely",
  workingnomads: "Working Nomads",
  habr: "Хабр Карьера",
  hh: "hh.kz / hh.ru",
  linkedin: "LinkedIn",
  ats: "Сайты компаний (Greenhouse, Lever, Ashby)",
  cryptojobslist: "CryptoJobsList",
  cryptocurrencyjobs: "Cryptocurrency Jobs",
  telegram: "Telegram",
};

export const DEFAULT_SETTINGS: Settings = {
  keywords: ["react", "typescript", "frontend", "node.js"],
  mustHave: [],
  exclude: ["us citizens only", "security clearance", "1c"],
  seniority: [],
  minSalaryUsd: 0,
  hideGeoRestricted: true,
  maxAgeDays: 30,
  sources: {
    remotive: true,
    remoteok: true,
    himalayas: true,
    jobicy: true,
    arbeitnow: false,
    weworkremotely: true,
    workingnomads: true,
    habr: true,
    hh: true,
    linkedin: true,
    ats: true,
    cryptojobslist: true,
    cryptocurrencyjobs: true,
    telegram: false,
  },
  telegramChannels: ["remote_it_jobs", "remotejobss", "itjobs_kz", "remoteit", "jobforjunior"],
  hhAreas: ["40"],
  linkedinLocations: ["Kazakhstan", "Worldwide"],
  atsCompanies: [
    // Проверены 13.10.2026: открытые вакансии с удалёнкой
    "greenhouse:gitlab", "greenhouse:canonical", "greenhouse:mozilla", "greenhouse:grafanalabs", "greenhouse:coinbase",
    "greenhouse:okx", "greenhouse:bybit", "greenhouse:consensys", "greenhouse:tailscale", "greenhouse:storyblok",
    "greenhouse:webflow", "greenhouse:bitwarden", "greenhouse:gemini", "greenhouse:netlify", "greenhouse:wikimedia",
    "greenhouse:jetbrains", "greenhouse:planetscale", "greenhouse:stripe",
    "lever:toptal", "lever:binance", "lever:offchainlabs", "lever:neon", "lever:zerion",
    "ashby:supabase", "ashby:posthog", "ashby:zapier", "ashby:n8n", "ashby:linear", "ashby:clickhouse", "ashby:andela",
    "ashby:phantom", "ashby:plaid", "ashby:notion", "ashby:sentry", "ashby:replit", "ashby:airbyte", "ashby:temporal",
    "ashby:railway", "ashby:render", "ashby:sanity", "ashby:1password", "ashby:circle", "ashby:alchemy", "ashby:ledger",
    "ashby:mystenlabs", "ashby:keyrock", "ashby:safe", "ashby:magiceden", "ashby:consensys",
  ],
  openrouterKey: "",
  aiModel: "openrouter/free",
  profile: "",
  aiAutoTop: 0,
  aiRejectRules: [],
  language: "ru",
};

export interface ScanProgress {
  running: boolean;
  startedAt?: string;
  finishedAt?: string;
  phase: string;
  sources: Record<string, { state: "pending" | "running" | "done" | "error"; count: number; error?: string }>;
  added: number;
  updated: number;
  analyzed: number;
  analyzeTotal: number;
}

/** Итоговый рейтинг: если есть ИИ-оценка, она весит больше эвристики */
export function rank(j: Pick<Job, "score" | "ai">): number {
  return j.ai ? Math.round(j.ai.score * 0.7 + j.score * 0.3) : j.score;
}
