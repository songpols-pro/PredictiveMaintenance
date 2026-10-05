import type { Metadata } from "next";
import { AssetDetailView } from "@/components/views/asset-detail-view";
import { getMessages } from "@/lib/i18n/server";

export async function generateMetadata({ params }: PageProps<"/app/assets/[id]">): Promise<Metadata> {
  const [{ id }, m] = await Promise.all([params, getMessages()]);
  return { title: m.meta.titles.asset(decodeURIComponent(id)) };
}

export default async function AssetPage({ params }: PageProps<"/app/assets/[id]">) {
  const { id } = await params;
  return <AssetDetailView id={decodeURIComponent(id)} />;
}
