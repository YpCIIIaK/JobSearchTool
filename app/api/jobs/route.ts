import { NextResponse } from "next/server";
import { profileHash } from "@/lib/ai";
import { allJobs, deleteJobs, getSettings } from "@/lib/store";
import { Job, rank } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const sp = new URL(req.url).searchParams;
  const s = getSettings();
  const q = (sp.get("q") ?? "").toLowerCase().trim();
  const status = sp.get("status") ?? "active"; // active = new+saved+applied
  const source = sp.get("source") ?? "";
  const geo = sp.get("geo") ?? (s.hideGeoRestricted ? "ok,maybe" : "");
  const minScore = Number(sp.get("minScore") ?? 0);
  const check = sp.get("check") ?? ""; // done — проверены ИИ, todo — не проверены или проверка устарела
  const sort = sp.get("sort") ?? "rank";
  const salary = sp.get("salary") === "1";

  const all = allJobs();
  const counts = { new: 0, saved: 0, applied: 0, hidden: 0, total: all.length };
  for (const j of all) counts[j.status]++;
  const sources: Record<string, number> = {};
  // Проверка ИИ актуальна, пока не менялись резюме, ключевые слова и правила отсева
  const ph = profileHash(s);
  const aiState = (j: Job) => (!j.ai ? "none" : j.ai.profileHash === ph ? "done" : "stale");
  const checks = { done: 0, none: 0, stale: 0 };

  let list = all.filter((j) => {
    if (status === "active" ? j.status === "hidden" : j.status !== status) return false;
    if (geo && !geo.split(",").includes(j.geo)) return false;
    if (rank(j) < minScore) return false;
    if (salary && !j.salary && !j.ai?.salary) return false;
    if (s.minSalaryUsd && j.salaryUsdMonth && j.salaryUsdMonth < s.minSalaryUsd) return false;
    if (q && !`${j.title} ${j.company} ${j.tags.join(" ")} ${j.location}`.toLowerCase().includes(q)) return false;
    sources[j.source] = (sources[j.source] ?? 0) + 1;
    if (source && j.source !== source) return false;
    const st = aiState(j);
    checks[st]++;
    if (check === "done" && st !== "done") return false;
    if (check === "todo" && st === "done") return false;
    return true;
  });

  const time = (j: Job) => new Date(j.postedAt ?? j.firstSeenAt).getTime();
  list.sort((a, b) =>
    sort === "date" ? time(b) - time(a) : sort === "salary" ? (b.salaryUsdMonth ?? 0) - (a.salaryUsdMonth ?? 0) : rank(b) - rank(a) || time(b) - time(a),
  );

  const total = list.length;
  list = list.slice(0, 400);
  return NextResponse.json({
    total,
    counts,
    sources,
    checks,
    jobs: list.map(({ description, ...rest }) => ({ ...rest, rank: rank(rest as Job), aiState: aiState(rest as Job) })),
  });
}

export async function DELETE(req: Request) {
  const scope = new URL(req.url).searchParams.get("scope");
  const n =
    scope === "all"
      ? deleteJobs(() => true)
      : scope === "hidden"
        ? deleteJobs((j) => j.status === "hidden")
        : deleteJobs((j) => j.status === "new" && Date.now() - new Date(j.lastSeenAt).getTime() > 30 * 864e5);
  return NextResponse.json({ deleted: n });
}
