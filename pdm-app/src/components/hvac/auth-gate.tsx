"use client";

// Sign-in in front of the live chiller plant module (source "live"; the simulation needs none).
// Accounts are created by an administrator; there is no public sign-up. After sign-in the user sees
// the projects their account can open (custom claims, see lib/firebase/session.ts): those of their
// customers, single plants given to them, or every project for operators. Each shows by the plant
// name and owner logo of its registry (projects/{project}), grouped by customer (orgs/{org}).

import { useCallback, useEffect, useId, useRef, useState, useSyncExternalStore } from "react";
import { Eye, EyeOff, Loader2, LockKeyhole, MailCheck, RotateCw, TriangleAlert, UserRoundX } from "lucide-react";
import { LanguageMenu, ThemeMenu } from "@/components/header-menus";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useI18n } from "@/lib/i18n/provider";
import { refreshAccess, resetPassword, signIn, signOut, useSession, type Session } from "@/lib/firebase/session";
import { AccountContext, type HvacAccount, type ProjectGroup } from "@/lib/hvac/account";
import { setLiveProject } from "@/lib/hvac/live";
import { subscribeOrgNames, subscribeProjectInfo, subscribeProjectList, type ProjectInfo } from "@/lib/hvac/live-firestore";
import { HVAC_SOURCE } from "@/lib/hvac/source";
import { Brand } from "./brand";

const PROJECT_KEY = "hvac-project";

function useStoredProject(): [string | null, (p: string) => void] {
  const value = useSyncExternalStore(
    (l) => {
      window.addEventListener("storage", l);
      return () => window.removeEventListener("storage", l);
    },
    () => window.localStorage.getItem(PROJECT_KEY),
    () => null,
  );
  const set = useCallback((p: string) => {
    window.localStorage.setItem(PROJECT_KEY, p);
    window.dispatchEvent(new StorageEvent("storage", { key: PROJECT_KEY }));
  }, []);
  return [value, set];
}

interface Access {
  /** False until every list has answered once. */
  ready: boolean;
  /** Every project the account can open, in switcher order. */
  projects: string[];
  groups: ProjectGroup[];
  info: Record<string, ProjectInfo>;
}

const NONE: Record<string, ProjectInfo> = {};
const NOT_READY: Access = { ready: false, projects: [], groups: [], info: NONE };

/**
 * The projects the signed-in account can open, kept current: its customers' projects (claim "orgs";
 * a plant added to a customer shows up at once, without signing in again), every project for
 * operators (claim "admin") and plants given one by one (claim "projects"). Customers come in name
 * order, then the plants of no listed customer; plants by name within each.
 */
function useAccess(session: Session): Access {
  const signedIn = session.status === "signedIn";
  const operator = signedIn && session.admin;
  const orgs = signedIn ? session.orgs : [];
  const granted = signedIn ? session.projects : [];
  const email = session.email;
  // What to list: "*" every project, else the customers one per line; "" nothing.
  const listKey = operator ? "*" : orgs.join("\n");
  const grantKey = granted.join("\n");
  const [listed, setListed] = useState<{ email: string | null; projects: Record<string, ProjectInfo> } | null>(null);
  const [grantInfo, setGrantInfo] = useState<Record<string, ProjectInfo>>({});
  const [orgNames, setOrgNames] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!listKey) return;
    const scope = listKey === "*" ? "all" : listKey.split("\n");
    const stopList = subscribeProjectList(scope, (projects) => setListed({ email, projects }));
    const stopNames = subscribeOrgNames(scope, setOrgNames);
    return () => {
      stopList();
      stopNames();
    };
  }, [listKey, email]);
  useEffect(() => {
    if (!grantKey) return;
    const stops = grantKey.split("\n").map((p) => subscribeProjectInfo(p, (i) => setGrantInfo((prev) => ({ ...prev, [p]: i }))));
    return () => stops.forEach((stop) => stop());
  }, [grantKey]);

  // A list loaded for another account is never used; one loaded before this account's claims changed
  // stays until the new one arrives, so the screens do not blink.
  const list = !listKey ? NONE : listed?.email === email ? listed.projects : null;
  if (!signedIn || list === null || !granted.every((p) => p in grantInfo)) return NOT_READY;

  const info: Record<string, ProjectInfo> = { ...list };
  for (const p of granted) info[p] ??= grantInfo[p];
  const nameOf = (p: string) => info[p]?.name ?? p;
  const byOrg = new Map<string | null, string[]>();
  for (const p of Object.keys(info)) {
    const org = info[p].org;
    const key = org !== null && (operator || orgs.includes(org)) ? org : null;
    byOrg.set(key, [...(byOrg.get(key) ?? []), p]);
  }
  const groups = [...byOrg]
    .map(([org, projects]) => ({ org, name: org === null ? null : (orgNames[org] ?? org), projects: projects.sort((a, b) => nameOf(a).localeCompare(nameOf(b))) }))
    .sort((a, b) => (a.name === null ? 1 : b.name === null ? -1 : a.name.localeCompare(b.name)));
  return { ready: true, projects: groups.flatMap((g) => g.projects), groups, info };
}

