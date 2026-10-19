"use client";

// Admin page of the live /hvac module (/hvac/admin): customers, the plants they own (with each plant's
// device registry) and the accounts that may open them, for the service's operators (claim "admin").
// Everything is read and changed through /api/hvac/admin, which checks the operator on every call; the
// browser writes nothing itself.

import { useCallback, useEffect, useState } from "react";
import { Building2, Cpu, Factory, History, ShieldAlert, UsersRound, type LucideIcon } from "lucide-react";
import { Chip } from "@/components/pdm/status";
import { SectionHeading } from "@/components/pdm/page-header";
import { EmptyState, ErrorState, LoadingBlock } from "@/components/pdm/states";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { Overview } from "@/lib/access/model";
import { useHvacAccount } from "@/lib/hvac/account";
import { loadOverview } from "@/lib/hvac/admin-api";
import { useI18n } from "@/lib/i18n/provider";
import { cn } from "@/lib/utils";
import { AccountsPanel } from "./admin-accounts";
import { FormFailure, STACKED_TABLE, useErrorText } from "./admin-common";
import { CustomersPanel } from "./admin-customers";
import { ModelsPanel } from "./admin-models";
import { PlantsPanel } from "./admin-plants";
import { PageTitle } from "./common";

function Notice({ icon: Icon, title, text }: { icon: LucideIcon; title?: string; text: string }) {
  return (
    <div className="flex max-w-2xl items-start gap-3 rounded-lg border bg-card p-4">
      <Icon aria-hidden className="mt-0.5 size-5 shrink-0 text-warning" />
      <div>
        {title ? <p className="font-semibold">{title}</p> : null}
        <p className="text-sm text-text-secondary">{text}</p>
      </div>
    </div>
  );
}

export function AdminView() {
  const { m } = useI18n();
  const a = m.hvac.admin;
  const account = useHvacAccount();
  return (
    <>
      <PageTitle description={a.description}>{m.hvac.titles.admin}</PageTitle>
      {!account ? <Notice icon={ShieldAlert} text={a.liveOnly} /> : !account.operator ? <Notice icon={ShieldAlert} title={a.forbiddenTitle} text={a.forbiddenDesc} /> : <AdminPanels />}
    </>
  );
}

function AdminPanels() {
  const { m } = useI18n();
  const a = m.hvac.admin;
  const [state, setState] = useState<{ data?: Overview; error?: Error }>({});
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    loadOverview().then(
      (data) => !cancelled && setState({ data }),
      (error: Error) => !cancelled && setState((s) => ({ data: s.data, error })),
    );
    return () => {
      cancelled = true;
    };
  }, [attempt]);

  // After a change: load again, keeping the current lists on screen meanwhile.
  const reload = useCallback(async () => {
    try {
      setState({ data: await loadOverview() });
    } catch (error) {
      setState((s) => ({ data: s.data, error: error as Error }));
    }
  }, []);
  const errorText = useErrorText();

  if (!state.data) {
    return state.error ? (
      <ErrorState title={a.loadError} error={new Error(errorText(state.error))} onRetry={() => setAttempt((n) => n + 1)} />
    ) : (
      <LoadingBlock label={a.loading} lines={8} className="rounded-lg border bg-card p-4" />
    );
  }
  const data = state.data;
  return (
    <Tabs defaultValue="customers" className="gap-4">
      {/* Wraps on phones: the list grows with its rows instead of keeping its one-row height. */}
      <TabsList className="h-auto min-h-10 flex-wrap justify-start group-data-horizontal/tabs:h-auto">
        <TabsTrigger value="customers" className="h-9 flex-none px-3">
          <Building2 aria-hidden />
          {a.tabCustomers(data.orgs.length)}
        </TabsTrigger>
        <TabsTrigger value="plants" className="h-9 flex-none px-3">
          <Factory aria-hidden />
          {a.tabPlants(data.projects.length)}
        </TabsTrigger>
        <TabsTrigger value="models" className="h-9 flex-none px-3">
          <Cpu aria-hidden />
          {a.tabModels}
        </TabsTrigger>
        <TabsTrigger value="accounts" className="h-9 flex-none px-3">
          <UsersRound aria-hidden />
          {a.tabAccounts(data.accounts.length)}
        </TabsTrigger>
        <TabsTrigger value="log" className="h-9 flex-none px-3">
          <History aria-hidden />
          {a.tabLog}
        </TabsTrigger>
      </TabsList>
      {state.error ? <FormFailure title={a.loadError} text={errorText(state.error)} /> : null}
      <TabsContent value="customers">
        <CustomersPanel data={data} reload={reload} />
      </TabsContent>
      <TabsContent value="plants">
        <PlantsPanel data={data} reload={reload} />
      </TabsContent>
      <TabsContent value="models">
        <ModelsPanel onChanged={reload} />
      </TabsContent>
      <TabsContent value="accounts">
        <AccountsPanel data={data} reload={reload} />
      </TabsContent>
      <TabsContent value="log">
        <LogPanel data={data} />
      </TabsContent>
    </Tabs>
  );
}

function LogPanel({ data }: { data: Overview }) {
  const { m, f } = useI18n();
  const a = m.hvac.admin;
  return (
    <section aria-labelledby="admin-log-heading" className="flex flex-col gap-3 rounded-lg border bg-card p-4">
      <SectionHeading id="admin-log-heading" title={a.logHeading} description={a.logDesc} />
      {data.log.length === 0 ? (
        <EmptyState compact icon={History} title={a.logEmpty} />
      ) : (
        <div tabIndex={0} role="region" aria-label={a.logCaption} className="relative overflow-x-auto rounded-md border">
          <table className={cn(STACKED_TABLE, "md:min-w-[640px]")}>
            <caption className="sr-only">{a.logCaption}</caption>
            <thead className="bg-muted text-left text-xs text-text-secondary">
              <tr>
                <th scope="col" className="px-3 py-2 font-medium">
                  {a.colWhen}
                </th>
                <th scope="col" className="px-3 py-2 font-medium">
                  {a.colWho}
                </th>
                <th scope="col" className="px-3 py-2 font-medium">
                  {a.colWhat}
                </th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {data.log.map((e) => (
                <tr key={e.id}>
                  <td className="px-3 py-2 whitespace-nowrap tabular">{e.at ? f.dateTime(e.at) : "—"}</td>
                  <td className="px-3 py-2">
                    <span className="break-all">{e.actor}</span>
                    {e.via === "cli" ? <Chip tone="neutral" icon={History} label={a.viaCli} size="sm" className="ml-1.5" /> : null}
                  </td>
                  <td className="px-3 py-2">{a.log[e.action]?.(e.target, e.details) ?? `${e.action} ${e.target}`}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
