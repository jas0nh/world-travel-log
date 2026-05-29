import { DatePrecision, VisitStatus } from "@prisma/client";
import { NextResponse } from "next/server";
import { prisma } from "@/app/lib/prisma";
import { recomputeDerivedVisits } from "@/app/lib/visit-logic";
import { normalizeUserId } from "@/app/lib/users";

export async function POST(request: Request) {
  const body = (await request.json()) as {
    placeId?: string;
    status?: VisitStatus;
    visitedAt?: string | null;
    datePrecision?: DatePrecision;
    visitedYear?: number | null;
    visitedMonth?: number | null;
    visitedDay?: number | null;
    note?: string | null;
    userId?: string | null;
  };
  const userId = normalizeUserId(body.userId);

  if (!body.placeId) {
    return NextResponse.json({ error: "placeId is required" }, { status: 400 });
  }

  const place = await prisma.place.findUnique({ where: { id: body.placeId } });
  if (!place) {
    return NextResponse.json({ error: "Place not found" }, { status: 404 });
  }

  const parsedDate = normalizeVisitPayload(body);
  if (!parsedDate.ok) {
    return NextResponse.json({ error: parsedDate.error }, { status: 400 });
  }

  const visit = await prisma.$transaction(async (tx) => {
    const savedVisit = await tx.visit.upsert({
      where: { userId_placeId: { userId, placeId: body.placeId! } },
      create: {
        userId,
        placeId: body.placeId!,
        ...parsedDate.data,
        isDerived: false,
        note: body.note?.trim() || null
      },
      update: {
        ...parsedDate.data,
        isDerived: false,
        note: body.note?.trim() || null
      }
    });

    await recomputeDerivedVisits(tx, userId);
    return savedVisit;
  });

  return NextResponse.json({ visit });
}

function normalizeVisitPayload(body: {
  status?: VisitStatus;
  visitedAt?: string | null;
  datePrecision?: DatePrecision;
  visitedYear?: number | null;
  visitedMonth?: number | null;
  visitedDay?: number | null;
}):
  | {
      ok: true;
      data: {
        status: VisitStatus;
        visitedAt: Date | null;
        datePrecision: DatePrecision;
        visitedYear: number | null;
        visitedMonth: number | null;
        visitedDay: number | null;
      };
    }
  | { ok: false; error: string } {
  const status = body.status ?? VisitStatus.VISITED;
  if (!Object.values(VisitStatus).includes(status)) {
    return { ok: false, error: "Invalid status" };
  }

  if (status === VisitStatus.PLANNED) {
    return {
      ok: true,
      data: {
        status,
        visitedAt: null,
        datePrecision: DatePrecision.UNKNOWN,
        visitedYear: null,
        visitedMonth: null,
        visitedDay: null
      }
    };
  }

  const legacyDate = body.visitedAt?.trim();
  const precision = body.datePrecision ?? (legacyDate ? DatePrecision.DAY : DatePrecision.UNKNOWN);

  if (!Object.values(DatePrecision).includes(precision)) {
    return { ok: false, error: "Invalid datePrecision" };
  }

  if (precision === DatePrecision.UNKNOWN) {
    return {
      ok: true,
      data: {
        status,
        visitedAt: null,
        datePrecision: precision,
        visitedYear: null,
        visitedMonth: null,
        visitedDay: null
      }
    };
  }

  let visitedYear = numberOrNull(body.visitedYear);
  let visitedMonth = numberOrNull(body.visitedMonth);
  let visitedDay = numberOrNull(body.visitedDay);

  if (legacyDate && (!visitedYear || (precision !== DatePrecision.YEAR && !visitedMonth))) {
    const parsed = parseLegacyDate(legacyDate);
    if (!parsed) return { ok: false, error: "Invalid visitedAt" };
    visitedYear = parsed.year;
    visitedMonth = parsed.month;
    visitedDay = parsed.day;
  }

  if (!visitedYear || visitedYear < 1900 || visitedYear > 2100) {
    return { ok: false, error: "visitedYear must be between 1900 and 2100" };
  }

  if (precision === DatePrecision.YEAR) {
    return {
      ok: true,
      data: { status, visitedAt: null, datePrecision: precision, visitedYear, visitedMonth: null, visitedDay: null }
    };
  }

  if (!visitedMonth || visitedMonth < 1 || visitedMonth > 12) {
    return { ok: false, error: "visitedMonth must be between 1 and 12" };
  }

  if (precision === DatePrecision.MONTH) {
    return {
      ok: true,
      data: { status, visitedAt: null, datePrecision: precision, visitedYear, visitedMonth, visitedDay: null }
    };
  }

  if (!visitedDay || visitedDay < 1 || visitedDay > 31) {
    return { ok: false, error: "visitedDay must be between 1 and 31" };
  }

  const visitedAt = new Date(Date.UTC(visitedYear, visitedMonth - 1, visitedDay));
  if (
    visitedAt.getUTCFullYear() !== visitedYear ||
    visitedAt.getUTCMonth() !== visitedMonth - 1 ||
    visitedAt.getUTCDate() !== visitedDay
  ) {
    return { ok: false, error: "Invalid visit date" };
  }

  return {
    ok: true,
    data: { status, visitedAt, datePrecision: precision, visitedYear, visitedMonth, visitedDay }
  };
}

function numberOrNull(value: number | null | undefined) {
  return Number.isInteger(value) ? Number(value) : null;
}

function parseLegacyDate(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;
  return {
    year: Number(match[1]),
    month: Number(match[2]),
    day: Number(match[3])
  };
}
