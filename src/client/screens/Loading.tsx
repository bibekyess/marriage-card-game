import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { navigate } from "@/lib/router";

/** Spinner; after a few seconds offers a way out in case the connection is stuck. */
export function Loading({ text }: { text: string }) {
  const [slow, setSlow] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setSlow(true), 8000);
    return () => clearTimeout(t);
  }, []);
  return (
    <div className="app-bg flex h-full flex-col items-center justify-center gap-3 text-muted-foreground">
      <Loader2 className="h-7 w-7 animate-spin text-gold" />
      <p className="text-sm">{text}</p>
      {slow && (
        <div className="mt-2 flex gap-2">
          <Button size="sm" variant="secondary" onClick={() => location.reload()}>
            Try again
          </Button>
          <Button size="sm" variant="ghost" onClick={() => navigate("/")}>
            Home
          </Button>
        </div>
      )}
    </div>
  );
}
