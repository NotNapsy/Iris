import { ORIGINAL_SCRIPT, FALLBACK_SCRIPT } from "./scripts/original.ts";

export function getScript(): string {
  return ORIGINAL_SCRIPT.length > 1000 ? ORIGINAL_SCRIPT : FALLBACK_SCRIPT;
}
