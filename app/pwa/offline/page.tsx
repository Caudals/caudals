export default function PwaOfflinePage() {
  return (
    <div className="space-y-4 pb-16 pt-6 text-center text-white">
      <h2 className="text-2xl font-semibold">You&apos;re offline</h2>
      <p className="text-white/70">
        We cached the essential screens so you can keep reviewing briefs. Upload
        actions will resume automatically once your connection is back.
      </p>
      <div className="rounded-3xl border border-white/15 bg-white/5 p-4 text-left text-sm text-white/80">
        <p className="font-semibold">What still works:</p>
        <ul className="mt-2 list-disc space-y-1 pl-5 text-white/70">
          <li>Previously opened dataset briefs</li>
          <li>Drafted notes for your next upload</li>
          <li>Queued files stored on your device</li>
        </ul>
        <p className="mt-3 text-xs uppercase tracking-[0.3em] text-white/40">
          You can close this page once you&apos;re back online.
        </p>
      </div>
    </div>
  );
}
