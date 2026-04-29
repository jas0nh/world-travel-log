import { NextResponse } from "next/server";
import { getMapLayer } from "@/app/lib/places";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  return NextResponse.json(await getMapLayer(searchParams.get("parentId")));
}
