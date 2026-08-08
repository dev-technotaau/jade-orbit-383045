import Spinner from '@/components/ui/Spinner';

export default function CandidateLoading() {
  return (
    <div className="flex flex-1 items-center justify-center">
      <div className="text-center">
        <Spinner size="lg" />
        <p className="mt-3 text-sm text-[var(--text-muted)]">Loading...</p>
      </div>
    </div>
  );
}
