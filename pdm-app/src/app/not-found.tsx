import Link from "next/link";
import { Button } from "@/components/ui/button";
import { getMessages } from "@/lib/i18n/server";

export default async function NotFound() {
  const m = await getMessages();
  return (
    <div className="flex flex-col items-center gap-3 py-24 text-center">
      <p className="text-sm font-semibold text-muted-foreground">404</p>
      <h1 className="text-xl font-semibold">{m.notFound.title}</h1>
      <p className="max-w-md text-sm text-text-secondary">{m.notFound.description}</p>
      <Button asChild className="mt-2">
        <Link href="/">{m.notFound.back}</Link>
      </Button>
    </div>
  );
}
