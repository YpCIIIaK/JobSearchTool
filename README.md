# JobSearchTool

**RU** · [EN](#english)

Локальный агрегатор удалённых вакансий. Собирает вакансии с 16 площадок, ранжирует их по вашему резюме, проверяет ИИ (бесплатно через OpenRouter или через свой API) и пишет сопроводительные письма. Отдельно проверяет, можно ли работать из Казахстана.

Как всё устроено и куда что подключается: [HOW_IT_WORKS.md](HOW_IT_WORKS.md).

## Быстрый старт

Нужен [Node.js](https://nodejs.org) 20 или новее.

```bash
git clone https://github.com/YpCIIIaK/JobSearchTool.git
cd JobSearchTool
npm install
npm run build
npm start
```

Откройте http://localhost:3100. На Windows можно просто запустить `start.bat`.

## Как пользоваться

1. **Настройки → Резюме и ИИ.** Вставьте бесплатный ключ с [openrouter.ai/keys](https://openrouter.ai/keys) и текст резюме.
2. Нажмите **«✦ Настроить поиск по резюме»**. ИИ заполнит ключевые слова, стоп-слова, уровень и зарплату. Проверьте их и нажмите **«Сохранить и сканировать»**.
3. **Вакансии.** Список отсортирован по соответствию. По клику открывается полное описание, оценка ИИ, плюсы и минусы, отметка о доступности из КЗ.
4. **«Проверить следующие 10»** над списком: ИИ оценит вакансии по резюме и применит ваши **правила отсева**, например «требуется 3+ года опыта». Нарушителей скроет с цитатой-доказательством.
5. В карточке вакансии есть блок **«Отклик»**: письмо на языке вакансии и ответы для формы. Только факты из резюме, недостающее помечено `[уточнить: …]`.
6. Отмечайте вакансии: в избранное, «Откликнулся», «Скрыть».

Горячие клавиши: `J`/`K` — навигация, `S` — в избранное, `H` — скрыть, `A` — ИИ, `O` — открыть оригинал.

## Площадки

| Площадка | Способ подключения |
|---|---|
| hh.kz / hh.ru, Getmatch | публичные страницы сайта, без входа, пауза 2–3 с между запросами |
| LinkedIn | гостевой поиск, без входа в аккаунт |
| Djinni | официальная RSS |
| Сайты компаний (Greenhouse, Lever, Ashby) | открытые API, около 50 компаний по умолчанию; кнопка «Найти» подбирает новые |
| Remotive, RemoteOK, Himalayas, Jobicy, Working Nomads | открытые API |
| We Work Remotely, Хабр Карьера, CryptoJobsList, Cryptocurrency Jobs | RSS |
| Arbeitnow, Telegram | есть, по умолчанию выключены |

## Полезно знать

- Все данные хранятся локально в `data/db.json`: ключи, резюме, вакансии. Файл не попадает в git.
- Полное описание для hh, LinkedIn и Greenhouse подгружается при открытии вакансии или перед ИИ-анализом.
- Оценки ИИ кэшируются: одна и та же вакансия с разных площадок оценивается один раз. Кэш сбрасывается, если вы меняете резюме.
- Бесплатные модели ограничены по числу запросов в день, поэтому включайте автоанализ только для топа (Настройки → «Автоанализ после скана»).

---

<a id="english"></a>

## English

Local aggregator for remote jobs. It collects openings from 16 sources, ranks them against your resume, checks them with AI (free via OpenRouter or with your own API) and writes cover letters. It also checks whether a job can be done from Kazakhstan.

How it all fits together: [HOW_IT_WORKS.md](HOW_IT_WORKS.md).

### Quick start

Requires [Node.js](https://nodejs.org) 20 or later.

```bash
git clone https://github.com/YpCIIIaK/JobSearchTool.git
cd JobSearchTool
npm install
npm run build
npm start
```

Open http://localhost:3100. On Windows you can run `start.bat` instead.

### Usage

1. **Settings → Resume & AI.** Paste a free key from [openrouter.ai/keys](https://openrouter.ai/keys) and your resume.
2. Click **"✦ Set up search from resume"**. The AI fills in keywords, exclusions, seniority and minimum salary. Review them, then click **"Save and scan"**.
3. **Jobs.** The list is sorted by match. Clicking a job shows the full description, the AI verdict with pros and cons, and the Kazakhstan eligibility check.
4. **"Check next 10"** above the list: the AI scores jobs against your resume and applies your plain-language **reject rules**, such as "requires 3+ years". Matching jobs are hidden together with a quote that proves the rule.
5. The **"Отклик"** block in a job card writes a cover letter in the job's language plus answers to common form questions. It uses only facts from your resume and marks missing ones as `[уточнить: …]`.
6. Mark jobs as saved, applied or hidden.

Hotkeys: `J`/`K` to navigate, `S` to save, `H` to hide, `A` to run AI, `O` to open the original posting.

### Sources

hh.kz / hh.ru and Getmatch (public pages, no login, throttled), LinkedIn (guest search, no login), Djinni (official RSS), company career pages via Greenhouse, Lever and Ashby, Remotive, RemoteOK, Himalayas, Jobicy, Working Nomads, We Work Remotely, Habr Career, CryptoJobsList and Cryptocurrency Jobs. Arbeitnow and Telegram are available but off by default.

### Notes

- Everything is stored locally in `data/db.json`, which is git-ignored.
- AI verdicts are cached, so the same job from different sources is scored once. The cache is reset when your resume changes.
- Free models have daily limits. Score only the top results.

> The UI is in Russian.
