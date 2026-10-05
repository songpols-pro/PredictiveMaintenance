// Demo request shape and validation, shared by the website form (browser) and the
// server action that stores it (src/lib/leads.ts), so both apply the same rules.

export const MACHINE_RANGES = ["lt20", "20-100", "100-500", "500+"] as const;

export interface DemoRequest {
  name: string;
  company: string;
  jobTitle: string;
  email: string;
  phone: string;
  machines: string;
  message: string;
  consent: boolean;
  locale: string;
  /** Honeypot: hidden from people and assistive tech, so a value here means a bot filled the form. */
  website: string;
}

export type DemoField = "name" | "company" | "email" | "phone" | "machines" | "consent";

/** Also set as `maxLength` on the inputs, so people never hit these limits. */
export const MAX_LENGTH = { name: 120, company: 160, jobTitle: 120, email: 254, phone: 32, message: 2000, website: 200 } as const;

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Fields the person has to fix, in form order. Empty when the request can be sent. */
export function invalidFields(r: DemoRequest): DemoField[] {
  const bad: DemoField[] = [];
  if (!r.name.trim()) bad.push("name");
  if (!r.company.trim()) bad.push("company");
  if (!EMAIL.test(r.email.trim())) bad.push("email");
  if (r.phone.replace(/\D/g, "").length < 9) bad.push("phone");
  if (!(MACHINE_RANGES as readonly string[]).includes(r.machines)) bad.push("machines");
  if (!r.consent) bad.push("consent");
  return bad;
}
