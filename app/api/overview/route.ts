import { NextResponse } from "next/server";
import { getOverview } from "@/app/lib/places";
import { normalizeUserId } from "@/app/lib/users";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  return NextResponse.json(await getOverview(normalizeUserId(searchParams.get("userId"))));
}
