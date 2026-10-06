import type { Metadata } from "next";
import { Suspense } from "react";
import { PowerView } from "@/components/hvac/power";
import { getMessages } from "@/lib/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const m = await getMessages();
  return { title: { absolute: `${m.hvac.titles.power} · ${m.hvac.product}` } };
}

export default function Page() {
  return (
    <Suspense>
      <PowerView />
    </Suspense>
  );
}
