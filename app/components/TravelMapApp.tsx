"use client";

import dynamic from "next/dynamic";
import { ArrowLeft, BarChart3, Check, Database, Flag, Map, MapPin, Save, Search, UserRound, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useState, type CSSProperties } from "react";
import { DatePrecision, VisitStatus, type PlaceLevel } from "@prisma/client";
import type { CorrectionNodeDto, CorrectionsDto, MapLayerDto, OverviewDto, PlaceDisplayStatus, PlaceDto } from "@/app/lib/types";
import { appUsers, defaultUserId } from "@/app/lib/users";

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
  REGION: "行政区",
  CITY: "城市"
};

const nextLayerLabel: Record<PlaceLevel, string | null> = {
  COUNTRY: "查看行政区",
  REGION: "查看地点",
  CITY: null
};

export default function TravelMapApp() {
  const [parentId, setParentId] = useState<string | null>(null);
  const [activeUserId, setActiveUserId] = useState(defaultUserId);
  const [skipFitToken, setSkipFitToken] = useState(0);
  const [places, setPlaces] = useState<PlaceDto[]>([]);
  const [layer, setLayer] = useState<MapLayerDto | null>(null);
  const [rootPlaces, setRootPlaces] = useState<PlaceDto[]>([]);
  const [rootLayer, setRootLayer] = useState<MapLayerDto | null>(null);
  const [breadcrumb, setBreadcrumb] = useState<Breadcrumb[]>([]);
  const [selected, setSelected] = useState<PlaceDto | null>(null);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<"all" | "visited" | "planned" | "open">("all");
  const [note, setNote] = useState("");
  const [editorStatus, setEditorStatus] = useState<VisitStatus>(VisitStatus.VISITED);
  const [visitedYear, setVisitedYear] = useState("");
  const [visitedMonth, setVisitedMonth] = useState("");
  const [visitedDay, setVisitedDay] = useState("");
  const [activeTab, setActiveTab] = useState<"map" | "overview" | "correction">("map");
  const [overview, setOverview] = useState<OverviewDto | null>(null);
  const [corrections, setCorrections] = useState<CorrectionsDto | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const activeUser = appUsers.find((user) => user.id === activeUserId) ?? appUsers[0];
  const userQuery = useCallback(
    (prefix = "?") => `${prefix}userId=${encodeURIComponent(activeUserId)}`,
    [activeUserId]
  );

  const applySelection = useCallback((place: PlaceDto | null) => {
    setSelected(place);
    setNote(place?.note ?? "");
    setEditorStatus(place?.visitStatus === VisitStatus.PLANNED ? VisitStatus.PLANNED : VisitStatus.VISITED);
    setVisitedYear(place?.visitedYear ? String(place.visitedYear) : "");
    setVisitedMonth(place?.visitedMonth ? String(place.visitedMonth) : "");
    setVisitedDay(place?.visitedDay ? String(place.visitedDay) : "");
  }, []);

  const load = useCallback(
    async (nextParentId: string | null, selectedId?: string | null) => {
      setIsLoading(true);
      const suffix = nextParentId
        ? `?parentId=${encodeURIComponent(nextParentId)}&userId=${encodeURIComponent(activeUserId)}`
        : userQuery();
      const [placeResponse, layerResponse] = await Promise.all([
        fetch(`/api/places${suffix}`),
        fetch(`/api/map-layer${suffix}`)
      ]);
      const placeData = (await placeResponse.json()) as PlaceResponse;
      const layerData = (await layerResponse.json()) as MapLayerDto;
      setPlaces(placeData.places);
      setLayer(layerData);
      setBreadcrumb(placeData.breadcrumb);
      applySelection(selectedId ? placeData.places.find((place) => place.id === selectedId) ?? null : null);
      setIsLoading(false);
    },
    [activeUserId, applySelection, userQuery]
  );

  useEffect(() => {
    void load(parentId);
  }, [load, parentId]);

  const loadRootContext = useCallback(async () => {
    const suffix = userQuery();
    const [placeResponse, layerResponse] = await Promise.all([
      fetch(`/api/places${suffix}`),
      fetch(`/api/map-layer${suffix}`)
    ]);
    const placeData = (await placeResponse.json()) as PlaceResponse;
    const layerData = (await layerResponse.json()) as MapLayerDto;
    setRootPlaces(placeData.places);
    setRootLayer(layerData);
  }, [userQuery]);

  useEffect(() => {
    void loadRootContext();
  }, [loadRootContext]);

  const loadOverview = useCallback(async () => {
    const response = await fetch(`/api/overview${userQuery()}`);
    const data = (await response.json()) as OverviewDto;
    setOverview(data);
  }, [userQuery]);

  const loadCorrections = useCallback(async () => {
    const response = await fetch(`/api/corrections${userQuery()}`);
    const data = (await response.json()) as CorrectionsDto;
    setCorrections(data);
  }, [userQuery]);

  useEffect(() => {
    if (activeTab === "overview") void loadOverview();
    if (activeTab === "correction") void loadCorrections();
  }, [activeTab, loadCorrections, loadOverview]);

  const currentLevel = places[0]?.level ?? "COUNTRY";
  const visitedCount = places.filter((place) => place.visited).length;
  const plannedCount = places.filter((place) => place.visitStatus === VisitStatus.PLANNED).length;
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
        (filter === "visited" && place.visitStatus === VisitStatus.VISITED) ||
        (filter === "planned" && place.visitStatus === VisitStatus.PLANNED) ||
        (filter === "open" && place.visitStatus === "NONE");
      return matchesQuery && matchesFilter;
    });
  }, [filter, places, query]);

  const goBack = () => {
    if (!breadcrumb.length) return;
    const parent = breadcrumb.at(-2);
    setQuery("");
    if (!parent?.id) setSkipFitToken((current) => current + 1);
    setParentId(parent?.id ?? null);
  };

  const goWorld = () => {
    setQuery("");
    setSelected(null);
    setParentId(null);
  };

  const switchUser = () => {
    setActiveUserId((currentUserId) => {
      const currentIndex = appUsers.findIndex((user) => user.id === currentUserId);
      return appUsers[(currentIndex + 1) % appUsers.length].id;
    });
    setSelected(null);
    setOverview(null);
    setCorrections(null);
    setEditorStatus(VisitStatus.VISITED);
  };

  const openPlace = (place: PlaceDto) => {
    applySelection(place);
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
    if (currentLevel !== "COUNTRY") {
      setSkipFitToken((current) => current + 1);
      setParentId(null);
      setSelected(null);
      return;
    }

    if (country.totalChildren > 0) {
      setParentId(country.id);
      setSelected(null);
      return;
    }

    setParentId(null);
    applySelection(country);
  };

  const updateVisitState = (placeId: string, status: VisitStatus | "NONE") => {
    const nextDate = getDatePayload(visitedYear, visitedMonth, visitedDay);
    const noteValue = note || null;
    const nextVisitStatus: PlaceDto["visitStatus"] = status === "NONE" ? "NONE" : status;

    const updatePlace = (place: PlaceDto) =>
      place.id === placeId
        ? {
            ...place,
            visitStatus: nextVisitStatus,
            displayStatus: getDisplayStatus(nextVisitStatus, place.hasPlannedChildren),
            visited: nextVisitStatus === VisitStatus.VISITED,
            visitedAt: status === VisitStatus.VISITED && nextDate.datePrecision === DatePrecision.DAY ? nextDate.visitedAt : null,
            datePrecision: status === VisitStatus.VISITED ? nextDate.datePrecision : DatePrecision.UNKNOWN,
            visitedYear: status === VisitStatus.VISITED ? nextDate.visitedYear : null,
            visitedMonth: status === VisitStatus.VISITED ? nextDate.visitedMonth : null,
            visitedDay: status === VisitStatus.VISITED ? nextDate.visitedDay : null,
            isDerived: false,
            note: status === "NONE" ? null : noteValue
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
                      visitStatus: nextVisitStatus,
                      displayStatus: getDisplayStatus(nextVisitStatus, feature.properties.hasPlannedChildren),
                      visited: nextVisitStatus === VisitStatus.VISITED
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
        userId: activeUserId,
        placeId: selected.id,
        status: editorStatus,
        ...(editorStatus === VisitStatus.VISITED ? datePayload : {}),
        note: note || null
      })
    });
    if (response.ok) {
      updateVisitState(selected.id, editorStatus);
      await loadRootContext();
      if (activeTab === "overview") void loadOverview();
    }
  };

  const removeVisit = async () => {
    if (!selected) return;
    const response = await fetch(`/api/visits/${selected.id}${userQuery()}`, { method: "DELETE" });
    if (response.ok) {
      updateVisitState(selected.id, "NONE");
      await loadRootContext();
      if (activeTab === "overview") void loadOverview();
    }
  };

  const saveCorrection = async (node: CorrectionNodeDto, edit: CorrectionEdit) => {
    const datePayload = getDatePayload(edit.visitedYear, edit.visitedMonth, edit.visitedDay);
    const response = await fetch("/api/visits", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        userId: activeUserId,
        placeId: node.id,
        status: VisitStatus.VISITED,
        ...datePayload,
        note: edit.note || null
      })
    });
    if (response.ok) {
      await Promise.all([load(parentId), loadCorrections()]);
      setOverview(null);
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
          <div className="headerActions">
            <button className="userSwitch" onClick={switchUser} title={`当前用户：${activeUser.name}`}>
              <UserRound size={16} />
              <span>{activeUser.name}</span>
            </button>
            <button className="iconButton" onClick={goBack} disabled={!breadcrumb.length} title="返回上一级">
              <ArrowLeft size={18} />
            </button>
          </div>
        </header>

        <nav className="crumbs" aria-label="当前位置">
          <button onClick={() => {
            setQuery("");
            setSkipFitToken((current) => current + 1);
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
          <button className={activeTab === "correction" ? "active" : ""} onClick={() => setActiveTab("correction")}>
            <Database size={16} />
            校正
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
              <p>{completion}% 已点亮{plannedCount ? ` · ${plannedCount} 个计划中` : ""}</p>
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
              <button className={filter === "visited" ? "active" : ""} onClick={() => setFilter("visited")}>已到访</button>
              <button className={filter === "planned" ? "active" : ""} onClick={() => setFilter("planned")}>计划中</button>
              <button className={filter === "open" ? "active" : ""} onClick={() => setFilter("open")}>未标记</button>
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
                    {renderPlacePin(place)}
                    <span>
                      <strong>{place.nativeName ?? place.name}</strong>
                      <small>
                        {place.totalChildren > 0
                          ? `${place.visitedChildren}/${place.totalChildren} 已到访${place.plannedChildren ? ` · ${place.plannedChildren} 个计划中` : ""}`
                          : place.visitStatus === VisitStatus.VISITED
                            ? formatPlaceDate(place)
                            : place.visitStatus === VisitStatus.PLANNED
                              ? "计划中"
                              : "未标记"}
                      </small>
                    </span>
                  </button>
                ))
              ) : (
                <div className="empty">没有匹配的地点</div>
              )}
            </section>
          </>
        ) : activeTab === "overview" ? (
          <OverviewPanel overview={overview} />
        ) : (
          <div className="empty">数据校正已打开</div>
        )}
      </aside>

      <section className="mapStage">
        {layer && (
          <TravelMap
            layer={layer}
            contextLayer={parentId ? rootLayer : null}
            selectedId={selected?.id ?? null}
            skipFitToken={skipFitToken}
            onSelect={(id) => {
              const place = places.find((item) => item.id === id);
              if (place) openPlace(place);
            }}
            onDrill={(id) => {
              const place = places.find((item) => item.id === id);
              if (place) drillInto(place);
            }}
            onJump={jumpToCountry}
            onBack={goBack}
            onWorld={goWorld}
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
              {selected.displayStatus === "VISITED_WITH_PLANNED_CHILDREN"
                ? `已到访，且下级还有 ${selected.plannedChildren} 个计划中的地点`
                : selected.totalChildren > 0
                  ? `下一级进度 ${selected.visitedChildren}/${selected.totalChildren}${selected.plannedChildren ? ` · ${selected.plannedChildren} 个计划中` : ""}`
                  : selected.visitStatus === VisitStatus.VISITED
                    ? "已记录到旅记地图"
                    : selected.visitStatus === VisitStatus.PLANNED
                      ? "未来目的地 / 待出发"
                      : "还没有标记"}
            </p>
            <div className="segmented inspectorSegmented">
              <button
                className={editorStatus === VisitStatus.PLANNED ? "active" : ""}
                onClick={() => setEditorStatus(VisitStatus.PLANNED)}
              >
                计划中
              </button>
              <button
                className={editorStatus === VisitStatus.VISITED ? "active" : ""}
                onClick={() => setEditorStatus(VisitStatus.VISITED)}
              >
                已到访
              </button>
            </div>
            {editorStatus === VisitStatus.VISITED && (
            <label>
              到访日期
              <div className="dateControls">
                <div className="dateParts">
                  <input inputMode="numeric" maxLength={4} placeholder="年" value={visitedYear} onChange={(event) => setVisitedYear(onlyDigits(event.target.value, 4))} />
                  <input inputMode="numeric" maxLength={2} placeholder="月" value={visitedMonth} onChange={(event) => setVisitedMonth(onlyDigits(event.target.value, 2))} />
                  <input inputMode="numeric" maxLength={2} placeholder="日" value={visitedDay} onChange={(event) => setVisitedDay(onlyDigits(event.target.value, 2))} />
                </div>
              </div>
            </label>
            )}
            <label>
              备注
              <textarea
                value={note}
                onChange={(event) => setNote(event.target.value)}
                placeholder={editorStatus === VisitStatus.PLANNED ? "比如：秋天想去、想顺路安排、先留个坑..." : "比如：第一次独自旅行、转机、短暂停留..."}
              />
            </label>
            <div className="actions">
              <button className="primary" onClick={saveVisit}>
                {editorStatus === VisitStatus.PLANNED ? "标记计划" : "标记去过"}
              </button>
              <button className="ghost" onClick={removeVisit} disabled={selected.visitStatus === "NONE" || selected.isDerived}>
                清除标记
              </button>
            </div>
            {selected.totalChildren > 0 && (
              <button className="wide" onClick={() => drillInto(selected)}>
                {getNextLayerLabel(selected)}
              </button>
            )}
          </>
        ) : (
          <div className="empty inspectorEmpty">选择地图或列表中的地点</div>
        )}
      </aside>

      {activeTab === "correction" && (
        <CorrectionWorkbench
          activeUserName={activeUser.name}
          corrections={corrections}
          onClose={() => setActiveTab("map")}
          onSave={saveCorrection}
        />
      )}
    </div>
  );
}

