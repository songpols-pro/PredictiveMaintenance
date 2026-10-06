import { HvacShell } from "@/components/hvac/shell";

/** Chiller plant (BMS) module: its own frame and control-room theme, modelled on the customer's mock-up. */
export default function HvacLayout({ children }: { children: React.ReactNode }) {
  return <HvacShell>{children}</HvacShell>;
}
