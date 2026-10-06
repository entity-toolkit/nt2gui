/**
 * Which version of each simulation's data the client has seen. Reloading a
 * simulation (re-reading it from disk) bumps its version: cached metadata is
 * dropped and every plot of it renders again.
 */
import { useSyncExternalStore } from "react";
import { forgetCached } from "../hooks/useCachedResource";

const versions = new Map<string, number>();
const listeners = new Set<() => void>();

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

export const simulationVersion = (id: string | null | undefined): number =>
  (id && versions.get(id)) || 0;

/** Cache keys are the simulation id, or start with it and a NUL separator. */
const belongsTo = (id: string) => (key: string) =>
  key === id || key.startsWith(`${id}\u0000`);

/** Forget what was loaded for simulation `id`, so it's fetched again. */
export const markSimulationReloaded = (id: string) => {
  forgetCached(belongsTo(id));
  versions.set(id, simulationVersion(id) + 1);
  listeners.forEach((listener) => listener());
};

/** The current data version of a simulation (0 until it's reloaded). */
export const useSimulationVersion = (id: string | null | undefined) =>
  useSyncExternalStore(subscribe, () => simulationVersion(id));
