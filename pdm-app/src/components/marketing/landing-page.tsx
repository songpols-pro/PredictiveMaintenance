"use client";

import Image from "next/image";
import {
  Activity,
  ArrowDown,
  ArrowRight,
  ArrowUp,
  BellRing,
  Brain,
  CalendarClock,
  ChartColumnBig,
  ChevronDown,
  CircleCheck,
  ClipboardCheck,
  ClipboardList,
  Cog,
  Drill,
  Droplets,
  Factory,
  Fan,
  Flame,
  Gauge,
  Hammer,
  Hourglass,
  Languages,
  LayoutDashboard,
  Mail,
  MessageCircle,
  Package,
  Phone,
  Plug,
  Radar,
  ShieldCheck,
  Thermometer,
  TrendingUp,
  Wind,
  Wrench,
  Zap,
  Clock3,
  type LucideIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useI18n } from "@/lib/i18n/provider";
import { SITE_CONTACT } from "@/lib/site-config";
import type { AssetType, SensorKind } from "@/lib/types";
import { cn } from "@/lib/utils";
import { ProductPreview } from "./product-preview";
import { DemoForm } from "./demo-form";

const CONTAINER = "mx-auto w-full max-w-6xl px-4 sm:px-6 lg:px-8";

function SectionHeader({ id, title, lead, center = false }: { id: string; title: string; lead?: string; center?: boolean }) {
  return (
    <div className={cn("max-w-2xl", center && "mx-auto text-center")}>
      <h2 id={id} className="text-2xl leading-tight font-semibold tracking-tight sm:text-3xl">
        {title}
      </h2>
      {lead ? <p className="mt-3 text-base text-text-secondary">{lead}</p> : null}
    </div>
  );
}

function IconTile({ icon: Icon, className }: { icon: LucideIcon; className?: string }) {
  return (
    <span aria-hidden className={cn("flex size-10 shrink-0 items-center justify-center rounded-lg bg-selected text-link", className)}>
      <Icon className="size-5" />
    </span>
  );
}

export function LandingPage() {
  return (
    <>
      <Hero />
      <KpiStrip />
      <Approaches />
      <HowItWorks />
      <Features />
      <ProductTour />
      <Equipment />
      <Roles />
      <Faq />
      <Contact />
    </>
  );
}

function Hero() {
  const { m } = useI18n();
  const h = m.marketing.hero;
  return (
    <section aria-labelledby="hero-title" className="relative overflow-hidden border-b">
      <div aria-hidden className="marketing-hero-bg absolute inset-0" />
      <div className={cn(CONTAINER, "relative grid items-center gap-14 py-16 sm:py-20 lg:grid-cols-[1.05fr_1fr] lg:py-24")}>
        <div>
          <p className="inline-flex items-center gap-2 rounded-full border bg-card px-3 py-1 text-xs font-medium text-link">
            <Activity aria-hidden className="size-3.5" />
            {h.eyebrow}
          </p>
          <h1 id="hero-title" className="mt-5 text-4xl leading-tight font-semibold tracking-tight text-balance sm:text-5xl">
            {h.title}
          </h1>
          <p className="mt-5 max-w-xl text-base text-text-secondary sm:text-lg">{h.lead}</p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Button asChild className="h-11 px-5 text-base">
              <a href="#demo">
                {h.ctaPrimary}
                <ArrowRight aria-hidden />
              </a>
            </Button>
            <Button asChild variant="outline" className="h-11 bg-card px-5 text-base">
              <a href="#contact">
                <MessageCircle aria-hidden />
                {h.ctaSecondary}
              </a>
            </Button>
          </div>
          <ul className="mt-8 grid gap-2.5">
            {h.points.map((p) => (
              <li key={p} className="flex items-start gap-2 text-sm">
                <CircleCheck aria-hidden className="mt-0.5 size-4 shrink-0 text-healthy" />
                {p}
              </li>
            ))}
          </ul>
        </div>
        <ProductPreview />
      </div>
    </section>
  );
}

