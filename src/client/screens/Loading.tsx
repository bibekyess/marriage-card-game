import { Loader2 } from "lucide-react";

export function Loading({ text }: { text: string }) {
  return (
    <div className="app-bg flex h-full flex-col items-center justify-center gap-3 text-muted-foreground">
      <Loader2 className="h-7 w-7 animate-spin text-gold" />
      <p className="text-sm">{text}</p>
    </div>
  );
}
