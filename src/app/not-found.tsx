import Link from "next/link";

import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <main id="main" className="grid min-h-[70dvh] place-items-center px-6">
      <div className="max-w-md text-center">
        <p className="label-mono">{"// 404 — no such record"}</p>
        <h1 className="mt-3 font-mono text-3xl font-bold uppercase tracking-[0.06em]">File not found</h1>
        <p className="mt-3 text-sm text-ink-dim">This record does not exist, or it is still sealed for your team.</p>
        <Button asChild variant="outline" className="mt-6">
          <Link href="/play">Return to console</Link>
        </Button>
      </div>
    </main>
  );
}
