import { NextResponse } from "next/server";
import { prisma } from "@/app/lib/prisma";

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ placeId: string }> }
) {
  const { placeId } = await context.params;

  await prisma.visit.deleteMany({
    where: { placeId }
  });

  return NextResponse.json({ ok: true });
}
