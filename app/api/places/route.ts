import { PlaceLevel } from "@prisma/client";
import { NextResponse } from "next/server";
import { getBreadcrumb, listPlaces } from "@/app/lib/places";
import { normalizeUserId } from "@/app/lib/users";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const parentId = searchParams.get("parentId");
  const userId = normalizeUserId(searchParams.get("userId"));
  const levelParam = searchParams.get("level") as PlaceLevel | null;
  const level =
    levelParam && Object.values(PlaceLevel).includes(levelParam)
      ? levelParam
      : undefined;

  const [places, breadcrumb] = await Promise.all([
    listPlaces({ parentId, level, userId }),
    getBreadcrumb(parentId)
  ]);

  return NextResponse.json({ places, breadcrumb });
}
