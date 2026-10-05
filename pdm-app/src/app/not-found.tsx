import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="flex flex-col items-center gap-3 py-24 text-center">
      <p className="text-sm font-semibold text-muted-foreground">404</p>
      <h1 className="text-xl font-semibold">Page not found</h1>
      <p className="max-w-md text-sm text-text-secondary">The page you’re looking for doesn’t exist or has moved.</p>
      <Button asChild className="mt-2">
        <Link href="/">Back to overview</Link>
      </Button>
    </div>
  );
}
