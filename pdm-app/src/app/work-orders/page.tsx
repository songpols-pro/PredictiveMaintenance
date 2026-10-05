import type { Metadata } from "next";
import { Suspense } from "react";
import { WorkOrdersView } from "@/components/views/work-orders-view";

export const metadata: Metadata = { title: "Work orders" };

export default function WorkOrdersPage() {
  return (
    <Suspense>
      <WorkOrdersView />
    </Suspense>
  );
}
