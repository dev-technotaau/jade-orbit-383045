'use client';

import { Turnstile as TurnstileWidget } from '@marsidev/react-turnstile';

const SITE_KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY || '';

interface TurnstileProps {
  onSuccess: (token: string) => void;
  onError?: () => void;
  onExpire?: () => void;
}

export default function Turnstile({ onSuccess, onError, onExpire }: TurnstileProps) {
  if (!SITE_KEY) return null;

  return (
    <div className="mt-4 flex justify-center">
      <TurnstileWidget
        siteKey={SITE_KEY}
        onSuccess={onSuccess}
        onError={() => {
          console.error('[Turnstile] Challenge failed');
          onError?.();
        }}
        onExpire={onExpire}
        options={{
          theme: 'light',
          size: 'normal',
        }}
      />
    </div>
  );
}
