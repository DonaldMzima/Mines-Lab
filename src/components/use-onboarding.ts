"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  isOnboardingStep,
  loadOnboardingProgress,
  ONBOARDING_STEP_COUNT,
  saveOnboardingProgress,
} from "@/lib/onboarding-storage";
import type { OnboardingStatus } from "@/lib/onboarding-storage";

interface OnboardingState {
  ready: boolean;
  open: boolean;
  step: number;
  warning: string;
}

const initialState: OnboardingState = { ready: false, open: false, step: 0, warning: "" };

export function useOnboarding({ autoOpen = true }: { autoOpen?: boolean } = {}) {
  const [state, setState] = useState<OnboardingState>(initialState);
  const latest = useRef(initialState);

  const initialize = useCallback(() => {
    if (latest.current.ready) return latest.current;
    const loaded = loadOnboardingProgress();
    let warning = autoOpen ? loaded.warning : "";
    if (autoOpen && loaded.firstVisit) warning = saveOnboardingProgress(loaded.progress).warning;
    const next: OnboardingState = {
      ready: true,
      open: autoOpen && loaded.progress.status === "in-progress",
      step: loaded.progress.step,
      warning,
    };
    latest.current = next;
    setState(next);
    return next;
  }, [autoOpen]);

  useEffect(() => {
    initialize();
  }, [initialize]);

  const commit = useCallback((status: OnboardingStatus, step: number, open: boolean) => {
    initialize();
    // Save before navigation or closing can unmount the tutorial.
    const result = saveOnboardingProgress({ version: 1, status, step }, true);
    const next: OnboardingState = { ready: true, open, step, warning: result.warning };
    latest.current = next;
    setState(next);
  }, [initialize]);

  const openTutorial = useCallback(() => {
    commit("in-progress", 0, true);
  }, [commit]);

  const setStep = useCallback((step: number) => {
    const current = initialize();
    if (!current.open || !isOnboardingStep(step)) return;
    commit("in-progress", step, true);
  }, [commit, initialize]);

  const dismiss = useCallback(() => {
    const current = initialize();
    if (!current.open) return;
    commit("dismissed", current.step, false);
  }, [commit, initialize]);

  const complete = useCallback(() => {
    if (!initialize().open) return;
    commit("completed", ONBOARDING_STEP_COUNT - 1, false);
  }, [commit, initialize]);

  return { ...state, openTutorial, setStep, dismiss, complete };
}
