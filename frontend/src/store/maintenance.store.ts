import { create } from 'zustand';

interface MaintenanceState {
  isMaintenanceMode: boolean;
  message: string | null;
  estimatedReturnTime: string | null;

  setMaintenanceMode: (active: boolean, message?: string, estimatedReturn?: string) => void;
  clearMaintenanceMode: () => void;
}

export const useMaintenanceStore = create<MaintenanceState>((set) => ({
  isMaintenanceMode: false,
  message: null,
  estimatedReturnTime: null,

  setMaintenanceMode: (active, message, estimatedReturn) =>
    set({
      isMaintenanceMode: active,
      message: message || null,
      estimatedReturnTime: estimatedReturn || null,
    }),

  clearMaintenanceMode: () =>
    set({
      isMaintenanceMode: false,
      message: null,
      estimatedReturnTime: null,
    }),
}));
