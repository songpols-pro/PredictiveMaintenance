import type { Metadata } from "next";
import { Suspense } from "react";
import { WorkOrdersView } from "@/components/views/work-orders-view";
import { getMessages } from "@/lib/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const m = await getMessages();
  return { title: m.meta.titles.workOrders };
}

export default function Page() {
  return (
    <Suspense>
      <WorkOrdersView />
    </Suspense>
  );
}
