import { cookies, headers } from "next/headers";
import { LOCALE_COOKIE, pickLocale, type Locale } from "./config";
import { MESSAGES } from "./messages";

/** Language for this request: saved cookie, then Accept-Language, then English. */
export async function getLocale(): Promise<Locale> {
  const [cookieStore, headerList] = await Promise.all([cookies(), headers()]);
  return pickLocale(cookieStore.get(LOCALE_COOKIE)?.value, headerList.get("accept-language"));
}

export async function getMessages() {
  return MESSAGES[await getLocale()];
}
