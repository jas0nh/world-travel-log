import { NextResponse } from "next/server";
import { getOverview } from "@/app/lib/places";

export async function GET() {
  return NextResponse.json(await getOverview());
}
