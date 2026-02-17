import { create } from 'zustand'
import { persist } from 'zustand/middleware'

// ============================================================================
// Onboarding Store - Tracks first-time user experience
// ============================================================================

export type OnboardingStep = 'welcome' | 'ai-setup' | 'features-tour' | 'get-started'

interface OnboardingState {
  // Persistence state
  hasCompletedOnboarding: boolean
  hasSkippedOnboarding: boolean

  // Modal state
  isOnboardingOpen: boolean
  currentStep: OnboardingStep

  // Feature tooltips state
  showTooltips: boolean
  dismissedTooltips: string[]

  // Actions
  openOnboarding: () => void
  closeOnboarding: () => void
  nextStep: () => void
  previousStep: () => void
  goToStep: (step: OnboardingStep) => void
  skipOnboarding: () => void
  completeOnboarding: () => void
  resetOnboarding: () => void

  // Tooltip actions
  dismissTooltip: (tooltipId: string) => void
  resetTooltips: () => void
  setShowTooltips: (show: boolean) => void
}

const STEPS: OnboardingStep[] = ['welcome', 'ai-setup', 'features-tour', 'get-started']

export const useOnboardingStore = create<OnboardingState>()(
  persist(
    (set, get) => ({
      // Initial state
      hasCompletedOnboarding: false,
      hasSkippedOnboarding: false,
      isOnboardingOpen: false,
      currentStep: 'welcome',
      showTooltips: true,
      dismissedTooltips: [],

      // Open onboarding modal
      openOnboarding: () => set({
        isOnboardingOpen: true,
        currentStep: 'welcome'
      }),

      // Close onboarding modal
      closeOnboarding: () => set({
        isOnboardingOpen: false
      }),

      // Navigate to next step
      nextStep: () => {
        const { currentStep } = get()
        const currentIndex = STEPS.indexOf(currentStep)
        if (currentIndex < STEPS.length - 1) {
          set({ currentStep: STEPS[currentIndex + 1] })
        }
      },

      // Navigate to previous step
      previousStep: () => {
        const { currentStep } = get()
        const currentIndex = STEPS.indexOf(currentStep)
        if (currentIndex > 0) {
          set({ currentStep: STEPS[currentIndex - 1] })
        }
      },

      // Jump to specific step
      goToStep: (step) => set({ currentStep: step }),

      // Skip onboarding for experienced users
      skipOnboarding: () => set({
        hasSkippedOnboarding: true,
        hasCompletedOnboarding: true,
        isOnboardingOpen: false,
        showTooltips: false
      }),

      // Complete onboarding flow
      completeOnboarding: () => set({
        hasCompletedOnboarding: true,
        isOnboardingOpen: false,
        showTooltips: true
      }),

      // Reset onboarding (for testing or re-running)
      resetOnboarding: () => set({
        hasCompletedOnboarding: false,
        hasSkippedOnboarding: false,
        isOnboardingOpen: false,
        currentStep: 'welcome',
        showTooltips: true,
        dismissedTooltips: []
      }),

      // Dismiss a specific tooltip
      dismissTooltip: (tooltipId) => set((state) => ({
        dismissedTooltips: [...state.dismissedTooltips, tooltipId]
      })),

      // Reset all tooltips
      resetTooltips: () => set({
        dismissedTooltips: [],
        showTooltips: true
      }),

      // Toggle tooltip visibility
      setShowTooltips: (show) => set({ showTooltips: show })
    }),
    {
      name: 'alabobai-onboarding',
      partialize: (state) => ({
        hasCompletedOnboarding: state.hasCompletedOnboarding,
        hasSkippedOnboarding: state.hasSkippedOnboarding,
        showTooltips: state.showTooltips,
        dismissedTooltips: state.dismissedTooltips
      })
    }
  )
)

// Helper hook to check if onboarding should show
export const useShouldShowOnboarding = () => {
  const { hasCompletedOnboarding, hasSkippedOnboarding } = useOnboardingStore()
  return !hasCompletedOnboarding && !hasSkippedOnboarding
}

// Helper to get step index
export const getStepIndex = (step: OnboardingStep): number => {
  return STEPS.indexOf(step)
}

// Helper to get total steps
export const getTotalSteps = (): number => {
  return STEPS.length
}
