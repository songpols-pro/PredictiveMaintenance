import type { Metadata } from "next";
import { Suspense } from "react";
import { PlantOverview } from "@/components/hvac/overview";
import { getMessages } from "@/lib/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const m = await getMessages();
  return { title: { absolute: `${m.hvac.titles.plant} · ${m.hvac.product}` } };
}

export default function Page() {
  return (
    <Suspense>
      <PlantOverview />
    </Suspense>
  );
}
