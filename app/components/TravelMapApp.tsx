"use client";

import dynamic from "next/dynamic";
import { ArrowLeft, BarChart3, Check, Map, MapPin, Search, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { DatePrecision, type PlaceLevel } from "@prisma/client";
import type { MapLayerDto, OverviewDto, PlaceDto } from "@/app/lib/types";

const TravelMap = dynamic(() => import("./TravelMap"), {
  ssr: false,
  loading: () => <div className="mapLoading">地图加载中...</div>
});

type Breadcrumb = {
  id: string;
  name: string;
  level: PlaceLevel;
};

type PlaceResponse = {
  places: PlaceDto[];
  breadcrumb: Breadcrumb[];
};

const levelLabels: Record<PlaceLevel, string> = {
  COUNTRY: "国家/地区",
  REGION: "地区",
  CITY: "城市"
};

const nextLayerLabel: Record<PlaceLevel, string> = {
  COUNTRY: "查看地区",
  REGION: "查看城市",
  CITY: "城市详情"
};

export default function TravelMapApp() {
  const [parentId, setParentId] = useState<string | null>(null);
  const [places, setPlaces] = useState<PlaceDto[]>([]);
  const [layer, setLayer] = useState<MapLayerDto | null>(null);
  const [rootPlaces, setRootPlaces] = useState<PlaceDto[]>([]);
  const [rootLayer, setRootLayer] = useState<MapLayerDto | null>(null);
  const [breadcrumb, setBreadcrumb] = useState<Breadcrumb[]>([]);
  const [selected, setSelected] = useState<PlaceDto | null>(null);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<"all" | "visited" | "open">("all");
  const [note, setNote] = useState("");
  const [visitedYear, setVisitedYear] = useState("");
  const [visitedMonth, setVisitedMonth] = useState("");
  const [visitedDay, setVisitedDay] = useState("");
  const [activeTab, setActiveTab] = useState<"map" | "overview">("map");
  const [overview, setOverview] = useState<OverviewDto | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const load = useCallback(async (nextParentId: string | null) => {
    setIsLoading(true);
    const suffix = nextParentId ? `?parentId=${nextParentId}` : "";
    const [placeResponse, layerResponse] = await Promise.all([
      fetch(`/api/places${suffix}`),
      fetch(`/api/map-layer${suffix}`)
    ]);
    const placeData = (await placeResponse.json()) as PlaceResponse;
    const layerData = (await layerResponse.json()) as MapLayerDto;
    setPlaces(placeData.places);
    setLayer(layerData);
    setBreadcrumb(placeData.breadcrumb);
    setSelected(null);
    setIsLoading(false);
  }, []);

  useEffect(() => {
    void load(parentId);
  }, [load, parentId]);

  useEffect(() => {
    const loadRootContext = async () => {
      const [placeResponse, layerResponse] = await Promise.all([
        fetch("/api/places"),
        fetch("/api/map-layer")
      ]);
      const placeData = (await placeResponse.json()) as PlaceResponse;
      const layerData = (await layerResponse.json()) as MapLayerDto;
      setRootPlaces(placeData.places);
      setRootLayer(layerData);
    };

    void loadRootContext();
  }, []);

  const loadOverview = useCallback(async () => {
    const response = await fetch("/api/overview");
    const data = (await response.json()) as OverviewDto;
    setOverview(data);
  }, []);

  useEffect(() => {
    if (activeTab === "overview") void loadOverview();
  }, [activeTab, loadOverview]);

  const currentLevel = places[0]?.level ?? "COUNTRY";
  const visitedCount = places.filter((place) => place.visited).length;
  const completion = places.length ? Math.round((visitedCount / places.length) * 100) : 0;

  const filteredPlaces = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase();
    return places.filter((place) => {
      const matchesQuery =
        !normalizedQuery ||
        place.name.toLocaleLowerCase().includes(normalizedQuery) ||
        place.nativeName?.toLocaleLowerCase().includes(normalizedQuery);
      const matchesFilter =
        filter === "all" ||
        (filter === "visited" && place.visited) ||
        (filter === "open" && !place.visited);
      return matchesQuery && matchesFilter;
    });
  }, [filter, places, query]);

  const goBack = () => {
    if (!breadcrumb.length) return;
    const parent = breadcrumb.at(-2);
    setQuery("");
    setParentId(parent?.id ?? null);
  };

  const openPlace = (place: PlaceDto) => {
    setSelected(place);
    setNote(place.note ?? "");
    setVisitedYear(place.visitedYear ? String(place.visitedYear) : "");
    setVisitedMonth(place.visitedMonth ? String(place.visitedMonth) : "");
    setVisitedDay(place.visitedDay ? String(place.visitedDay) : "");
  };

  const drillInto = (place: PlaceDto) => {
    if (place.totalChildren > 0) {
      setQuery("");
      setParentId(place.id);
    } else {
      setSelected(place);
    }
  };

  const jumpToCountry = (placeId: string) => {
    const country = rootPlaces.find((item) => item.id === placeId);
    if (!country) return;

    setQuery("");
    if (country.totalChildren > 0) {
      setParentId(country.id);
      setSelected(null);
      return;
    }

    setParentId(null);
    setSelected(country);
    setNote(country.note ?? "");
    setVisitedYear(country.visitedYear ? String(country.visitedYear) : "");
    setVisitedMonth(country.visitedMonth ? String(country.visitedMonth) : "");
    setVisitedDay(country.visitedDay ? String(country.visitedDay) : "");
  };

  const updateVisitState = (placeId: string, visited: boolean) => {
    const nextDate = getDatePayload(visitedYear, visitedMonth, visitedDay);
    const noteValue = note || null;

    const updatePlace = (place: PlaceDto) =>
      place.id === placeId
        ? {
            ...place,
            visited,
            visitedAt: visited && nextDate.datePrecision === DatePrecision.DAY ? nextDate.visitedAt : null,
            datePrecision: visited ? nextDate.datePrecision : DatePrecision.UNKNOWN,
            visitedYear: visited ? nextDate.visitedYear : null,
            visitedMonth: visited ? nextDate.visitedMonth : null,
            visitedDay: visited ? nextDate.visitedDay : null,
            note: visited ? noteValue : null
          }
        : place;

    setPlaces((currentPlaces) => currentPlaces.map(updatePlace));
    setSelected((currentSelected) => (currentSelected ? updatePlace(currentSelected) : currentSelected));
    setLayer((currentLayer) =>
      currentLayer
        ? {
            ...currentLayer,
            features: currentLayer.features.map((feature) =>
              feature.id === placeId
                ? {
                    ...feature,
                    properties: {
                      ...feature.properties,
                      visited
                    }
                  }
                : feature
            )
          }
        : currentLayer
    );
  };

  const saveVisit = async () => {
    if (!selected) return;
    const datePayload = getDatePayload(visitedYear, visitedMonth, visitedDay);
    const response = await fetch("/api/visits", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        placeId: selected.id,
        ...datePayload,
        note: note || null
      })
    });
    if (response.ok) {
      updateVisitState(selected.id, true);
      if (activeTab === "overview") void loadOverview();
    }
  };

  const removeVisit = async () => {
    if (!selected) return;
    const response = await fetch(`/api/visits/${selected.id}`, { method: "DELETE" });
    if (response.ok) {
      updateVisitState(selected.id, false);
      if (activeTab === "overview") void loadOverview();
    }
  };

  return (
    <div className="workspace">
      <aside className="panel">
        <header className="brand">
          <div>
            <p className="eyebrow">Travel Map</p>
            <h1>旅记地图</h1>
          </div>
          <button className="iconButton" onClick={goBack} disabled={!breadcrumb.length} title="返回上一级">
            <ArrowLeft size={18} />
          </button>
        </header>

        <nav className="crumbs" aria-label="当前位置">
          <button onClick={() => {
            setQuery("");
            setParentId(null);
          }}>世界</button>
          {breadcrumb.map((item) => (
            <button key={item.id} onClick={() => {
              setQuery("");
              setParentId(item.id);
            }}>
              {item.name}
            </button>
          ))}
        </nav>

        <div className="viewTabs" aria-label="工作台视图">
          <button className={activeTab === "map" ? "active" : ""} onClick={() => setActiveTab("map")}>
            <Map size={16} />
            地图
          </button>
          <button className={activeTab === "overview" ? "active" : ""} onClick={() => setActiveTab("overview")}>
            <BarChart3 size={16} />
            总览
          </button>
        </div>

        {activeTab === "map" ? (
          <>
            <section className="progressBlock">
              <div>
                <span>{levelLabels[currentLevel]}</span>
                <strong>
                  {visitedCount}/{places.length}
                </strong>
              </div>
              <div className="meter" aria-label={`完成度 ${completion}%`}>
                <span style={{ width: `${completion}%` }} />
              </div>
              <p>{completion}% 已点亮</p>
            </section>

            <div className="searchRow">
              <Search size={16} />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder={`搜索${levelLabels[currentLevel]}`}
              />
            </div>

            <div className="segmented">
              <button className={filter === "all" ? "active" : ""} onClick={() => setFilter("all")}>全部</button>
              <button className={filter === "visited" ? "active" : ""} onClick={() => setFilter("visited")}>已去过</button>
              <button className={filter === "open" ? "active" : ""} onClick={() => setFilter("open")}>未去过</button>
            </div>

            <section className="placeList" aria-label="地点列表">
              {isLoading ? (
                <div className="empty">正在读取地点...</div>
              ) : filteredPlaces.length ? (
                filteredPlaces.map((place) => (
                  <button
                    key={place.id}
                    className={selected?.id === place.id ? "placeItem selected" : "placeItem"}
                    onClick={() => openPlace(place)}
                    onDoubleClick={() => drillInto(place)}
                  >
                    <span className={place.visited ? "pin visited" : "pin"}>
                      {place.visited ? <Check size={13} /> : <MapPin size={13} />}
                    </span>
                    <span>
                      <strong>{place.nativeName ?? place.name}</strong>
                      <small>
                        {place.totalChildren > 0
                          ? `${place.visitedChildren}/${place.totalChildren} ${nextLayerLabel[place.level]}`
                          : place.visited
                            ? formatPlaceDate(place)
                            : "未去过"}
                      </small>
                    </span>
                  </button>
                ))
              ) : (
                <div className="empty">没有匹配的地点</div>
              )}
            </section>
          </>
        ) : (
          <OverviewPanel overview={overview} />
        )}
      </aside>

      <section className="mapStage">
        {layer && (
          <TravelMap
            layer={layer}
            contextLayer={parentId ? rootLayer : null}
            selectedId={selected?.id ?? null}
            onSelect={(id) => {
              const place = places.find((item) => item.id === id);
              if (place) openPlace(place);
            }}
            onDrill={(id) => {
              const place = places.find((item) => item.id === id);
              if (place) drillInto(place);
            }}
            onJump={jumpToCountry}
          />
        )}
      </section>

      <aside className={selected ? "inspector open" : "inspector"}>
        <button className="iconButton close" onClick={() => setSelected(null)} title="关闭">
          <X size={18} />
        </button>
        {selected ? (
          <>
            <p className="eyebrow">{levelLabels[selected.level]}</p>
            <h2>{selected.nativeName ?? selected.name}</h2>
            <p className="muted">
              {selected.totalChildren > 0
                ? `下一级进度 ${selected.visitedChildren}/${selected.totalChildren}`
                : selected.visited
                  ? "已记录到旅记地图"
                  : "还没有标记去过"}
            </p>
            <label>
              去过日期
              <div className="dateControls">
                <div className="dateParts">
                  <input inputMode="numeric" maxLength={4} placeholder="年" value={visitedYear} onChange={(event) => setVisitedYear(onlyDigits(event.target.value, 4))} />
                  <input inputMode="numeric" maxLength={2} placeholder="月" value={visitedMonth} onChange={(event) => setVisitedMonth(onlyDigits(event.target.value, 2))} />
                  <input inputMode="numeric" maxLength={2} placeholder="日" value={visitedDay} onChange={(event) => setVisitedDay(onlyDigits(event.target.value, 2))} />
                </div>
              </div>
            </label>
            <label>
              备注
              <textarea
                value={note}
                onChange={(event) => setNote(event.target.value)}
                placeholder="比如：第一次独自旅行、转机、短暂停留..."
              />
            </label>
            <div className="actions">
              <button className="primary" onClick={saveVisit}>
                标记去过
              </button>
              <button className="ghost" onClick={removeVisit} disabled={!selected.visited}>
                取消标记
              </button>
            </div>
            {selected.totalChildren > 0 && (
              <button className="wide" onClick={() => drillInto(selected)}>
                {nextLayerLabel[selected.level]}
              </button>
            )}
          </>
        ) : (
          <div className="empty inspectorEmpty">选择地图或列表中的地点</div>
        )}
      </aside>
    </div>
  );
}