type CorrectionEdit = {
  visitedYear: string;
  visitedMonth: string;
  visitedDay: string;
  note: string;
};

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
              <small>{progress.planned ? `${progress.planned} 个计划中` : "暂无计划中地点"}</small>
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

function CorrectionWorkbench({
  activeUserName,
  corrections,
  onClose,
  onSave
}: {
  activeUserName: string;
  corrections: CorrectionsDto | null;
  onClose: () => void;
  onSave: (node: CorrectionNodeDto, edit: CorrectionEdit) => Promise<void>;
}) {
  const [edits, setEdits] = useState<Record<string, CorrectionEdit>>({});
  const [savingId, setSavingId] = useState<string | null>(null);
  const [expandedIds, setExpandedIds] = useState<string[]>([]);

  useEffect(() => {
    if (!corrections) return;
    const nextEdits: Record<string, CorrectionEdit> = {};
    visitCorrectionNodes(corrections.roots, (node) => {
      if (!node.visit) return;
      nextEdits[node.id] = {
        visitedYear: node.visit.visitedYear ? String(node.visit.visitedYear) : "",
        visitedMonth: node.visit.visitedMonth ? String(node.visit.visitedMonth) : "",
        visitedDay: node.visit.visitedDay ? String(node.visit.visitedDay) : "",
        note: node.visit.note ?? ""
      };
    });
    setEdits(nextEdits);
  }, [corrections]);

  const updateEdit = (placeId: string, patch: Partial<CorrectionEdit>) => {
    setEdits((current) => ({
      ...current,
      [placeId]: {
        ...(current[placeId] ?? { visitedYear: "", visitedMonth: "", visitedDay: "", note: "" }),
        ...patch
      }
    }));
  };

  const saveNode = async (node: CorrectionNodeDto) => {
    const edit = edits[node.id];
    if (!edit) return;
    setSavingId(node.id);
    await onSave(node, edit);
    setSavingId(null);
  };

  const toggleNode = (node: CorrectionNodeDto) => {
    if (!node.children.length) return;
    setExpandedIds((current) =>
      current.includes(node.id) ? current.filter((placeId) => placeId !== node.id) : [...current, node.id]
    );
  };

  return (
    <section className="correctionOverlay" aria-label="数据校正">
      <header className="correctionHeader">
        <div>
          <p className="eyebrow">Data Correction</p>
          <h2>数据校正</h2>
          <p className="muted">
            {activeUserName}
            {corrections
              ? ` · ${corrections.explicitVisits} 条手动到访记录 · ${corrections.derivedVisits} 条自动带入`
              : " · 正在读取记录"}
          </p>
        </div>
        <button className="iconButton" onClick={onClose} title="关闭校正界面">
          <X size={18} />
        </button>
      </header>

      {!corrections ? (
        <div className="empty">正在读取已记录数据...</div>
      ) : corrections.totalVisits ? (
        <div className="correctionList">
          {corrections.roots.map((node) => (
            <CorrectionNode
              key={node.id}
              node={node}
              depth={0}
              edits={edits}
              expandedIds={expandedIds}
              savingId={savingId}
              onEdit={updateEdit}
              onToggle={toggleNode}
              onSave={saveNode}
            />
          ))}
        </div>
      ) : (
        <div className="empty">当前用户还没有记录</div>
      )}
    </section>
  );
}

