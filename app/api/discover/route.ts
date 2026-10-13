import { NextResponse } from "next/server";
import { discoverCompanies } from "@/lib/discover";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function POST() {
  try {
    return NextResponse.json({ companies: await discoverCompanies() });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