export function AuthGate({ children }: { children: React.ReactNode }) {
  if (HVAC_SOURCE === "sim") return <>{children}</>;
  return <LiveGate>{children}</LiveGate>;
}

function LiveGate({ children }: { children: React.ReactNode }) {
  const { m } = useI18n();
  const session = useSession();
  const [stored, setStored] = useStoredProject();
  const access = useAccess(session);
  const project = access.projects.includes(stored ?? "") ? stored! : (access.projects[0] ?? null);

  useEffect(() => {
    setLiveProject(session.status === "signedIn" ? project : null);
  }, [session.status, project]);
  // Keep the project picked by default, so a plant added to the list later does not take its place.
  useEffect(() => {
    if (project && project !== stored) setStored(project);
  }, [project, stored, setStored]);

  if (session.status === "signedIn" && project) {
    const account: HvacAccount = {
      email: session.email,
      projects: access.projects,
      groups: access.groups,
      operator: session.admin,
      project,
      setProject: setStored,
      names: Object.fromEntries(access.projects.map((p) => [p, access.info[p]?.name ?? p])),
      ownerLogo: access.info[project]?.ownerLogo ?? null,
    };
    return <AccountContext.Provider value={account}>{children}</AccountContext.Provider>;
  }
  return (
    <AuthFrame>
      {session.status === "unconfigured" ? (
        <Notice icon={TriangleAlert} title={m.hvac.auth.title} text={m.hvac.auth.unconfigured} />
      ) : session.status === "loading" || (session.status === "signedIn" && !access.ready) ? (
        <div role="status" className="flex items-center gap-2 text-sm text-text-secondary">
          <Loader2 aria-hidden className="size-4 animate-spin motion-reduce:animate-none" />
          {m.hvac.auth.checking}
        </div>
      ) : session.status === "signedOut" ? (
        <SignIn />
      ) : (
        <NoAccess email={session.email ?? ""} operator={session.admin} />
      )}
    </AuthFrame>
  );
}

/** Page frame for the signed-out screens: brand, language and theme, one centred card. */
function AuthFrame({ children }: { children: React.ReactNode }) {
  const { m } = useI18n();
  return (
    <div className="flex min-h-dvh flex-col bg-background">
      <header className="flex h-(--topbar-height) items-center gap-2 border-b bg-card px-3 md:px-4">
        <Brand />
        <div className="ml-auto flex items-center gap-1 sm:gap-2">
          <LanguageMenu />
          <ThemeMenu />
        </div>
      </header>
      <main id="main" tabIndex={-1} className="flex flex-1 items-start justify-center px-4 py-10 outline-none sm:items-center">
        <div className="w-full max-w-md rounded-lg border bg-card p-6 shadow-sm sm:p-8">{children}</div>
      </main>
      <footer className="px-4 pb-4 text-center text-xs text-muted-foreground">{m.hvac.product}</footer>
    </div>
  );
}

function Notice({ icon: Icon, title, text }: { icon: typeof TriangleAlert; title: string; text: string }) {
  return (
    <div className="flex flex-col gap-3">
      <h1 className="flex items-center gap-2 text-xl font-semibold">
        <Icon aria-hidden className="size-5 text-warning" />
        {title}
      </h1>
      <p className="text-sm text-text-secondary">{text}</p>
    </div>
  );
}

