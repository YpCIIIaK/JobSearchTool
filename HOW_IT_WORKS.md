# How it works / Как это устроено

**RU** · [EN](#english)

## Коротко

Приложение запускается у вас на компьютере. Оно ходит на площадки с вакансиями, собирает всё в один список и сортирует по тому, насколько вакансия подходит именно вам. ИИ по желанию читает вакансию целиком и пишет вердикт. Все данные хранятся в одном файле на вашем диске.

```
 Площадки ──► Скан ──► Скоринг по словам ──► База (data/db.json) ──► Интерфейс
                                                   ▲                    │
                                                   └──── Проверка ИИ ◄──┘
                                                         Письмо ИИ
```

## 1. Скан: откуда берутся вакансии

Кнопка «Сканировать» запускает опрос всех включённых площадок одновременно. Каждая площадка — отдельный файл в `lib/sources/`.

| Как подключено | Площадки | Что это значит |
|---|---|---|
| **Официальный API** | Remotive, RemoteOK, Himalayas, Jobicy, Working Nomads, Arbeitnow, Greenhouse / Lever / Ashby (сайты компаний) | Площадка сама даёт данные в JSON |
| **Официальная RSS-лента** | We Work Remotely, Хабр Карьера, Djinni, CryptoJobsList, Cryptocurrency Jobs | Та же лента, что для RSS-читалок |
| **Публичные страницы** | hh.kz / hh.ru, LinkedIn, Getmatch | То, что видно в браузере без входа. Запросы идут по одному с паузой 2–3,5 с, только чтение |

Аккаунты и пароли не используются. Если у площадки защита от ботов (например, Wellfound), она не подключается.

По ключевым словам идёт поиск на площадках, где он есть. Где поиска нет, берутся свежие вакансии и фильтруются у себя.

## 2. Скоринг: первичный рейтинг без ИИ

Сразу после скана каждая вакансия получает рейтинг 0–100 (`lib/score.ts`):

- совпадения ключевых слов: в названии весят больше всего, затем теги, затем описание;
- **стоп-слова** («Исключить») — такая вакансия вообще не попадает в базу;
- уровень (junior / middle / senior), свежесть публикации;
- **гео** — можно ли работать из Казахстана:
  - `ok` — весь мир или явно КЗ;
  - `maybe` — не указано;
  - `no` — только US, UK или конкретные страны, требование гражданства.

  Himalayas, hh и Getmatch дают точный список стран, у остальных это определяется по тексту.

Одна и та же вакансия с разных площадок схлопывается в одну по паре «название + компания».

## 3. Проверка ИИ: необязательно, но точнее

Проверка ИИ (`lib/ai.ts`, `lib/analyze.ts`) читает полное описание вакансии и ваше резюме. Она делает три вещи:

1. ставит оценку 0–100, пишет вердикт, плюсы и минусы, стек;
2. отвечает, реально ли попасть на вакансию из Казахстана;
3. проверяет ваши **правила отсева**, написанные своими словами. Нарушителя скрывает, только если нашёл в тексте явное подтверждение, и сохраняет его цитатой.

Как экономится лимит бесплатных моделей:

- **предфильтр**: если есть правила отсева, вакансии сначала идут по 10 штук в коротком запросе «нарушает или нет», и полная оценка достаётся только прошедшим;
- **пачки**: полная оценка идёт по 5 вакансий в одном запросе;
- **кэш**: одна вакансия с разных площадок оценивается один раз. Кэш сбрасывается, если вы поменяли резюме, ключевые слова или правила (тогда в интерфейсе видна пометка «проверка устарела»).

Итоговый рейтинг: `0.7 × оценка ИИ + 0.3 × рейтинг по словам`.

Когда запускается: сразу после скана для N лучших новых вакансий (Настройки → «Проверять ИИ сразу после скана») и по кнопке «Проверить следующие 10» над списком.

## 4. Письмо и ответы для формы

В карточке вакансии есть блок «Отклик». ИИ пишет сопроводительное письмо на языке вакансии и ответы на типовые вопросы формы. Он опирается только на факты из резюме, а то, чего в резюме нет, помечает `[уточнить: …]`. Письмо можно править, правки сохраняются.

## 5. Куда что подключается

| Что | Где настроить | Где хранится |
|---|---|---|
| Резюме, ключевые и стоп-слова, правила отсева | Настройки | `data/db.json` |
| ИИ: OpenRouter (бесплатно) или свой API (OpenAI, Anthropic, Groq, DeepSeek, Ollama) | Настройки → Резюме и ИИ | ключи только в `data/db.json` |
| Площадки, страны hh, локации LinkedIn | Настройки → Площадки | `data/db.json` |
| Компании на Greenhouse / Lever / Ashby | Настройки → Площадки → «Сайты компаний» (кнопка «Найти» подбирает новые) | `data/db.json` |

`data/db.json` не попадает в git. Чтобы начать с чистого листа, удалите этот файл.

## Карта кода

```
app/                    страницы и API (Next.js)
  page.tsx              список вакансий
  settings/page.tsx     настройки
  api/scan              запуск и статус скана
  api/jobs              список, карточка, статусы
  api/analyze           проверка ИИ
  api/letter            письмо
  api/profile           «настроить поиск по резюме»
  api/discover          поиск компаний для Greenhouse / Lever / Ashby
components/             интерфейс (JobsView, LetterPanel, Header, ui, icons)
lib/
  sources/*.ts          одна площадка = один файл
  scan.ts               оркестрация скана, дедупликация
  score.ts              рейтинг по словам и гео
  ai.ts                 промпты и вызовы моделей
  analyze.ts            предфильтр → пачки → кэш → отсев
  enrich.ts             догрузка полного описания (hh, LinkedIn, Хабр, Greenhouse)
  store.ts              чтение и запись data/db.json
```

**Как добавить площадку:** создайте `lib/sources/<имя>.ts`, который возвращает массив вакансий, зарегистрируйте его в `lib/sources/index.ts` и добавьте название в `lib/types.ts`.

---

<a id="english"></a>

## English

**In short.** The app runs on your machine. It polls job sources, merges everything into one list and ranks it by how well each job fits you. An optional AI step reads each job in full. All data lives in a single local file.

1. **Scan.** All enabled sources are fetched in parallel, one file per source in `lib/sources/`. There are three kinds of sources:
   - official APIs: Remotive, RemoteOK, Himalayas, Jobicy, Working Nomads, Arbeitnow, Greenhouse / Lever / Ashby;
   - official RSS feeds: We Work Remotely, Habr Career, Djinni, crypto boards;
   - public no-login pages, throttled to one request every 2–3.5 s, read-only: hh.kz / hh.ru, LinkedIn, Getmatch.

   No accounts are used, and sites with anti-bot protection are skipped.
2. **Scoring** (`lib/score.ts`) gives each job a 0–100 score from keyword matches, seniority and freshness. Exclusion words drop a job entirely. The geo check answers whether the job is workable from Kazakhstan (`ok` / `maybe` / `no`). Duplicates across sources are merged by title + company.
3. **AI check** (`lib/ai.ts`, `lib/analyze.ts`) produces a score, a verdict, pros and cons, the stack and Kazakhstan eligibility, and applies your plain-language reject rules. A job is hidden only with a quoted proof from its text. Free-tier limits are saved three ways: a cheap rules-only prescreen (10 jobs per call), full checks in batches of 5, and a cache keyed by title + company, invalidated when your resume or rules change. The final rank is `0.7 × AI + 0.3 × keywords`.
4. **Cover letter.** Written per job in the job's language, together with answers to common form questions. It uses only facts from your resume and marks missing facts as `[уточнить: …]`.
5. **Configuration and storage.** Everything (resume, rules, sources, API keys) is configured in Settings and stored in `data/db.json`, which is git-ignored. AI providers: OpenRouter (free) or any OpenAI-compatible API (OpenAI, Anthropic, Groq, DeepSeek, Ollama).

**Adding a source:** create `lib/sources/<name>.ts` returning an array of jobs, then register it in `lib/sources/index.ts` and `lib/types.ts`.