function KpiStrip() {
  const { m } = useI18n();
  const k = m.marketing.kpis;
  return (
    <section aria-labelledby="kpis-title" className="border-b bg-card">
      <div className={cn(CONTAINER, "py-12")}>
        <h2 id="kpis-title" className="text-sm font-semibold text-text-secondary">
          {k.title}
        </h2>
        <ul className="mt-6 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {k.items.map((item) => {
            const Arrow = item.up ? ArrowUp : ArrowDown;
            return (
              <li key={item.label} className="flex flex-col gap-1.5">
                <p className="flex items-center gap-2 text-xl font-semibold">
                  {item.label}
                  <span className="inline-flex items-center rounded-full bg-healthy-bg px-1.5 py-0.5 text-healthy-fg">
                    <Arrow aria-hidden className="size-4" />
                    <span className="sr-only">{item.up ? k.better : k.lower}</span>
                  </span>
                </p>
                <p className="text-sm text-text-secondary">{item.desc}</p>
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}

const APPROACH_ICONS: LucideIcon[] = [Flame, CalendarClock, Radar];

function Approaches() {
  const { m } = useI18n();
  const a = m.marketing.approaches;
  return (
    <section aria-labelledby="approaches-title" className="border-b">
      <div className={cn(CONTAINER, "py-16 sm:py-20")}>
        <SectionHeader id="approaches-title" title={a.title} lead={a.lead} />
        <ul className="mt-10 grid gap-4 md:grid-cols-3">
          {a.items.map((item, i) => {
            const Icon = APPROACH_ICONS[i];
            const best = i === a.items.length - 1;
            return (
              <li key={item.name} className={cn("flex flex-col gap-3 rounded-xl border bg-card p-5", best && "border-primary ring-1 ring-primary")}>
                <div className="flex items-center justify-between gap-2">
                  <IconTile icon={Icon} className={best ? undefined : "bg-muted text-text-secondary"} />
                  {best ? <span className="rounded-full bg-primary px-2.5 py-0.5 text-xs font-semibold text-primary-foreground">{a.recommended}</span> : null}
                </div>
                <h3 className="text-lg font-semibold">
                  {item.name} <span className="text-sm font-normal text-muted-foreground">· {item.tag}</span>
                </h3>
                <p className="text-sm text-text-secondary">{item.desc}</p>
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}

const STEP_ICONS: LucideIcon[] = [Plug, Brain, BellRing, ClipboardCheck];

function HowItWorks() {
  const { m } = useI18n();
  const h = m.marketing.how;
  return (
    <section id="how" aria-labelledby="how-title" className="border-b bg-card">
      <div className={cn(CONTAINER, "py-16 sm:py-20")}>
        <SectionHeader id="how-title" title={h.title} lead={h.lead} />
        <ol className="mt-10 grid gap-6 md:grid-cols-2 lg:grid-cols-4">
          {h.steps.map((step, i) => {
            const Icon = STEP_ICONS[i];
            return (
              <li key={step.title} className="relative flex flex-col gap-3 rounded-xl border p-5">
                <div className="flex items-center gap-3">
                  <span className="flex size-8 items-center justify-center rounded-full bg-primary text-sm font-semibold text-primary-foreground">{i + 1}</span>
                  <Icon aria-hidden className="size-5 text-link" />
                </div>
                <h3 className="font-semibold">{step.title}</h3>
                <p className="text-sm text-text-secondary">{step.desc}</p>
              </li>
            );
          })}
        </ol>
      </div>
    </section>
  );
}

const FEATURE_ICONS: LucideIcon[] = [LayoutDashboard, Hourglass, ChartColumnBig, BellRing, ClipboardList, Languages];

function Features() {
  const { m } = useI18n();
  const f = m.marketing.features;
  return (
    <section id="features" aria-labelledby="features-title" className="border-b">
      <div className={cn(CONTAINER, "py-16 sm:py-20")}>
        <SectionHeader id="features-title" title={f.title} lead={f.lead} />
        <ul className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {f.items.map((item, i) => (
            <li key={item.title} className="flex flex-col gap-3 rounded-xl border bg-card p-5">
              <IconTile icon={FEATURE_ICONS[i]} />
              <h3 className="font-semibold">{item.title}</h3>
              <p className="text-sm text-text-secondary">{item.desc}</p>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

const TOUR_KEYS = ["overview", "asset", "alerts", "workOrders"] as const;

function ProductTour() {
  const { m, locale } = useI18n();
  const t = m.marketing.tour;
  return (
    <section id="tour" aria-labelledby="tour-title" className="border-b bg-card">
      <div className={cn(CONTAINER, "py-16 sm:py-20")}>
        <SectionHeader id="tour-title" title={t.title} lead={t.lead} />
        <Tabs defaultValue="overview" className="mt-8 gap-6">
          <TabsList aria-label={t.tabsLabel} className="h-auto min-h-10 flex-wrap justify-start">
            {TOUR_KEYS.map((k) => (
              <TabsTrigger key={k} value={k} className="px-3">
                {t.tabs[k].label}
              </TabsTrigger>
            ))}
          </TabsList>
          {TOUR_KEYS.map((k) => (
            <TabsContent key={k} value={k}>
              <figure className="flex flex-col gap-4">
                <div className="overflow-hidden rounded-xl border bg-background shadow-lg shadow-foreground/5">
                  <div aria-hidden className="flex items-center gap-1.5 border-b bg-muted px-4 py-2.5">
                    <span className="size-2.5 rounded-full bg-accent" />
                    <span className="size-2.5 rounded-full bg-accent" />
                    <span className="size-2.5 rounded-full bg-accent" />
                  </div>
                  <Image
                    src={`/marketing/${locale}/${k}.webp`}
                    alt={t.tabs[k].alt}
                    width={1440}
                    height={900}
                    sizes="(min-width: 1152px) 1088px, 100vw"
                    className="h-auto w-full"
                  />
                </div>
                <figcaption className="max-w-2xl text-sm text-text-secondary">{t.tabs[k].desc}</figcaption>
              </figure>
            </TabsContent>
          ))}
        </Tabs>
      </div>
    </section>
  );
}

const ASSET_ICONS: Record<AssetType, LucideIcon> = {
  "Centrifugal Pump": Droplets,
  "Electric Motor": Zap,
  "Air Compressor": Wind,
  Gearbox: Cog,
  Conveyor: Package,
  "CNC Spindle": Drill,
  "Fan / Blower": Fan,
  "Hydraulic Press": Hammer,
};
const SENSOR_ICONS: Record<SensorKind, LucideIcon> = { vibration: Activity, temperature: Thermometer, pressure: Gauge, current: Zap };

function Equipment() {
  const { m } = useI18n();
  const e = m.marketing.equipment;
  return (
    <section aria-labelledby="equipment-title" className="border-b">
      <div className={cn(CONTAINER, "grid gap-10 py-16 sm:py-20 lg:grid-cols-[1.4fr_1fr]")}>
        <div>
          <SectionHeader id="equipment-title" title={e.title} lead={e.lead} />
          <ul className="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-4">
            {(Object.keys(ASSET_ICONS) as AssetType[]).map((type) => {
              const Icon = ASSET_ICONS[type];
              return (
                <li key={type} className="flex flex-col items-start gap-2 rounded-xl border bg-card p-4">
                  <Icon aria-hidden className="size-5 text-link" />
                  <span className="text-sm font-medium">{m.assetTypes[type]}</span>
                </li>
              );
            })}
          </ul>
        </div>
        <div className="flex flex-col gap-6 rounded-xl border bg-card p-6">
          <div>
            <h3 className="text-sm font-semibold">{e.sensorsTitle}</h3>
            <ul className="mt-3 grid grid-cols-2 gap-2">
              {(Object.keys(SENSOR_ICONS) as SensorKind[]).map((kind) => {
                const Icon = SENSOR_ICONS[kind];
                return (
                  <li key={kind} className="flex items-center gap-2 text-sm">
                    <Icon aria-hidden className="size-4 text-muted-foreground" />
                    {m.sensors[kind]}
                  </li>
                );
              })}
            </ul>
          </div>
          <div>
            <h3 className="text-sm font-semibold">{e.integrationsTitle}</h3>
            <ul className="mt-3 flex flex-col gap-2">
              {e.integrations.map((item) => (
                <li key={item} className="flex items-start gap-2 text-sm text-text-secondary">
                  <Plug aria-hidden className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                  {item}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </section>
  );
}

const ROLE_ICONS: LucideIcon[] = [Wrench, TrendingUp, Factory];

function Roles() {
  const { m } = useI18n();
  const r = m.marketing.roles;
  return (
    <section aria-labelledby="roles-title" className="border-b bg-card">
      <div className={cn(CONTAINER, "py-16 sm:py-20")}>
        <SectionHeader id="roles-title" title={r.title} />
        <ul className="mt-10 grid gap-4 md:grid-cols-3">
          {r.items.map((item, i) => (
            <li key={item.role} className="flex flex-col gap-3 rounded-xl border p-5">
              <IconTile icon={ROLE_ICONS[i]} />
              <h3 className="font-semibold">{item.role}</h3>
              <p className="text-sm text-text-secondary">{item.desc}</p>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

function Faq() {
  const { m } = useI18n();
  const f = m.marketing.faq;
  return (
    <section id="faq" aria-labelledby="faq-title" className="border-b">
      <div className={cn(CONTAINER, "grid gap-10 py-16 sm:py-20 lg:grid-cols-[1fr_2fr]")}>
        <SectionHeader id="faq-title" title={f.title} />
        <ul className="divide-y rounded-xl border bg-card">
          {f.items.map((item) => (
            <li key={item.q}>
              <details className="group">
                <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-4 px-5 py-4 font-medium hover:bg-accent/60 [&::-webkit-details-marker]:hidden">
                  {item.q}
                  <ChevronDown aria-hidden className="size-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-180" />
                </summary>
                <p className="px-5 pb-5 text-sm text-text-secondary">{item.a}</p>
              </details>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

function Contact() {
  const { m } = useI18n();
  const c = m.marketing.contact;
  return (
    <section id="contact" aria-labelledby="contact-title" className="bg-card">
      <div className={cn(CONTAINER, "py-16 sm:py-20")}>
        <SectionHeader id="contact-title" title={c.title} lead={c.lead} />
        <div className="mt-10 grid items-start gap-6 lg:grid-cols-[1.6fr_1fr]">
          <div id="demo" className="rounded-xl border bg-background p-5 sm:p-6">
            <DemoForm />
          </div>
          <div className="flex flex-col gap-6">
            <div className="rounded-xl border bg-background p-5 sm:p-6">
              <h3 className="font-semibold">{c.channelsTitle}</h3>
              <ul className="mt-4 flex flex-col gap-4 text-sm">
                <ContactRow icon={MessageCircle} iconClass="text-healthy" label={c.line}>
                  {SITE_CONTACT.lineUrl ? (
                    <a href={SITE_CONTACT.lineUrl} className="text-link underline underline-offset-2" rel="noopener">
                      {SITE_CONTACT.lineId}
                    </a>
                  ) : (
                    SITE_CONTACT.lineId
                  )}
                </ContactRow>
                <ContactRow icon={Phone} label={c.phoneLabel}>
                  <a href={SITE_CONTACT.phoneHref} className="text-link underline underline-offset-2">
                    {SITE_CONTACT.phoneDisplay}
                  </a>
                </ContactRow>
                <ContactRow icon={Mail} label={c.emailLabel}>
                  <a href={`mailto:${SITE_CONTACT.email}`} className="text-link underline underline-offset-2">
                    {SITE_CONTACT.email}
                  </a>
                </ContactRow>
                <ContactRow icon={Clock3} label={c.hours}>
                  {c.hoursValue}
                </ContactRow>
              </ul>
            </div>
            <div className="rounded-xl border bg-background p-5 sm:p-6">
              <h3 className="flex items-center gap-2 font-semibold">
                <ShieldCheck aria-hidden className="size-4 text-healthy" />
                {c.privacyTitle}
              </h3>
              <ul className="mt-3 list-disc space-y-2 pl-5 text-sm text-text-secondary">
                {c.privacyItems.map((p) => (
                  <li key={p}>{p}</li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function ContactRow({ icon: Icon, iconClass, label, children }: { icon: LucideIcon; iconClass?: string; label: string; children: React.ReactNode }) {
  return (
    <li className="flex items-start gap-3">
      <Icon aria-hidden className={cn("mt-0.5 size-4 shrink-0 text-muted-foreground", iconClass)} />
      <p className="flex flex-col">
        <span className="text-text-secondary">{label}</span>
        <span className="font-medium">{children}</span>
      </p>
    </li>
  );
}
