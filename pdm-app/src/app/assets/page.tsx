import type { Metadata } from "next";
import { Suspense } from "react";
import { AssetListView } from "@/components/views/asset-list-view";

export const metadata: Metadata = { title: "Assets" };

export default function AssetsPage() {
  return (
    <Suspense>
      <AssetListView />
    </Suspense>
  );
}
