import { AuthGate } from "@/components/hvac/auth-gate";
import { HvacShell } from "@/components/hvac/shell";

/** Chiller plant (BMS) module: sign-in (live data) in front of its own frame, modelled on the customer's mock-up. */
export default function HvacLayout({ children }: { children: React.ReactNode }) {
  return (
    <AuthGate>
      <HvacShell>{children}</HvacShell>
    </AuthGate>
  );
}
