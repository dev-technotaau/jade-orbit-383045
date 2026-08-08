'use client';

import { toast, Toaster as SonnerToaster, type ExternalToast } from 'sonner';
import { CheckCircle, XCircle, AlertTriangle, Info } from 'lucide-react';
import { createElement } from 'react';

export function Toaster() {
  return (
    <SonnerToaster
      position="top-right"
      expand
      gap={8}
      visibleToasts={5}
      toastOptions={{
        style: {
          fontFamily: 'var(--font-inter), Inter, system-ui, sans-serif',
        },
        classNames: {
          toast: 'border border-[var(--border)] shadow-lg rounded-xl',
          title: 'text-sm font-medium text-[var(--text)]',
          description: 'text-sm text-[var(--text-secondary)]',
        },
      }}
      richColors
      closeButton
    />
  );
}

interface ShowToastOptions extends ExternalToast {
  description?: string;
}

export const showToast = {
  success: (message: string, options?: ShowToastOptions | string) => {
    const opts = typeof options === 'string' ? { description: options } : options;
    return toast.success(message, {
      icon: createElement(CheckCircle, { className: 'h-5 w-5' }),
      ...opts,
    });
  },
  error: (message: string, options?: ShowToastOptions | string) => {
    const opts = typeof options === 'string' ? { description: options } : options;
    return toast.error(message, {
      icon: createElement(XCircle, { className: 'h-5 w-5' }),
      ...opts,
    });
  },
  warning: (message: string, options?: ShowToastOptions | string) => {
    const opts = typeof options === 'string' ? { description: options } : options;
    return toast.warning(message, {
      icon: createElement(AlertTriangle, { className: 'h-5 w-5' }),
      ...opts,
    });
  },
  info: (message: string, options?: ShowToastOptions | string) => {
    const opts = typeof options === 'string' ? { description: options } : options;
    return toast.info(message, {
      icon: createElement(Info, { className: 'h-5 w-5' }),
      ...opts,
    });
  },
  loading: (message: string) => toast.loading(message),
  dismiss: (id?: string | number) => toast.dismiss(id),
};
