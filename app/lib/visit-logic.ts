import { DatePrecision, type Prisma } from "@prisma/client";

type PlaceNode = {
  id: string;
  children: Array<{ id: string }>;
  visits: Array<{
    visitedAt: Date | null;
    datePrecision: DatePrecision;
    visitedYear: number | null;
    visitedMonth: number | null;
    visitedDay: number | null;
    isDerived: boolean;
    note: string | null;
  }>;
};

type VisitPayload = {
  visitedAt: Date | null;
  datePrecision: DatePrecision;
  visitedYear: number | null;
  visitedMonth: number | null;
  visitedDay: number | null;
};

type EffectiveVisit = VisitPayload & {
  note: string | null;
};

const forcedDerivedLinks = [
  { parentId: "country-sg", childId: "city-ne-1159151627" },
  { parentId: "country-hk", childId: "city-cn-hk-hongkong" }
];

export async function recomputeDerivedVisits(tx: Prisma.TransactionClient, userId: string) {
  const places = await tx.place.findMany({
    include: {
      visits: { where: { userId } },
      children: { select: { id: true } }
    }
  });

  const explicitVisits = new Map<string, EffectiveVisit>();
  const currentDerivedIds = new Set<string>();

  for (const place of places as PlaceNode[]) {
    const visit = place.visits[0];
    if (!visit) continue;
    if (visit.isDerived) currentDerivedIds.add(place.id);
    else explicitVisits.set(place.id, toEffectiveVisit(visit));
  }

  const effectiveVisits = new Map(explicitVisits);
  let changed = true;

  while (changed) {
    changed = false;

    for (const link of forcedDerivedLinks) {
      const parentVisit = effectiveVisits.get(link.parentId);
      if (!parentVisit || explicitVisits.has(link.childId)) continue;

      const nextVisit = asDerivedVisit(parentVisit);
      const previousVisit = effectiveVisits.get(link.childId);
      if (!sameEffectiveVisit(previousVisit, nextVisit)) {
        effectiveVisits.set(link.childId, nextVisit);
        changed = true;
      }

      if (explicitVisits.has(link.parentId)) continue;

      const childVisit = effectiveVisits.get(link.childId);
      if (!childVisit) continue;

      const nextParentVisit = asDerivedVisit(childVisit);
      const previousParentVisit = effectiveVisits.get(link.parentId);
      if (!sameEffectiveVisit(previousParentVisit, nextParentVisit)) {
        effectiveVisits.set(link.parentId, nextParentVisit);
        changed = true;
      }
    }

    for (const place of places as PlaceNode[]) {
      const placeVisit = effectiveVisits.get(place.id);
      if (!placeVisit || place.children.length !== 1) continue;

      const childId = place.children[0].id;
      if (explicitVisits.has(childId)) continue;

      const nextVisit = asDerivedVisit(placeVisit);
      const previousVisit = effectiveVisits.get(childId);
      if (!sameEffectiveVisit(previousVisit, nextVisit)) {
        effectiveVisits.set(childId, nextVisit);
        changed = true;
      }
    }

    for (const place of places as PlaceNode[]) {
      if (explicitVisits.has(place.id) || place.children.length === 0) continue;

      const childVisits = place.children
        .map((child) => effectiveVisits.get(child.id))
        .filter((visit): visit is EffectiveVisit => Boolean(visit));

      if (!childVisits.length) {
        if (effectiveVisits.delete(place.id)) changed = true;
        continue;
      }

      const nextVisit = asDerivedVisit(
        childVisits.reduce((earliest, candidate) =>
          compareVisitChronology(candidate, earliest) < 0 ? candidate : earliest
        )
      );

      const previousVisit = effectiveVisits.get(place.id);
      if (!sameEffectiveVisit(previousVisit, nextVisit)) {
        effectiveVisits.set(place.id, nextVisit);
        changed = true;
      }
    }
  }

  const derivedVisits = new Map(
    [...effectiveVisits.entries()].filter(([placeId]) => !explicitVisits.has(placeId))
  );
  const staleDerivedIds = [...currentDerivedIds].filter((placeId) => !derivedVisits.has(placeId));

  if (staleDerivedIds.length) {
    await tx.visit.deleteMany({
      where: {
        userId,
        placeId: { in: staleDerivedIds },
        isDerived: true
      }
    });
  }

  for (const [placeId, visit] of derivedVisits) {
    await tx.visit.upsert({
      where: { userId_placeId: { userId, placeId } },
      create: {
        userId,
        placeId,
        ...visit,
        isDerived: true
      },
      update: {
        ...visit,
        isDerived: true
      }
    });
  }
}

function toEffectiveVisit(visit: {
  visitedAt: Date | null;
  datePrecision: DatePrecision;
  visitedYear: number | null;
  visitedMonth: number | null;
  visitedDay: number | null;
  note: string | null;
}) {
  return {
    visitedAt: visit.visitedAt,
    datePrecision: visit.datePrecision,
    visitedYear: visit.visitedYear,
    visitedMonth: visit.visitedMonth,
    visitedDay: visit.visitedDay,
    note: visit.note
  };
}

function asDerivedVisit(visit: EffectiveVisit): EffectiveVisit {
  return {
    visitedAt: visit.visitedAt,
    datePrecision: visit.datePrecision,
    visitedYear: visit.visitedYear,
    visitedMonth: visit.visitedMonth,
    visitedDay: visit.visitedDay,
    note: null
  };
}

function sameEffectiveVisit(a: EffectiveVisit | undefined, b: EffectiveVisit) {
  if (!a) return false;
  return (
    a.datePrecision === b.datePrecision &&
    a.visitedAt?.getTime() === b.visitedAt?.getTime() &&
    a.visitedYear === b.visitedYear &&
    a.visitedMonth === b.visitedMonth &&
    a.visitedDay === b.visitedDay &&
    a.note === b.note
  );
}

function compareVisitChronology(a: EffectiveVisit, b: EffectiveVisit) {
  const aKey = chronologyKey(a);
  const bKey = chronologyKey(b);

  for (let index = 0; index < aKey.length; index += 1) {
    if (aKey[index] !== bKey[index]) {
      return aKey[index] - bKey[index];
    }
  }
  return 0;
}

function chronologyKey(visit: EffectiveVisit) {
  if (visit.datePrecision === DatePrecision.YEAR && visit.visitedYear) {
    return [visit.visitedYear, 1, 1, 0];
  }
  if (visit.datePrecision === DatePrecision.MONTH && visit.visitedYear && visit.visitedMonth) {
    return [visit.visitedYear, visit.visitedMonth, 1, 1];
  }
  if (visit.datePrecision === DatePrecision.DAY && visit.visitedYear && visit.visitedMonth && visit.visitedDay) {
    return [visit.visitedYear, visit.visitedMonth, visit.visitedDay, 2];
  }
  if (visit.visitedAt) {
    return [
      visit.visitedAt.getUTCFullYear(),
      visit.visitedAt.getUTCMonth() + 1,
      visit.visitedAt.getUTCDate(),
      2
    ];
  }
  return [Number.MAX_SAFE_INTEGER, 12, 31, 3];
}
