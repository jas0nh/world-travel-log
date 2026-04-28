import { NextResponse } from "next/server";
import { getProgress } from "@/app/lib/places";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const parentId = searchParams.get("parentId");
  return NextResponse.json(await getProgress(parentId));
}
