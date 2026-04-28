import { Suspense } from "react";
import TravelMapApp from "./components/TravelMapApp";

export default function Home() {
  return (
    <main className="shell">
      <Suspense fallback={<div className="loading">正在载入旅记地图...</div>}>
        <TravelMapApp />
      </Suspense>
    </main>
  );
}
