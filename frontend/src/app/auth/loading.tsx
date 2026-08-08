import Spinner from '@/components/ui/Spinner';

export default function AuthLoading() {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[var(--bg)]">
      <div className="text-center">
        <Spinner size="lg" />
        <p className="mt-3 text-sm text-[var(--text-muted)]">Loading...</p>
      </div>
    </div>
  );
}
