import type { TailoredResume } from "@/lib/ai";

const L = {
  ru: { summary: "Обо мне", skills: "Навыки", exp: "Опыт", projects: "Проекты", edu: "Образование", langs: "Языки" },
  en: { summary: "Summary", skills: "Skills", exp: "Experience", projects: "Projects", edu: "Education", langs: "Languages" },
};

/** Документ резюме: одинаково выглядит в карточке и при печати в PDF */
export default function ResumeView({ r }: { r: TailoredResume }) {
  const t = r.lang?.startsWith("ru") ? L.ru : L.en;
  return (
    <article className="resume-doc text-[#1b1915] bg-white">
      <header className="pb-4 mb-5 border-b border-[#1b1915]/15">
        {r.name && <h1 className="font-serif text-[28px] leading-tight tracking-[-0.01em]">{r.name}</h1>}
        {r.headline && <p className="text-[14px] text-[#3a362f] mt-1 font-medium">{r.headline}</p>}
        {r.contacts.length > 0 && (
          <p className="text-[12px] text-[#5f594f] mt-2 flex flex-wrap gap-x-3 gap-y-0.5">
            {r.contacts.map((c) => (
              <span key={c}>{c}</span>
            ))}
          </p>
        )}
      </header>

      {r.summary && (
        <Block title={t.summary}>
          <p className="text-[13px] leading-relaxed">{r.summary}</p>
        </Block>
      )}

      {r.skills.length > 0 && (
        <Block title={t.skills}>
          <dl className="space-y-1 text-[12.5px]">
            {r.skills.map((g) => (
              <div key={g.group} className="flex gap-2">
                {g.group && <dt className="font-semibold shrink-0">{g.group}:</dt>}
                <dd className="text-[#3a362f]">{g.items.join(", ")}</dd>
              </div>
            ))}
          </dl>
        </Block>
      )}

      {r.experience.length > 0 && (
        <Block title={t.exp}>
          <div className="space-y-3.5">
            {r.experience.map((e, i) => (
              <div key={i} className="break-inside-avoid">
                <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                  <p className="text-[13.5px] font-semibold">
                    {e.role}
                    {e.company && <span className="font-normal text-[#3a362f]"> · {e.company}</span>}
                  </p>
                  {e.period && <p className="text-[12px] text-[#5f594f] whitespace-nowrap">{e.period}</p>}
                </div>
                <Bullets items={e.bullets} />
              </div>
            ))}
          </div>
        </Block>
      )}

      {r.projects.length > 0 && (
        <Block title={t.projects}>
          <div className="space-y-3">
            {r.projects.map((p, i) => (
              <div key={i} className="break-inside-avoid">
                <p className="text-[13.5px] font-semibold">
                  {p.name}
                  {p.link && <span className="font-normal text-[12px] text-[#5f594f]"> · {p.link}</span>}
                </p>
                <Bullets items={p.bullets} />
              </div>
            ))}
          </div>
        </Block>
      )}

      {(r.education.length > 0 || r.languages.length > 0) && (
        <div className="grid sm:grid-cols-2 gap-x-8 print:grid-cols-2">
          {r.education.length > 0 && (
            <Block title={t.edu}>
              <Bullets items={r.education} plain />
            </Block>
          )}
          {r.languages.length > 0 && (
            <Block title={t.langs}>
              <p className="text-[12.5px]">{r.languages.join(" · ")}</p>
            </Block>
          )}
        </div>
      )}
    </article>
  );
}

function Block({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mb-5">
      <h2 className="text-[10.5px] font-semibold tracking-[0.12em] uppercase text-[#cf4520] mb-2">{title}</h2>
      {children}
    </section>
  );
}

function Bullets({ items, plain }: { items: string[]; plain?: boolean }) {
  if (!items.length) return null;
  return (
    <ul className="mt-1 space-y-0.5 text-[12.5px] leading-snug text-[#2a2621]">
      {items.map((b, i) => (
        <li key={i} className={plain ? "" : "relative pl-3.5 before:content-[''] before:absolute before:left-0 before:top-[0.6em] before:w-1.5 before:h-px before:bg-[#1b1915]/50"}>
          {b}
        </li>
      ))}
    </ul>
  );
}