function OverviewPanel({ overview }: { overview: OverviewDto | null }) {
  if (!overview) {
    return <div className="empty">正在汇总旅记...</div>;
  }

  const progressItems = [
    ["国家/地区", overview.progress.countries],
    ["中国省份", overview.progress.chinaRegions],
    ["中国城市", overview.progress.chinaCities]
  ] as const;

  return (
    <section className="overviewPane" aria-label="旅行总览">
      <div className="overviewStats">
        {progressItems.map(([label, progress]) => {
          const percent = progress.total ? Math.round((progress.visited / progress.total) * 100) : 0;
          return (
            <article key={label} className="statBlock">
              <span>{label}</span>
              <strong>
                {progress.visited}/{progress.total}
              </strong>
              <div className="meter" aria-label={`${label}完成度 ${percent}%`}>
                <span style={{ width: `${percent}%` }} />
              </div>
            </article>
          );
        })}
      </div>

      <div className="overviewSection">
        <h3>按年份</h3>
        <div className="timelineList">
          {overview.timeline.map((group) => (
            <article key={group.year ?? "unknown"} className="timelineGroup">
              <strong>{group.year ?? "日期未填"}</strong>
              {group.visits.slice(0, 8).map((visit) => (
                <span key={visit.id}>
                  {visit.placeNativeName ?? visit.placeName}
                  <small>{visit.dateLabel}</small>
                </span>
              ))}
            </article>
          ))}
        </div>
      </div>

      <div className="overviewSection">
        <h3>最近记录</h3>
        <div className="recentList">
          {overview.recent.map((visit) => (
            <article key={visit.id}>
              <strong>{visit.placeNativeName ?? visit.placeName}</strong>
              <span>{visit.dateLabel}</span>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

function getDatePayload(visitedYear: string, visitedMonth: string, visitedDay: string) {
  const year = toNumberOrNull(visitedYear);
  const month = toNumberOrNull(visitedMonth);
  const day = toNumberOrNull(visitedDay);
  const datePrecision =
    year && month && day
      ? DatePrecision.DAY
      : year && month
        ? DatePrecision.MONTH
        : year
          ? DatePrecision.YEAR
          : DatePrecision.UNKNOWN;
  const isDay = datePrecision === DatePrecision.DAY && year && month && day;

  return {
    datePrecision,
    visitedYear: datePrecision === DatePrecision.UNKNOWN ? null : year,
    visitedMonth:
      datePrecision === DatePrecision.MONTH || datePrecision === DatePrecision.DAY ? month : null,
    visitedDay: datePrecision === DatePrecision.DAY ? day : null,
    visitedAt: isDay ? `${year}-${padDatePart(month)}-${padDatePart(day)}` : null
  };
}

function formatPlaceDate(place: PlaceDto) {
  if (place.datePrecision === DatePrecision.DAY && place.visitedYear && place.visitedMonth && place.visitedDay) {
    return `${place.visitedYear}-${padDatePart(place.visitedMonth)}-${padDatePart(place.visitedDay)}`;
  }
  if (place.datePrecision === DatePrecision.MONTH && place.visitedYear && place.visitedMonth) {
    return `${place.visitedYear}-${padDatePart(place.visitedMonth)}`;
  }
  if (place.datePrecision === DatePrecision.YEAR && place.visitedYear) {
    return String(place.visitedYear);
  }
  return "日期未填";
}

function onlyDigits(value: string, maxLength: number) {
  return value.replace(/\D/g, "").slice(0, maxLength);
}

function toNumberOrNull(value: string) {
  if (!value) return null;
  const number = Number(value);
  return Number.isInteger(number) ? number : null;
}

function padDatePart(value: number) {
  return String(value).padStart(2, "0");
}
