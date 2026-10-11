import { so101HardwareProvider } from "./hardware";
import { prototypeProvider } from "./prototype";
import type { RobotProvider, RobotProviderMode } from "./types";

// ── Active provider ────────────────────────────────────────────────────────
// One provider serves the whole app at a time. The default is — and in
// release builds stays — the prototype. Only the domain reads this; screens
// get provider mode through domain helpers (getRobotLinkMode()).

const KNOWN_PROVIDERS: readonly RobotProvider[] = [prototypeProvider, so101HardwareProvider];

let activeProvider: RobotProvider = prototypeProvider;

export function getRobotProvider(): RobotProvider {
  return activeProvider;
}

export function getRobotProviderMode(): RobotProviderMode {
  return activeProvider.mode;
}

export function findRobotProvider(providerId: string): RobotProvider | null {
  return KNOWN_PROVIDERS.find((provider) => provider.id === providerId) ?? null;
}

// Internal: use data/robot.ts's setRobotProviderForDevelopment(), which
// first takes every arm offline so no in-flight result from the previous
// provider can land. Ignored outside development builds.
export function installRobotProvider(provider: RobotProvider): boolean {
  if (!__DEV__) return false;
  activeProvider = provider;
  return true;
}
