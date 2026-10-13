import fs from "node:fs";
import path from "node:path";
import { AiVerdict, DEFAULT_SETTINGS, Job, Settings } from "./types";

const DATA_DIR = path.join(process.cwd(), "data");
const DB_FILE = path.join(DATA_DIR, "db.json");

interface Db {
  settings: Settings;
  jobs: Record<string, Job>;
  aiCache: Record<string, AiVerdict>; // ключ: название+компания, переживает удаление вакансий
}

// Кэш в памяти процесса, переживает HMR в dev
const g = globalThis as unknown as { __jfDb?: Db; __jfSaveTimer?: NodeJS.Timeout };

function load(): Db {
  if (g.__jfDb) return g.__jfDb;
  let db: Db = { settings: { ...DEFAULT_SETTINGS }, jobs: {}, aiCache: {} };
  try {
    if (fs.existsSync(DB_FILE)) {
      const parsed = JSON.parse(fs.readFileSync(DB_FILE, "utf8")) as Partial<Db>;
      db = {
        settings: {
          ...DEFAULT_SETTINGS,
          ...parsed.settings,
          sources: { ...DEFAULT_SETTINGS.sources, ...parsed.settings?.sources },
        },
        jobs: parsed.jobs ?? {},
        aiCache: parsed.aiCache ?? {},
      };
    }
  } catch (e) {
    console.error("[store] не удалось прочитать db.json, начинаю с пустой базы", e);
  }
  g.__jfDb = db;
  return db;
}

function flush() {
  const db = load();
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const tmp = DB_FILE + ".tmp";
  fs.writeFileSync(tmp, JSON.stringify(db));
  fs.renameSync(tmp, DB_FILE);
}

/** Отложенная запись, чтобы не писать файл на каждое изменение */
export function save(immediate = false) {
  if (g.__jfSaveTimer) clearTimeout(g.__jfSaveTimer);
  if (immediate) return flush();
  g.__jfSaveTimer = setTimeout(flush, 300);
}

export function getSettings(): Settings {
  return load().settings;
}

export function setSettings(patch: Partial<Settings>): Settings {
  const db = load();
  db.settings = {
    ...db.settings,
    ...patch,
    sources: { ...db.settings.sources, ...patch.sources },
  };
  save(true);
  return db.settings;
}

export function allJobs(): Job[] {
  return Object.values(load().jobs);
}

export function getJob(id: string): Job | undefined {
  return load().jobs[id];
}

export function putJob(job: Job) {
  load().jobs[job.id] = job;
  save();
}

export function updateJob(id: string, patch: Partial<Job>): Job | undefined {
  const db = load();
  const job = db.jobs[id];
  if (!job) return;
  Object.assign(job, patch);
  save();
  return job;
}

export function deleteJobs(pred: (j: Job) => boolean): number {
  const db = load();
  let n = 0;
  for (const [id, j] of Object.entries(db.jobs)) {
    if (pred(j)) {
      delete db.jobs[id];
      n++;
    }
  }
  save(true);
  return n;
}

export function getCachedAi(key: string): AiVerdict | undefined {
  return load().aiCache[key];
}

export function putCachedAi(key: string, ai: AiVerdict) {
  load().aiCache[key] = ai;
  save();
}
