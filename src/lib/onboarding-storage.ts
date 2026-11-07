export const ONBOARDING_STORAGE_KEY = "mines-lab:onboarding:v1";
export const ONBOARDING_STEP_COUNT = 6;

export type OnboardingStatus = "in-progress" | "completed" | "dismissed";

export interface OnboardingProgress {
  version: 1;
  status: OnboardingStatus;
  step: number;
}

interface OnboardingLoadResult {
  progress: OnboardingProgress;
  firstVisit: boolean;
  warning: string;
}

interface OnboardingSaveResult {
  saved: boolean;
  warning: string;
}

function initialProgress(): OnboardingProgress {
  return { version: 1, status: "in-progress", step: 0 };
}

export function isOnboardingStep(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0 && value < ONBOARDING_STEP_COUNT;
}

function parseProgress(value: unknown): OnboardingProgress {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error("Saved tutorial progress is invalid.");
  }
  const record = value as Record<string, unknown>;
  if (record.version !== 1) throw new Error("Saved tutorial progress uses an unsupported version.");
  if (
    (record.status !== "in-progress" && record.status !== "completed" && record.status !== "dismissed") ||
    !isOnboardingStep(record.step)
  ) {
    throw new Error("Saved tutorial progress is invalid.");
  }
  return { version: 1, status: record.status, step: record.step };
}

export function loadOnboardingProgress(): OnboardingLoadResult {
  let raw: string | null;
  try {
    raw = window.localStorage.getItem(ONBOARDING_STORAGE_KEY);
  } catch {
    return {
      progress: initialProgress(),
      firstVisit: false,
      warning: "Tutorial progress cannot be read in this browser. You can continue, but refreshing may show the tutorial again.",
    };
  }
  if (raw === null) return { progress: initialProgress(), firstVisit: true, warning: "" };
  try {
    const parsed: unknown = JSON.parse(raw);
    return { progress: parseProgress(parsed), firstVisit: false, warning: "" };
  } catch {
    return {
      progress: initialProgress(),
      firstVisit: false,
      warning: "Saved tutorial progress could not be restored. Starting at Welcome. The original value is preserved; your next action will try to back it up before saving new progress. Your other workspace data is unaffected.",
    };
  }
}

export function saveOnboardingProgress(
  progress: OnboardingProgress,
  allowRecovery = false,
): OnboardingSaveResult {
  try {
    const validated = parseProgress(progress);
    const storage = window.localStorage;
    const original = storage.getItem(ONBOARDING_STORAGE_KEY);
    let recovered = false;
    if (original !== null) {
      try {
        const parsed: unknown = JSON.parse(original);
        parseProgress(parsed);
      } catch {
        if (!allowRecovery) {
          return { saved: false, warning: "Existing tutorial progress was preserved. Choose a tutorial action to back it up and start saving new progress." };
        }
        const suffix = globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`;
        const backupKey = `${ONBOARDING_STORAGE_KEY}:recovery:${suffix}`;
        storage.setItem(backupKey, original);
        if (storage.getItem(backupKey) !== original) throw new Error("Tutorial backup failed.");
        recovered = true;
      }
    }
    storage.setItem(ONBOARDING_STORAGE_KEY, JSON.stringify(validated));
    return {
      saved: true,
      warning: recovered ? "The previous tutorial value was backed up in this browser. Your updated tutorial progress is now being saved." : "",
    };
  } catch {
    return {
      saved: false,
      warning: "Tutorial progress could not be saved in this browser. It is kept for this visit; refreshing may restore earlier progress. Existing tutorial data has not been replaced.",
    };
  }
}
