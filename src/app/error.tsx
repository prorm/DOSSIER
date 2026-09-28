"use client";

import { RotateCcw } from "lucide-react";
import { useEffect } from "react";

import { ErrorState } from "@/components/dossier/primitives";
import { Button } from "@/components/ui/button";

export default function RouteError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);
  return (
    <div className="mx-auto max-w-xl px-4 py-16">
      <ErrorState
        title="Signal lost"
        action={
          <Button variant="outline" onClick={reset}>
            <RotateCcw /> Retry
          </Button>
        }
      >
        This view failed to load. Your progress is safe on the server. {error.digest ? <span className="font-mono text-faint">ref {error.digest}</span> : null}
      </ErrorState>
    </div>
  );
}
