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
| **Официальный API** | Remotive, RemoteOK, Himalayas, Jobicy, Working Nomads, Arbeitnow, Landing.jobs, HN «Who is hiring» (Algolia), Greenhouse / Lever / Ashby (сайты компаний) | Площадка сама даёт данные в JSON |
| **Официальная RSS-лента** | We Work Remotely, Хабр Карьера, Djinni, Jobspresso, NoDesk, CryptoJobsList, Cryptocurrency Jobs | Та же лента, что для RSS-читалок |
| **Публичные страницы** | hh.kz / hh.ru, LinkedIn, Getmatch, Enbek.kz | То, что видно в браузере без входа. Запросы идут по одному с паузой 2–3,5 с, только чтение |

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

**Дубли.** Одна вакансия на нескольких площадках показывается одной строкой с пометкой «+N площадки», а в карточке есть ссылки на все копии. Сравнение нечёткое: компания без юр. формы (Inc, LLC, AB, ТОО…), название без шумовых слов (remote, m/w/d, удалённо…). Если компании нет, сравниваются название и начало описания. Статус («Скрыть», «В избранное», «Откликнулся») меняется у всей группы. Объединение можно выключить в фильтрах (`lib/dupes.ts`).

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

У OpenRouter скрытые «рассуждения» моделей отключаются (`reasoning: {enabled: false}`). Иначе думающие модели (Nemotron и др.) тратят весь лимит токенов на рассуждения и возвращают пустой ответ.

Когда запускается: сразу после скана для N лучших новых вакансий (Настройки → «Проверять ИИ сразу после скана») и по кнопке «Проверить следующие 10» над списком.

## 4. Отклик: письмо, резюме, интервью

В карточке вакансии есть блок «Отклик» с тремя вкладками:

- **Резюме** — ваше резюме под конкретную вакансию: релевантный опыт и проекты наверх, навыки из вакансии первыми. Только ваши факты. Есть список «что изменено» и экспорт в PDF через диалог печати (`/print/resume`).
- **Интервью** — вероятные вопросы по стеку вакансии с подсказками из вашего опыта, неудобные вопросы про ваши пробелы и как честно ответить, поведенческие вопросы, что спросить у компании.
- **Письмо** — см. ниже.

Во вкладке «Письмо» ИИ пишет сопроводительное письмо на языке вакансии и ответы на типовые вопросы формы. Он опирается только на факты из резюме, а то, чего в резюме нет, помечает `[уточнить: …]`. Письмо можно править, правки сохраняются.

## 5. Куда что подключается

| Что | Где настроить | Где хранится |
|---|---|---|
| Резюме, ключевые и стоп-слова, правила отсева | Настройки | `data/db.json` |
| ИИ: OpenRouter или свой API (OpenAI, Anthropic, Groq, DeepSeek, Ollama). Модели — списком по приоритету, любой слаг (бесплатный или платный): если основная не ответила, берётся следующая | Настройки → Резюме и ИИ | ключи только в `data/db.json` |
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
  api/resume            резюме под вакансию
  api/interview         подготовка к интервью
  print/resume          печать резюме в PDF
  api/profile           «настроить поиск по резюме»
  api/discover          поиск компаний для Greenhouse / Lever / Ashby
components/             интерфейс (JobsView, LetterPanel, Header, ui, icons)
lib/
  sources/*.ts          одна площадка = один файл
  scan.ts               оркестрация скана, дедупликация
  score.ts              рейтинг по словам и гео
  ai.ts                 промпты и вызовы моделей
  analyze.ts            предфильтр → пачки → кэш → отсев
  enrich.ts             догрузка полного описания (hh, LinkedIn, Хабр, Greenhouse, Enbek)
  dupes.ts              нечёткий поиск дублей между площадками
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
4. **Apply panel.** Three tabs per job:
   - a cover letter with answers to common form questions;
   - a resume tailored to the job, exportable to PDF;
   - interview prep: stack questions, questions about your gaps, behavioral questions and what to ask the company.

   All three use only facts from your resume, and missing facts are marked as `[уточнить: …]`. The same job posted on several sources is merged into one row with links to every copy (`lib/dupes.ts`).
5. **Configuration and storage.** Everything (resume, rules, sources, API keys) is configured in Settings and stored in `data/db.json`, which is git-ignored. AI providers: OpenRouter or any OpenAI-compatible API (OpenAI, Anthropic, Groq, DeepSeek, Ollama). Models are an ordered list of any slugs, free or paid, and the next one is tried when one fails.

**Adding a source:** create `lib/sources/<name>.ts` returning an array of jobs, then register it in `lib/sources/index.ts` and `lib/types.ts`.
