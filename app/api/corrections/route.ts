import { NextResponse } from "next/server";
import { VisitStatus } from "@prisma/client";
import { getCorrections } from "@/app/lib/places";
import { normalizeUserId } from "@/app/lib/users";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const statusParam = searchParams.get("status");
  const status =
    statusParam && Object.values(VisitStatus).includes(statusParam as VisitStatus)
      ? (statusParam as VisitStatus)
      : VisitStatus.VISITED;

  return NextResponse.json(await getCorrections(normalizeUserId(searchParams.get("userId")), status));
}
