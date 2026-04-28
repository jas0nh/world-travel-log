import { NextResponse } from "next/server";
import { getMapAssetStatus } from "@/app/lib/mapAssets";

export async function GET() {
  return NextResponse.json(getMapAssetStatus());
}
