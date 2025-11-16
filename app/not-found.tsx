import Link from "next/link";

export default function NotFound() {
  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col items-center justify-center gap-4 p-6 text-center">
      <div className="space-y-2">
        <h1 className="text-4xl font-bold">Page not found</h1>
        <p className="text-muted-foreground max-w-md">
          The page you are looking for doesn’t exist or may have been moved.
        </p>
      </div>
      <Link
        href="/"
        className="inline-flex items-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow hover:bg-primary/90"
      >
        Return home
      </Link>
    </div>
  );
}
