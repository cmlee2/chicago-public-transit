"use client";

import dynamic from "next/dynamic";

const LiveMap = dynamic(() => import("@/components/live-map"), { ssr: false });

export default function Home() {
  return (
    <div className="h-[calc(100vh-49px)] md:h-[calc(100vh-73px)]">
      <LiveMap />
    </div>
  );
}
