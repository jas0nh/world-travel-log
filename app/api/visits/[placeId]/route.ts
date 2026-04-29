import { NextResponse } from "next/server";
import { prisma } from "@/app/lib/prisma";
import { recomputeDerivedVisits } from "@/app/lib/visit-logic";

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ placeId: string }> }
) {
  const { placeId } = await context.params;

  await prisma.$transaction(async (tx) => {
    await tx.visit.deleteMany({
      where: { placeId, isDerived: false }
    });

    await recomputeDerivedVisits(tx);
  });

  return NextResponse.json({ ok: true });
}
