import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { CURRENCIES, Scale, Settings, timerLabel, TURN_TIMERS, UnseenRule } from "../../shared/settings";

/** Three point fields for holding 1, 2 or 3 of a kind. */
function ScaleNums({ value, onChange, disabled }: { value: Scale; onChange(s: Scale): void; disabled?: boolean }) {
  return (
    <div className="flex gap-1.5">
      {[0, 1, 2].map((i) => (
        <Num
          key={i}
          w="w-14"
          value={value[i]}
          disabled={disabled}
          onChange={(v) => {
            const a = [...value] as Scale;
            a[i] = v;
            onChange(a);
          }}
        />
      ))}
    </div>
  );
}

interface Props {
  value: Settings;
  onChange(s: Settings): void;
  disabled?: boolean;
}

function Row({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-white/[0.06] py-3 last:border-0">
      <div className="min-w-0">
        <div className="text-sm font-semibold">{title}</div>
        {hint && <div className="mt-0.5 text-xs leading-snug text-muted-foreground">{hint}</div>}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}

function Num({ value, onChange, disabled, step = 1, w = "w-20" }: { value: number; onChange(n: number): void; disabled?: boolean; step?: number; w?: string }) {
  return (
    <Input
      type="number"
      inputMode="decimal"
      min={0}
      step={step}
      value={Number.isFinite(value) ? value : 0}
      disabled={disabled}
      onChange={(e) => onChange(e.target.value === "" ? 0 : Number(e.target.value))}
      className={cn("h-9 text-right tabular-nums", w)}
    />
  );
}

export function Segmented<T extends string | number>({ value, options, onChange, disabled }: { value: T; options: { v: T; label: string }[]; onChange(v: T): void; disabled?: boolean }) {
  return (
    <div className="inline-flex rounded-lg border border-white/10 bg-black/20 p-0.5">
      {options.map((o) => (
        <button
          key={String(o.v)}
          type="button"
          disabled={disabled}
          onClick={() => onChange(o.v)}
          className={cn(
            "rounded-md px-2.5 py-1.5 text-xs font-semibold text-muted-foreground transition-colors disabled:opacity-50",
            value === o.v && "bg-gradient-to-b from-[#f7c45a] to-[#eba52a] text-primary-foreground shadow",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/** Table rules editor, shared by "Create table" and the host's "Edit rules". */
export function RulesForm({ value: s, onChange, disabled }: Props) {
  const up = <K extends keyof Settings>(k: K, v: Settings[K]) => onChange({ ...s, [k]: v });
  return (
    <Tabs defaultValue="match" className="w-full">
      <TabsList className="grid w-full grid-cols-3">
        <TabsTrigger value="match">Match</TabsTrigger>
        <TabsTrigger value="points">Points</TabsTrigger>
        <TabsTrigger value="house">House rules</TabsTrigger>
      </TabsList>

      <TabsContent value="match" className="mt-2">
        <Row title="Rounds" hint="Scores are settled after the last round.">
          <Segmented
            value={s.rounds}
            disabled={disabled}
            onChange={(v) => up("rounds", v)}
            options={[
              { v: 1, label: "1" },
              { v: 3, label: "3" },
              { v: 5, label: "5" },
              { v: 10, label: "10" },
              { v: 0, label: "∞" },
            ]}
          />
        </Row>
        <Row title="Price per point" hint="Decimals like 0.2 are fine.">
          <div className="flex items-center gap-2">
            <Num value={s.pointRate} step={0.1} disabled={disabled} onChange={(v) => up("pointRate", v)} />
            <Select value={s.currency} disabled={disabled} onValueChange={(v) => up("currency", v)}>
              <SelectTrigger className="h-9 w-[92px]" aria-label="Currency">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CURRENCIES.map((c) => (
                  <SelectItem key={c.code} value={c.code} title={c.name}>
                    {c.code}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </Row>
        <Row title="Turn timer" hint="Auto-plays when time runs out.">
          <Segmented
            value={s.turnTimer}
            disabled={disabled}
            onChange={(v) => up("turnTimer", v)}
            options={TURN_TIMERS.map((v) => ({ v, label: timerLabel(v) }))}
          />
        </Row>
        <Row title="Bot speed">
          <Segmented
            value={s.botSpeed}
            disabled={disabled}
            onChange={(v) => up("botSpeed", v)}
            options={[
              { v: "relaxed", label: "Relaxed" },
              { v: "normal", label: "Normal" },
              { v: "fast", label: "Fast" },
            ]}
          />
        </Row>
      </TabsContent>

      <TabsContent value="points" className="mt-2">
        <Row title="Seen game point" hint="Winner gets this from each player who saw the maal.">
          <Num value={s.seenPoints} disabled={disabled} onChange={(v) => up("seenPoints", v)} />
        </Row>
        <Row title="Unseen game point" hint="…and this from each player who didn't.">
          <Num value={s.unseenPoints} disabled={disabled} onChange={(v) => up("unseenPoints", v)} />
        </Row>
        <Row title="Tiplu" hint="For 1 / 2 / 3 tiplu cards.">
          <ScaleNums value={s.tiplu} disabled={disabled} onChange={(v) => up("tiplu", v)} />
        </Row>
        <Row title="Poplu / Jhiplu" hint="For 1 / 2 / 3 poplu, and the same for jhiplu.">
          <ScaleNums value={s.popluJhiplu} disabled={disabled} onChange={(v) => up("popluJhiplu", v)} />
        </Row>
        <Row title="Marriage" hint="For 1 / 2 / 3 sets of Tiplu + Poplu + Jhiplu.">
          <ScaleNums value={s.marriage} disabled={disabled} onChange={(v) => up("marriage", v)} />
        </Row>
        <Row title="Alter" hint="For 1 / 2 / 3 alter cards.">
          <ScaleNums value={s.alter} disabled={disabled} onChange={(v) => up("alter", v)} />
        </Row>
        <Row title="Tunnel" hint="Each tunnel shown at the start (needs maal seen).">
          <Num value={s.tunnel} disabled={disabled} onChange={(v) => up("tunnel", v)} />
        </Row>
        <Row title="Jokers" hint="For 1 / 2 / 3 printed Jokers.">
          <ScaleNums value={s.jokerPoints} disabled={disabled || !s.jokers} onChange={(v) => up("jokerPoints", v)} />
        </Row>
        <Row title="Bhoot" hint="The printed Bhoot card.">
          <Num value={s.bhootPoints} disabled={disabled || !s.bhoot} onChange={(v) => up("bhootPoints", v)} />
        </Row>
        <Row title="Dublee win bonus" hint="Extra from each player when someone wins by dublees.">
          <Num value={s.dubleeBonus} disabled={disabled} onChange={(v) => up("dubleeBonus", v)} />
        </Row>
      </TabsContent>

      <TabsContent value="house" className="mt-2">
        <Row title="Unseen players' maal" hint={UNSEEN_HINT[s.unseenRule]}>
          <Segmented<UnseenRule>
            value={s.unseenRule}
            disabled={disabled}
            onChange={(v) => up("unseenRule", v)}
            options={[
              { v: "murder", label: "Murder" },
              { v: "kidnap", label: "Kidnap" },
              { v: "count", label: "Count" },
            ]}
          />
        </Row>
        <Row title="Printed Jokers" hint="Wild once you've seen the maal. Score like alters.">
          <Segmented
            value={s.jokers}
            disabled={disabled}
            onChange={(v) => up("jokers", v)}
            options={[0, 1, 2, 3].map((v) => ({ v, label: String(v) }))}
          />
        </Row>
        <Row title="Bhoot" hint="Wild even in pure sets, scores points, can't be thrown.">
          <Switch checked={s.bhoot} disabled={disabled} onCheckedChange={(v) => up("bhoot", v)} aria-label="Bhoot" />
        </Row>
        <Row title="Dublees" hint="7 dublees to see the maal, 8 to win.">
          <Switch checked={s.dublees} disabled={disabled} onCheckedChange={(v) => up("dublees", v)} aria-label="Dublees" />
        </Row>
        <Row title="Dublees need 4+ players" hint="Only allow the dublee route with 4 or more players.">
          <Switch
            checked={s.dubleeMinPlayers >= 4}
            disabled={disabled || !s.dublees}
            onCheckedChange={(v) => up("dubleeMinPlayers", v ? 4 : 2)}
            aria-label="Dublees need 4 or more players"
          />
        </Row>
        <Row title="Pick-up rule" hint="Before seeing the maal, a thrown card can only be taken to complete a pure set.">
          <Switch checked={s.restrictPickup} disabled={disabled} onCheckedChange={(v) => up("restrictPickup", v)} aria-label="Pick-up rule" />
        </Row>
      </TabsContent>
    </Tabs>
  );
}

const UNSEEN_HINT: Record<UnseenRule, string> = {
  murder: "Murder: maal of players who didn't see is not counted.",
  kidnap: "Kidnap: the winner takes the unseen player's maal.",
  count: "Counted as normal, seen or not.",
};

export function rulesSummary(s: Settings) {
  const parts = [
    s.rounds ? `${s.rounds} rounds` : "Open-ended",
    `${s.pointRate} ${s.currency}/pt`,
    s.unseenRule[0].toUpperCase() + s.unseenRule.slice(1),
    s.dublees ? (s.dubleeMinPlayers >= 4 ? "Dublee 4+" : "Dublee") : "No dublee",
  ];
  const printed = [s.jokers ? `${s.jokers} Joker${s.jokers > 1 ? "s" : ""}` : "", s.bhoot ? "Bhoot" : ""].filter(Boolean);
  if (printed.length) parts.push(printed.join(" + "));
  if (s.turnTimer) parts.push(`${timerLabel(s.turnTimer)} timer`);
  return parts.join(" · ");
}

