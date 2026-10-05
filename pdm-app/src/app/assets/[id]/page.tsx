import type { Metadata } from "next";
import { AssetDetailView } from "@/components/views/asset-detail-view";

export async function generateMetadata({ params }: PageProps<"/assets/[id]">): Promise<Metadata> {
  const { id } = await params;
  return { title: `${decodeURIComponent(id)} · Asset` };
}

export default async function AssetPage({ params }: PageProps<"/assets/[id]">) {
  const { id } = await params;
  return <AssetDetailView id={decodeURIComponent(id)} />;
}
