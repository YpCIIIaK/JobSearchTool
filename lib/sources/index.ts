import { RawJob, Settings, SourceId } from "../types";
import { arbeitnow } from "./arbeitnow";
import { ats } from "./ats";
import { cryptocurrencyjobs, cryptojobslist } from "./crypto";
import { habr } from "./habr";
import { hh } from "./hh";
import { himalayas } from "./himalayas";
import { jobicy } from "./jobicy";
import { linkedin } from "./linkedin";
import { djinni } from "./djinni";
import { getmatch } from "./getmatch";
import { remoteok } from "./remoteok";
import { remotive } from "./remotive";
import { telegram } from "./telegram";
import { weworkremotely } from "./weworkremotely";
import { workingnomads } from "./workingnomads";

export const SOURCES: Record<SourceId, (s: Settings) => Promise<RawJob[]>> = {
  remotive,
  remoteok,
  himalayas,
  jobicy,
  arbeitnow,
  weworkremotely,
  workingnomads,
  habr,
  hh,
  linkedin,
  djinni,
  getmatch,
  ats,
  cryptojobslist,
  cryptocurrencyjobs,
  telegram,
};
