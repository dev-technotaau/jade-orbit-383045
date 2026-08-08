'use client';

import Button from '@/components/ui/Button';
import Card from '@/components/ui/Card';
import { CheckCircle, Loader2, Share2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

/**
 * PWA Share Target Handler
 * Receives shared content from other apps when user shares to Hire Adda
 * @see https://web.dev/web-share-target/
 */
export default function SharePage() {
  const router = useRouter();
  const [status, setStatus] = useState<'processing' | 'success' | 'error'>('processing');
  const [sharedData, setSharedData] = useState<{
    title?: string;
    text?: string;
    url?: string;
  }>({});

  useEffect(() => {
    async function handleSharedContent() {
      try {
        // Extract shared data from form data (POST request)
        const formData = new FormData();
        // Note: In actual implementation, this would come from the POST request
        // For now, we check URL parameters as fallback
        const params = new URLSearchParams(window.location.search);
        const title = params.get('title') || '';
        const text = params.get('text') || '';
        const url = params.get('url') || '';

        setSharedData({ title, text, url });

        // Parse shared content and redirect appropriately
        if (url && url.includes('job')) {
          // If sharing a job link, redirect to jobs page
          setTimeout(() => {
            setStatus('success');
            setTimeout(() => router.push('/candidate/jobs'), 1500);
          }, 1000);
        } else if (url && url.includes('company')) {
          // If sharing a company profile, redirect to company page
          setTimeout(() => {
            setStatus('success');
            setTimeout(() => router.push(url), 1500);
          }, 1000);
        } else {
          // Generic share - redirect to home
          setTimeout(() => {
            setStatus('success');
            setTimeout(() => router.push('/'), 1500);
          }, 1000);
        }
      } catch (error) {
        console.error('[Share] Failed to process shared content:', error);
        setStatus('error');
      }
    }

    handleSharedContent();
  }, [router]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-[var(--bg)] px-4">
      <Card className="w-full max-w-md">
        <div className="flex flex-col items-center gap-4 p-8 text-center">
          {status === 'processing' && (
            <>
              <Loader2 className="h-12 w-12 animate-spin text-[var(--primary)]" />
              <h1 className="text-xl font-semibold text-[var(--text)]">
                Processing Shared Content
              </h1>
              <p className="text-sm text-[var(--text-secondary)]">Opening in Hire Adda...</p>
            </>
          )}

          {status === 'success' && (
            <>
              <CheckCircle className="h-12 w-12 text-[var(--success)]" />
              <h1 className="text-xl font-semibold text-[var(--text)]">Content Received!</h1>
              <p className="text-sm text-[var(--text-secondary)]">Redirecting you now...</p>
            </>
          )}

          {status === 'error' && (
            <>
              <Share2 className="h-12 w-12 text-[var(--error)]" />
              <h1 className="text-xl font-semibold text-[var(--text)]">Unable to Process Share</h1>
              <p className="text-sm text-[var(--text-secondary)]">
                We encountered an issue processing the shared content.
              </p>
              <Button
                onClick={() => router.push('/')}
                className="mt-4"
                tooltip="Go to the home page"
              >
                Go to Home
              </Button>
            </>
          )}

          {sharedData.title && (
            <div className="mt-4 w-full rounded-lg bg-[var(--bg-secondary)] p-4 text-left">
              <p className="text-xs font-medium text-[var(--text-secondary)]">Shared:</p>
              <p className="mt-1 text-sm text-[var(--text)]">{sharedData.title}</p>
            </div>
          )}
        </div>
      </Card>
    </div>
  );
}