function authError(code: string, a: ReturnType<typeof useI18n>["m"]["hvac"]["auth"]): string {
  switch (code) {
    case "auth/invalid-credential":
    case "auth/wrong-password":
    case "auth/user-not-found":
    case "auth/invalid-email":
      return a.errWrong;
    case "auth/user-disabled":
      return a.errDisabled;
    case "auth/too-many-requests":
      return a.errTooMany;
    case "auth/network-request-failed":
      return a.errNetwork;
    default:
      return a.errOther;
  }
}

const looksLikeEmail = (v: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim());

function SignIn() {
  const { m, locale } = useI18n();
  const a = m.hvac.auth;
  const uid = useId();
  const id = (s: string) => `${uid}-${s}`;
  const [view, setView] = useState<"signIn" | "reset" | "sent">("signIn");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [errors, setErrors] = useState<{ email?: string; password?: string }>({});
  const [failure, setFailure] = useState<string | null>(null);
  const [working, setWorking] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const summaryRef = useRef<HTMLDivElement>(null);
  const failureRef = useRef<HTMLDivElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const viewChanged = useRef(false);

  // After a failed submit, focus goes to what explains it; after switching views, to the new heading.
  useEffect(() => {
    if (attempt > 0) (failure ? failureRef : summaryRef).current?.focus();
  }, [attempt, failure]);
  useEffect(() => {
    if (viewChanged.current) headingRef.current?.focus();
    viewChanged.current = true;
  }, [view]);

  function go(next: typeof view) {
    setErrors({});
    setFailure(null);
    setAttempt(0);
    setView(next);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (working) return;
    const found: typeof errors = {};
    if (!looksLikeEmail(email)) found.email = a.errEmail;
    if (view === "signIn" && !password) found.password = a.errPassword;
    setErrors(found);
    setFailure(null);
    if (Object.keys(found).length) {
      setAttempt((n) => n + 1);
      return;
    }
    setWorking(true);
    try {
      if (view === "signIn") {
        await signIn(email.trim(), password);
      } else {
        await resetPassword(email.trim(), locale);
        go("sent");
      }
    } catch (err) {
      const code = (err as { code?: string }).code ?? "";
      // A reset link is never refused for an unknown address (that would reveal who has an account).
      if (view === "reset" && (code === "auth/user-not-found" || code === "auth/invalid-email")) go("sent");
      else {
        setFailure(authError(code, a));
        setAttempt((n) => n + 1);
      }
    } finally {
      setWorking(false);
    }
  }

  const field = (f: "email" | "password") => ({
    "aria-invalid": errors[f] ? true : undefined,
    "aria-describedby": errors[f] ? id(`${f}-err`) : undefined,
  });

  if (view === "sent") {
    return (
      <div className="flex flex-col gap-4">
        <h1 ref={headingRef} tabIndex={-1} className="flex items-center gap-2 text-xl font-semibold outline-none">
          <MailCheck aria-hidden className="size-5 text-healthy" />
          {a.resetSentTitle}
        </h1>
        <p role="status" className="rounded-lg border border-healthy-border bg-healthy-bg p-3 text-sm text-foreground">
          {a.resetSent(email.trim())}
        </p>
        <Button variant="outline" className="h-10 self-start" onClick={() => go("signIn")}>
          {a.back}
        </Button>
      </div>
    );
  }

  const reset = view === "reset";
  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-5" aria-labelledby={id("title")}>
      <div className="flex flex-col gap-1.5">
        <h1 id={id("title")} ref={headingRef} tabIndex={-1} className="flex items-center gap-2 text-xl font-semibold outline-none">
          <LockKeyhole aria-hidden className="size-5 text-primary" />
          {reset ? a.resetTitle : a.title}
        </h1>
        <p className="text-sm text-text-secondary">{reset ? a.resetIntro : a.intro}</p>
      </div>

      {Object.keys(errors).length ? (
        <div ref={summaryRef} tabIndex={-1} role="alert" className="rounded-lg border border-critical-border bg-critical-bg p-3 text-sm outline-none">
          <p className="flex items-center gap-1.5 font-semibold text-critical-fg">
            <TriangleAlert aria-hidden className="size-4 shrink-0" />
            {a.errSummary}
          </p>
          <ul className="mt-1 list-disc pl-6">
            {(Object.keys(errors) as ("email" | "password")[]).map((f) => (
              <li key={f}>
                <a href={`#${id(f)}`} className="inline-flex min-h-6 items-center underline">
                  {errors[f]}
                </a>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {failure ? (
        <div ref={failureRef} tabIndex={-1} role="alert" className="rounded-lg border border-critical-border bg-critical-bg p-3 text-sm outline-none">
          <p className="flex items-center gap-1.5 font-semibold text-critical-fg">
            <TriangleAlert aria-hidden className="size-4 shrink-0" />
            {a.failTitle}
          </p>
          <p className="mt-1 text-foreground">{failure}</p>
        </div>
      ) : null}

      <div className="grid gap-1.5">
        <Label htmlFor={id("email")}>{a.email}</Label>
        <Input id={id("email")} type="email" autoComplete="username" inputMode="email" value={email} onChange={(e) => setEmail(e.target.value)} className="h-10" {...field("email")} />
        {errors.email ? (
          <p id={id("email-err")} className="text-sm text-critical-fg">
            {errors.email}
          </p>
        ) : null}
      </div>

      {reset ? null : (
        <div className="grid gap-1.5">
          <Label htmlFor={id("password")}>{a.password}</Label>
          <div className="relative">
            <Input
              id={id("password")}
              type={show ? "text" : "password"}
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="h-10 pr-11"
              {...field("password")}
            />
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="absolute top-0 right-0 size-10"
              aria-label={show ? a.hidePassword : a.showPassword}
              aria-controls={id("password")}
              onClick={() => setShow((s) => !s)}
            >
              {show ? <EyeOff aria-hidden /> : <Eye aria-hidden />}
            </Button>
          </div>
          {errors.password ? (
            <p id={id("password-err")} className="text-sm text-critical-fg">
              {errors.password}
            </p>
          ) : null}
        </div>
      )}

      <div className="flex flex-col gap-3">
        <Button type="submit" className="h-11 text-base" aria-disabled={working || undefined}>
          {working ? <Loader2 aria-hidden className="animate-spin motion-reduce:animate-none" /> : null}
          {reset ? (working ? a.resetWorking : a.resetSubmit) : working ? a.working : a.submit}
        </Button>
        <Button type="button" variant="link" className="h-auto min-h-6 self-start px-0" onClick={() => go(reset ? "signIn" : "reset")}>
          {reset ? a.back : a.forgot}
        </Button>
      </div>
      <p role="status" className="sr-only">
        {working ? (reset ? a.resetWorking : a.working) : ""}
      </p>
    </form>
  );
}

/** Signed in, but nothing to open: no project given to the account yet, or (operators) none registered. */
function NoAccess({ email, operator }: { email: string; operator: boolean }) {
  const { m } = useI18n();
  const a = m.hvac.auth;
  const [checking, setChecking] = useState(false);
  async function check() {
    setChecking(true);
    try {
      await refreshAccess();
    } finally {
      setChecking(false);
    }
  }
  return (
    <div className="flex flex-col gap-4">
      <h1 className="flex items-center gap-2 text-xl font-semibold">
        <UserRoundX aria-hidden className="size-5 text-warning" />
        {operator ? a.noPlantsTitle : a.noAccessTitle}
      </h1>
      <p className="text-sm text-text-secondary">{operator ? a.noPlantsDesc(email) : a.noAccessDesc(email)}</p>
      <div className="flex flex-wrap gap-2">
        <Button className="h-10" onClick={check} aria-disabled={checking || undefined}>
          <RotateCw aria-hidden className={checking ? "animate-spin motion-reduce:animate-none" : undefined} />
          {a.checkAgain}
        </Button>
        <Button variant="outline" className="h-10" onClick={() => void signOut()}>
          {m.hvac.shell.signOut}
        </Button>
      </div>
      <p role="status" className="sr-only">
        {checking ? a.checking : ""}
      </p>
    </div>
  );
}
