import { NextResponse } from "next/server";
import { getOverview } from "@/app/lib/places";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json(await getOverview());
}
