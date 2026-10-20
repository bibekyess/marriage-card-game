import { useEffect } from "react";
import { THEMES, type ThemeId } from "../../lib/themes";
import { CardBackArt, FeltPattern, MaalAccent, TableDecor, THEME_FELT, ThemeSwatch } from "./decor";

const FONT_HREF = "https://fonts.googleapis.com/css2?family=Great+Vibes&display=swap";

function CardBack({ theme, width }: { theme: ThemeId; width: number }) {
  return (
    <div
      className="relative rounded-[8px] overflow-hidden border border-white shrink-0"
      style={{ width, aspectRatio: "1 / 1.42" }}
    >
      <CardBackArt theme={theme} />
    </div>
  );
}

function MockTable({ theme, width, height }: { theme: ThemeId; width: number; height: number }) {
  const f = THEME_FELT[theme];
  return (
    <div className="relative overflow-hidden shrink-0" style={{ width, height, background: f.page }}>
      <div
        className="absolute overflow-hidden"
        style={{
          left: "5%",
          right: "5%",
          top: "16%",
          bottom: "24%",
          borderRadius: "50%",
          background: f.felt,
          boxShadow: `0 0 0 8px ${f.rim}`,
        }}
      >
        <FeltPattern theme={theme} />
      </div>
      <div className="absolute inset-0 z-[1]">
        <TableDecor theme={theme} />
      </div>
      <div className="absolute left-1/2 top-[34%] z-[2] flex -translate-x-1/2 items-end gap-3">
        <CardBack theme={theme} width={18} />
        <CardBack theme={theme} width={56} />
        <CardBack theme={theme} width={110} />
        <div className="relative">
          <MaalAccent theme={theme} size={36} />
        </div>
      </div>
      <div className="absolute bottom-2 right-2 z-[2] overflow-hidden rounded-md border border-white/20" style={{ width: 132, height: 80 }}>
        <ThemeSwatch theme={theme} />
      </div>
    </div>
  );
}

export function DevThemes() {
  useEffect(() => {
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = FONT_HREF;
    document.head.appendChild(link);
    return () => {
      link.remove();
    };
  }, []);

  return (
    <div className="min-h-screen bg-neutral-900 p-4 text-white">
      <h1 className="mb-4 text-xl font-bold">Theme art</h1>
      <div className="space-y-8">
        {THEMES.map((t) => (
          <section key={t.id}>
            <h2 className="mb-2 text-lg font-semibold">
              {t.name} <span className="text-sm font-normal text-white/60">({t.id})</span>
            </h2>
            <div className="flex flex-wrap items-start gap-4">
              <div className="max-w-full overflow-x-auto">
                <MockTable theme={t.id} width={844} height={390} />
              </div>
              <div className="max-w-full overflow-x-auto">
                <MockTable theme={t.id} width={390} height={560} />
              </div>
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
