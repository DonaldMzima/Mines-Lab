"use client";

import { createContext, useCallback, useContext, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { useRouter } from "next/navigation";
import { useOnboarding } from "@/components/use-onboarding";
import { HelpDialog } from "@/components/help-dialog";
import { OnboardingStep, ONBOARDING_TITLES } from "@/components/onboarding-steps";
import { ConnectionSetupGuide } from "@/components/connection-setup-guide";
import { useAppState } from "@/components/app-provider";

interface HelpContextValue {
  openTutorial: () => void;
  openConnectionGuide: () => void;
}

const HelpContext = createContext<HelpContextValue | null>(null);

export function HelpProvider({ children }: { children: ReactNode }) {
  const onboarding = useOnboarding({ autoOpen: false });
  const { connection } = useAppState();
  const [guideOpen, setGuideOpen] = useState(false);
  const [dismissedWarning, setDismissedWarning] = useState("");
  const router = useRouter();
  const openTutorial = useCallback(() => { setGuideOpen(false); setDismissedWarning(""); onboarding.openTutorial(); }, [onboarding.openTutorial]);
  const openConnectionGuide = useCallback(() => setGuideOpen(true), []);
  const context = useMemo(() => ({ openTutorial, openConnectionGuide }), [openTutorial, openConnectionGuide]);

  function finish(destination: "/" | "/signals") {
    onboarding.complete();
    setGuideOpen(false);
    router.push(destination);
  }

  function openImports() {
    if (onboarding.open) onboarding.dismiss();
    setGuideOpen(false);
    router.push("/history");
  }

  function close() {
    if (guideOpen) setGuideOpen(false);
    else onboarding.dismiss();
  }

  return <HelpContext.Provider value={context}>
    {children}
    {onboarding.warning && !onboarding.open && !guideOpen && onboarding.warning !== dismissedWarning && <aside className="tutorial-storage-notice" role="status"><p>{onboarding.warning}</p><button type="button" className="icon-button" aria-label="Dismiss tutorial storage message" onClick={() => setDismissedWarning(onboarding.warning)}>×</button></aside>}
    <HelpDialog open={onboarding.ready && (onboarding.open || guideOpen)} titleId={guideOpen ? "connection-guide-title" : "onboarding-title"} focusKey={guideOpen ? "connection-guide" : `tutorial-${onboarding.step}`} closeLabel={guideOpen ? "Close connection setup guide" : "Close and dismiss tutorial"} onClose={close}>
      {guideOpen ? <ConnectionSetupGuide onDone={() => setGuideOpen(false)} onImport={openImports} /> : <div className="onboarding-content">
        <div className="onboarding-progress"><span>Getting started</span><span>Step {onboarding.step + 1} of {ONBOARDING_TITLES.length}</span></div>
        <progress max={ONBOARDING_TITLES.length} value={onboarding.step + 1} aria-label={`Tutorial progress: step ${onboarding.step + 1} of ${ONBOARDING_TITLES.length}`} />
        <h2 id="onboarding-title" tabIndex={-1} data-autofocus>{ONBOARDING_TITLES[onboarding.step]}</h2>
        {onboarding.warning && <p className="onboarding-storage-warning" role="status">{onboarding.warning}</p>}
        <OnboardingStep step={onboarding.step} onOpenGuide={openConnectionGuide} />
        <div className="onboarding-footer">
          <div className="onboarding-actions"><button type="button" className="text-button" onClick={onboarding.dismiss}>Skip tutorial</button>{onboarding.step > 0 && <button type="button" className="secondary-button" onClick={() => onboarding.setStep(onboarding.step - 1)}>Back</button>}</div>
          <div className="onboarding-actions">{onboarding.step === 5 ? <><button type="button" className="secondary-button" onClick={() => finish("/signals")}>Open Signals</button><button type="button" className="primary-button" onClick={() => finish("/")}>Open Dashboard</button></> : <button type="button" className="primary-button" onClick={() => onboarding.setStep(onboarding.step + 1)}>{onboarding.step === 0 ? "Get Started" : onboarding.step === 2 && !connection.available ? "Continue without live setup" : "Next"}<span aria-hidden="true">→</span></button>}</div>
        </div>
      </div>}
    </HelpDialog>
  </HelpContext.Provider>;
}

export function useHelp(): HelpContextValue {
  const context = useContext(HelpContext);
  if (!context) throw new Error("useHelp must be used within HelpProvider.");
  return context;
}