function CorrectionNode({
  node,
  depth,
  edits,
  expandedIds,
  savingId,
  onEdit,
  onToggle,
  onSave
}: {
  node: CorrectionNodeDto;
  depth: number;
  edits: Record<string, CorrectionEdit>;
  expandedIds: string[];
  savingId: string | null;
  onEdit: (placeId: string, patch: Partial<CorrectionEdit>) => void;
  onToggle: (node: CorrectionNodeDto) => void;
  onSave: (node: CorrectionNodeDto) => void;
}) {
  const isExpanded = expandedIds.includes(node.id);

  return (
    <div className="correctionNode">
      <CorrectionRow
        node={node}
        depth={depth}
        edits={edits}
        isExpanded={isExpanded}
        savingId={savingId}
        onEdit={onEdit}
        onToggle={onToggle}
        onSave={onSave}
      />
      {isExpanded && node.children.length > 0 && (
        <div className="correctionChildren">
          {node.children.map((child) => (
            <CorrectionNode
              key={child.id}
              node={child}
              depth={depth + 1}
              edits={edits}
              expandedIds={expandedIds}
              savingId={savingId}
              onEdit={onEdit}
              onToggle={onToggle}
              onSave={onSave}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function CorrectionRow({
  node,
  depth,
  edits,
  isExpanded,
  savingId,
  onEdit,
  onToggle,
  onSave
}: {
  node: CorrectionNodeDto;
  depth: number;
  edits: Record<string, CorrectionEdit>;
  isExpanded: boolean;
  savingId: string | null;
  onEdit: (placeId: string, patch: Partial<CorrectionEdit>) => void;
  onToggle: (node: CorrectionNodeDto) => void;
  onSave: (node: CorrectionNodeDto) => void;
}) {
  const edit = edits[node.id];
  const rowClassName = [
    "correctionRow",
    node.visit ? "editable" : "groupOnly",
    node.children.length > 0 ? "hasChildren" : "noChildren"
  ].join(" ");

  return (
    <article className={rowClassName} style={{ "--depth": depth } as CSSProperties}>
      <div className="correctionPlace">
        <span>{levelLabels[node.level]}</span>
        <strong>{node.nativeName ?? node.name}</strong>
        {node.visit ? (
          <small>
            {node.visit.dateLabel}
            {node.visit.isDerived ? " · 自动带入" : ""}
          </small>
        ) : (
          <small>上级分组</small>
        )}
      </div>

      {node.children.length > 0 && (
        <button className="ghost correctionOpen" onClick={() => onToggle(node)}>
          {isExpanded ? "收起" : "查看下级"} {node.children.length}
        </button>
      )}

      {node.visit && edit && (
        <div className="correctionFields">
          <div className="dateParts compact">
            <input
              inputMode="numeric"
              maxLength={4}
              placeholder="年"
              value={edit.visitedYear}
              onChange={(event) => onEdit(node.id, { visitedYear: onlyDigits(event.target.value, 4) })}
            />
            <input
              inputMode="numeric"
              maxLength={2}
              placeholder="月"
              value={edit.visitedMonth}
              onChange={(event) => onEdit(node.id, { visitedMonth: onlyDigits(event.target.value, 2) })}
            />
            <input
              inputMode="numeric"
              maxLength={2}
              placeholder="日"
              value={edit.visitedDay}
              onChange={(event) => onEdit(node.id, { visitedDay: onlyDigits(event.target.value, 2) })}
            />
          </div>
          <input
            className="correctionNote"
            value={edit.note}
            onChange={(event) => onEdit(node.id, { note: event.target.value })}
            placeholder="备注"
          />
          <button className="primary correctionSave" onClick={() => onSave(node)} disabled={savingId === node.id}>
            <Save size={15} />
            {savingId === node.id ? "保存中" : "保存"}
          </button>
        </div>
      )}
    </article>
  );
}

function visitCorrectionNodes(nodes: CorrectionNodeDto[], visitor: (node: CorrectionNodeDto) => void) {
  for (const node of nodes) {
    visitor(node);
    visitCorrectionNodes(node.children, visitor);
  }
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

function renderPlacePin(place: PlaceDto) {
  const pinClassName = ["pin", `pin-${place.displayStatus.toLowerCase()}`].join(" ");

  return (
    <span className={pinClassName}>
      {place.visitStatus === VisitStatus.PLANNED ? <Flag size={13} /> : place.visited ? <Check size={13} /> : <MapPin size={13} />}
      {place.displayStatus === "VISITED_WITH_PLANNED_CHILDREN" && <span className="pinBadge" />}
    </span>
  );
}

function getDisplayStatus(visitStatus: PlaceDto["visitStatus"], hasPlannedChildren: boolean): PlaceDisplayStatus {
  if (visitStatus === VisitStatus.VISITED && hasPlannedChildren) return "VISITED_WITH_PLANNED_CHILDREN";
  return visitStatus;
}

function getNextLayerLabel(place: PlaceDto) {
  if (place.childLevel === "CITY") return "查看地点";
  if (place.childLevel === "REGION") return "查看行政区";
  return nextLayerLabel[place.level] ?? "查看详情";
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
