"use server";

import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { invalidFields, MAX_LENGTH, type DemoRequest } from "@/lib/demo-request";
import { getDb } from "@/lib/firebase-admin";
import { isLocale, LOCALE_NAMES, type Locale } from "@/lib/i18n/config";
import { MESSAGES } from "@/lib/i18n/messages";

// Server action behind the demo request form on the website.
// Each request becomes a document in the Firestore collection "demoRequests". When the
// LEADS_NOTIFY_EMAIL environment variable is set, it also queues an email in the "mail"
// collection, which the "Trigger Email from Firestore" extension sends.
// firestore.rules denies all access from browsers; only this server code (Admin SDK) writes.

const LEADS_COLLECTION = "demoRequests";
const MAIL_COLLECTION = "mail";
const DAY = 24 * 60 * 60 * 1000;
/** The privacy notice promises deletion after 12 months; a Firestore TTL policy on `deleteAfter` does it. */
const KEEP_LEAD_DAYS = 365;
/** Queued emails carry the same personal data, so they are deleted sooner. */
const KEEP_MAIL_DAYS = 30;
/** If Firestore does not answer by then, show the retry message instead of an endless "Sending…". */
const WRITE_TIMEOUT_MS = 15_000;

export type SubmitResult = { ok: true } | { ok: false; reason: "invalid" | "unavailable" };

export async function submitDemoRequest(input: DemoRequest): Promise<SubmitResult> {
  // Anyone can POST to a server action, so the input is re-checked here, not trusted from the form.
  const request = clean(input);
  if (!request || invalidFields(request).length > 0) return { ok: false, reason: "invalid" };

  const db = getDb();
  if (!db) {
    if (process.env.NODE_ENV !== "production") {
      // Local development without Firebase: behave like a successful send so the form can be tried.
      console.info("[leads] Firestore is not configured, so the demo request was not stored (development only).");
      await new Promise((resolve) => setTimeout(resolve, 700));
      return { ok: true };
    }
    console.error("[leads] Firestore is not configured. Deploy on Firebase App Hosting or set FIRESTORE_EMULATOR_HOST.");
    return { ok: false, reason: "unavailable" };
  }

  const locale: Locale = isLocale(request.locale) ? request.locale : "en";
  // A filled honeypot is stored as spam rather than dropped, so a false positive never loses a real lead.
  const spam = request.website !== "";
  const now = Date.now();
  try {
    const batch = db.batch();
    batch.create(db.collection(LEADS_COLLECTION).doc(), {
      name: request.name,
      company: request.company,
      jobTitle: request.jobTitle,
      email: request.email,
      phone: request.phone,
      machines: request.machines,
      message: request.message,
      locale,
      // Record of consent (PDPA): the exact wording the person agreed to, and when.
      consent: { text: MESSAGES[locale].marketing.contact.consent, givenAt: FieldValue.serverTimestamp() },
      status: spam ? "spam" : "new",
      source: "website",
      createdAt: FieldValue.serverTimestamp(),
      deleteAfter: Timestamp.fromMillis(now + KEEP_LEAD_DAYS * DAY),
    });
    const notify = recipients(process.env.LEADS_NOTIFY_EMAIL);
    if (notify.length > 0 && !spam) {
      batch.create(db.collection(MAIL_COLLECTION).doc(), {
        to: notify,
        replyTo: request.email,
        message: { subject: `Demo request: ${request.company}`, text: emailBody(request, locale) },
        deleteAfter: Timestamp.fromMillis(now + KEEP_MAIL_DAYS * DAY),
      });
    }
    await withTimeout(batch.commit(), WRITE_TIMEOUT_MS);
    return { ok: true };
  } catch (error) {
    console.error("[leads] Could not store the demo request.", error);
    return { ok: false, reason: "unavailable" };
  }
}

/** Keeps only the expected fields: strings within their limits, single-line except the message. */
function clean(input: unknown): DemoRequest | null {
  if (typeof input !== "object" || input === null) return null;
  const raw = input as Record<string, unknown>;
  const text = (key: keyof typeof MAX_LENGTH, multiline = false) => {
    const value = raw[key];
    if (typeof value !== "string") return null;
    const trimmed = (multiline ? value.replace(/\r\n?/g, "\n") : value.replace(/\s+/g, " ")).trim();
    return trimmed.length <= MAX_LENGTH[key] ? trimmed : null;
  };
  const name = text("name");
  const company = text("company");
  const jobTitle = text("jobTitle");
  const email = text("email");
  const phone = text("phone");
  const message = text("message", true);
  const website = text("website");
  if (name === null || company === null || jobTitle === null || email === null || phone === null || message === null || website === null) return null;
  return {
    name,
    company,
    jobTitle,
    email,
    phone,
    message,
    website,
    machines: typeof raw.machines === "string" ? raw.machines : "",
    consent: raw.consent === true,
    locale: typeof raw.locale === "string" ? raw.locale : "",
  };
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`Firestore did not answer within ${ms} ms`)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

function recipients(value: string | undefined) {
  return (value ?? "")
    .split(",")
    .map((address) => address.trim())
    .filter(Boolean);
}

function emailBody(r: DemoRequest, locale: Locale) {
  const c = MESSAGES.en.marketing.contact;
  return [
    `${c.name}: ${r.name}`,
    `${c.company}: ${r.company}`,
    `${c.jobTitle}: ${r.jobTitle || "-"}`,
    `${c.email}: ${r.email}`,
    `${c.phone}: ${r.phone}`,
    `${c.machines}: ${c.machinesOptions[r.machines]}`,
    `Form language: ${LOCALE_NAMES[locale]}`,
    "",
    "Message:",
    r.message || "-",
  ].join("\n");
}
