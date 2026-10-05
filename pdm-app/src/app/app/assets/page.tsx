import type { Metadata } from "next";
import { Suspense } from "react";
import { AssetListView } from "@/components/views/asset-list-view";
import { getMessages } from "@/lib/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const m = await getMessages();
  return { title: m.meta.titles.assets };
}

export default function Page() {
  return (
    <Suspense>
      <AssetListView />
    </Suspense>
  );
}
