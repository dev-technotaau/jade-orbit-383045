'use client';

import { useState, useEffect, useCallback, useRef } from 'react';

const AUTOSAVE_DELAY = 3000; // 3 seconds debounce

interface UseOnboardingOptions<T> {
  storageKey: string;
  totalSteps: number;
  initialData: T;
  onComplete?: (data: T) => void;
}

interface UseOnboardingReturn<T> {
  step: number;
  setStep: (step: number) => void;
  data: T;
  updateData: (partial: Partial<T>) => void;
  nextStep: () => void;
  prevStep: () => void;
  goToStep: (step: number) => void;
  editFromReview: boolean;
  goToStepFromReview: (step: number) => void;
  returnToReview: () => void;
  highestVisitedStep: number;
  isFirstStep: boolean;
  isLastStep: boolean;
  progress: number;
  skipOnboarding: () => void;
  isDirty: boolean;
  clearSavedData: () => void;
}

export function useOnboarding<T extends Record<string, unknown>>({
  storageKey,
  totalSteps,
  initialData,
  onComplete,
}: UseOnboardingOptions<T>): UseOnboardingReturn<T> {
  const [step, setStep] = useState(0);
  const [data, setData] = useState<T>(initialData);
  const [isDirty, setIsDirty] = useState(false);
  const [editFromReview, setEditFromReview] = useState(false);
  const [highestVisitedStep, setHighestVisitedStep] = useState(0);
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const initialLoadRef = useRef(true);

  // Load saved data from localStorage on mount
  useEffect(() => {
    try {
      const saved = localStorage.getItem(storageKey);
      if (saved) {
        const parsed = JSON.parse(saved);
        queueMicrotask(() => {
          // Merge saved data with initialData so new fields get defaults
          if (parsed.data) setData((prev) => ({ ...prev, ...parsed.data }));
          if (typeof parsed.step === 'number') {
            // Clamp to valid range in case totalSteps changed
            const clamped = Math.min(parsed.step, totalSteps - 1);
            setStep(clamped);
            setHighestVisitedStep(clamped);
          }
        });
      }
    } catch {
      // Ignore parse errors
    }
    initialLoadRef.current = false;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storageKey]);

  // Auto-save to localStorage with debounce
  useEffect(() => {
    if (initialLoadRef.current) return;

    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);

    saveTimeoutRef.current = setTimeout(() => {
      try {
        localStorage.setItem(storageKey, JSON.stringify({ data, step }));
      } catch {
        // Storage full or unavailable
      }
    }, AUTOSAVE_DELAY);

    return () => {
      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    };
  }, [data, step, storageKey]);

  const updateData = useCallback((partial: Partial<T>) => {
    setData((prev) => ({ ...prev, ...partial }));
    setIsDirty(true);
  }, []);

  const nextStep = useCallback(() => {
    setStep((prev) => {
      const next = Math.min(prev + 1, totalSteps - 1);
      setHighestVisitedStep((h) => Math.max(h, next));
      return next;
    });
  }, [totalSteps]);

  const prevStep = useCallback(() => {
    setStep((prev) => Math.max(prev - 1, 0));
  }, []);

  const goToStep = useCallback(
    (target: number) => {
      if (target >= 0 && target < totalSteps) {
        setEditFromReview(false);
        setStep(target);
      }
    },
    [totalSteps],
  );

  const goToStepFromReview = useCallback(
    (target: number) => {
      if (target >= 0 && target < totalSteps) {
        setEditFromReview(true);
        setStep(target);
      }
    },
    [totalSteps],
  );

  const returnToReview = useCallback(() => {
    setEditFromReview(false);
    setStep(totalSteps - 1); // Review is always the last step
  }, [totalSteps]);

  const skipOnboarding = useCallback(() => {
    try {
      localStorage.setItem(`${storageKey}_skipped`, 'true');
      localStorage.removeItem(storageKey);
    } catch {
      // Ignore
    }
    onComplete?.(data);
  }, [storageKey, onComplete, data]);

  const clearSavedData = useCallback(() => {
    try {
      localStorage.removeItem(storageKey);
      // Do NOT remove _skipped — it marks onboarding as completed
    } catch {
      // Ignore
    }
  }, [storageKey]);

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't handle if user is typing in an input
      const target = e.target as HTMLElement;
      const isInput =
        target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT';

      if (e.key === 'Escape') {
        prevStep();
      }

      // Ctrl+S to trigger save (prevent default browser save)
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault();
        try {
          localStorage.setItem(storageKey, JSON.stringify({ data, step }));
        } catch {
          // Ignore
        }
      }

      // Enter on non-input to go next
      if (e.key === 'Enter' && !isInput && !e.shiftKey) {
        e.preventDefault();
        nextStep();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [step, data, prevStep, nextStep, storageKey]);

  const progress = totalSteps > 1 ? Math.round((step / (totalSteps - 1)) * 100) : 0;

  return {
    step,
    setStep,
    data,
    updateData,
    nextStep,
    prevStep,
    goToStep,
    editFromReview,
    goToStepFromReview,
    returnToReview,
    highestVisitedStep,
    isFirstStep: step === 0,
    isLastStep: step === totalSteps - 1,
    progress,
    skipOnboarding,
    isDirty,
    clearSavedData,
  };
}

/** Check if onboarding was skipped or completed */
export function wasOnboardingSkipped(storageKey: string): boolean {
  try {
    return localStorage.getItem(`${storageKey}_skipped`) === 'true';
  } catch {
    return false;
  }
}

/** Mark onboarding as completed */
export function markOnboardingComplete(storageKey: string): void {
  try {
    localStorage.setItem(`${storageKey}_skipped`, 'true');
    localStorage.removeItem(storageKey);
  } catch {
    // Ignore
  }
}
