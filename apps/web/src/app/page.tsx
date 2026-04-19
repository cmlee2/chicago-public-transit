"use client";

import dynamic from "next/dynamic";

const LiveMap = dynamic(() => import("@/components/live-map"), { ssr: false });

export default function Home() {
  return (
    <div className="h-[calc(100vh-57px)]">
      <LiveMap />
    </div>
  );
}
