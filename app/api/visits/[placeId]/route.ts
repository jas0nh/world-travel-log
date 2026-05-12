import { NextResponse } from "next/server";
import { prisma } from "@/app/lib/prisma";
import { recomputeDerivedVisits } from "@/app/lib/visit-logic";
import { normalizeUserId } from "@/app/lib/users";

export async function DELETE(
  request: Request,
  context: { params: Promise<{ placeId: string }> }
) {
  const { placeId } = await context.params;
  const { searchParams } = new URL(request.url);
  const userId = normalizeUserId(searchParams.get("userId"));

  await prisma.$transaction(async (tx) => {
    await tx.visit.deleteMany({
      where: { userId, placeId, isDerived: false }
    });

    await recomputeDerivedVisits(tx, userId);
  });

  return NextResponse.json({ ok: true });
}
