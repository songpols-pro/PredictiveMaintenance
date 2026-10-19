"use client";

import { createContext, useContext } from "react";

/** Projects of one customer in the project switcher, by plant name. */
export interface ProjectGroup {
  /** Customer id (orgs/{org}); null for plants given one by one, or (operators) plants of no customer. */
  org: string | null;
  /** Customer name; the id until loaded or when unnamed, null when org is null. */
  name: string | null;
  projects: string[];
}

/** The signed-in account of the live /hvac module and the project it is looking at. */
export interface HvacAccount {
  email: string | null;
  /** Every project the account can open, in switcher order (the projects of `groups`). */
  projects: string[];
  /** The same projects by customer: customers by name, then the plants of no listed customer. */
  groups: ProjectGroup[];
  /** Service operator (claim "admin"): sees every project. */
  operator: boolean;
  project: string;
  setProject: (project: string) => void;
  /** Plant name of every project in `projects`, from its registry; the project id until loaded or when unnamed. */
  names: Record<string, string>;
  /** Owner logo (path or URL) of the selected project, from its registry; null when it has none. */
  ownerLogo: string | null;
}

export const AccountContext = createContext<HvacAccount | null>(null);

/** The signed-in account and its selected project; null with the simulation. */
export function useHvacAccount(): HvacAccount | null {
  return useContext(AccountContext);
}
