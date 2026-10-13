"use client";

import ResumeView from "@/components/ResumeView";
import { Job } from "@/lib/types";
import { useEffect, useState } from "react";

// Страница печати: «Сохранить как PDF» в диалоге печати браузера
export default function PrintResume() {
  const [job, setJob] = useState<Job | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const id = new URLSearchParams(location.search).get("job");
    if (!id) return setError("Не указана вакансия");
    fetch(`/api/jobs/${id}`)
      .then((r) => r.json())
      .then((j: Job) => {
        if (!j.resume) throw new Error("Для этой вакансии ещё нет резюме");
        setJob(j);
        document.title = [j.resume.name, j.company, "CV"].filter(Boolean).join(" — ");
        // Даём шрифтам загрузиться и открываем диалог печати
        setTimeout(() => window.print(), 600);
      })
      .catch((e) => setError(e.message));
  }, []);

  if (error) return <p className="p-10 text-bad">{error}</p>;
  if (!job?.resume) return <p className="p-10 text-muted">Готовлю резюме…</p>;
  return (
    <div className="print-page h-full overflow-y-auto bg-raised py-8 print:p-0 print:bg-white print:h-auto print:overflow-visible">
      <div className="no-print max-w-[210mm] mx-auto mb-4 flex items-center gap-3 px-4 text-[13px] text-muted">
        <span className="flex-1">
          В диалоге печати выберите «Сохранить как PDF». Поля — «По умолчанию», фон — включить.
        </span>
        <button onClick={() => window.print()} className="h-8 px-3 rounded-lg bg-fg text-bg font-medium">
          Печать / PDF
        </button>
      </div>
      <div className="max-w-[210mm] mx-auto bg-white shadow-[var(--shadow-pop)] px-[16mm] py-[14mm] print:shadow-none print:p-0">
        <ResumeView r={job.resume} />
      </div>
    </div>
  );
}
