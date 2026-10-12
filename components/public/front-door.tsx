"use client";

import { createContext, useContext, type ReactNode } from "react";
import type { FrontDoor } from "@/lib/public/front-door";

/** Off unless the server says otherwise: a component rendered outside the public layout keeps the old site. */
const FrontDoorContext = createContext<FrontDoor>({ demoPublic: false, signInUrl: "https://app.caudals.com/workspace/sign-in" });

/** Carries the server-read `DEMO_PUBLIC` state (lib/public/front-door.ts) to the public site's client components. */
export function FrontDoorProvider({ value, children }: { value: FrontDoor; children: ReactNode }) {
  return <FrontDoorContext.Provider value={value}>{children}</FrontDoorContext.Provider>;
}

export function useFrontDoor() {
  return useContext(FrontDoorContext);
}
