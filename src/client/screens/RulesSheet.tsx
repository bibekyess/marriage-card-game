import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { PlayingCard } from "@/components/game/PlayingCard";
import { DEFAULT_SETTINGS, Settings } from "../../shared/settings";

function Example({ title, cards, maal, text }: { title: string; cards: string[]; maal?: string; text: string }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-xl border border-white/[0.06] bg-black/20 p-3">
      <div className="min-w-0">
        <div className="text-sm font-bold">{title}</div>
        <div className="text-xs text-muted-foreground">{text}</div>
      </div>
      <div className="flex shrink-0">
        {cards.map((c, i) => (
          <PlayingCard key={c} id={c} width={34} maal={maal} style={{ marginLeft: i ? -8 : 0 }} />
        ))}
      </div>
    </div>
  );
}

export function RulesSheet({ open, onOpenChange, settings = DEFAULT_SETTINGS }: { open: boolean; onOpenChange(o: boolean): void; settings?: Settings }) {
  const s = settings;
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-md">
        <SheetHeader>
          <SheetTitle>How to play</SheetTitle>
          <SheetDescription>Nepali Marriage with three decks.</SheetDescription>
        </SheetHeader>
        <div className="mt-5 space-y-5 text-sm leading-relaxed">
          <section>
            <h3 className="mb-1 font-bold text-gold">The round</h3>
            <p className="text-muted-foreground">
              Everyone gets 21 cards. On your turn, draw from the stock or take the top discard, then throw one card. You can't throw back a card you just picked up.
            </p>
          </section>
          <section className="space-y-2">
            <h3 className="font-bold text-gold">1 · See the maal</h3>
            <p className="text-muted-foreground">
              Show 3 pure sets to see the hidden maal card{s.dublees ? `, or 7 dublees (${s.dubleeMinPlayers >= 4 ? "4+ players" : "any table"})` : ""}.
              {s.restrictPickup && " Until then, you can only pick up a thrown card that completes a pure set."}
            </p>
            <Example title="Pure sequence" text="Same suit, in a row. Ace low or high." cards={["4H0", "5H0", "6H0"]} />
            <Example title="Tunnel" text="Three identical cards." cards={["9C0", "9C1", "9C2"]} />
            <p className="text-muted-foreground">
              Holding tunnels when you're dealt? Show them on your first turn, before you draw. Each one counts as one of your 3 sets
              and scores {s.tunnel} points once you see the maal. Tunnels you don't show at the start score nothing.
            </p>
            {s.dublees && <Example title="Dublee" text="Two identical cards." cards={["KS0", "KS1"]} />}
          </section>
          <section className="space-y-2">
            <h3 className="font-bold text-gold">2 · Wild cards</h3>
            <p className="text-muted-foreground">
              Once you've seen the maal, these cards are wild and can stand in for any card in a set. They're marked with a star:{" "}
              <b className="text-gold">gold ★</b> scores points, <b className="text-zinc-300">silver ★</b> is wild but scores nothing.
            </p>
            <ul className="grid grid-cols-2 gap-2 text-xs">
              <li className="rounded-lg bg-black/20 p-2"><b>★ Tiplu</b> — the maal card ({s.tiplu} pts)</li>
              <li className="rounded-lg bg-black/20 p-2"><b>★ Poplu</b> — one above, same suit ({s.popluJhiplu})</li>
              <li className="rounded-lg bg-black/20 p-2"><b>★ Jhiplu</b> — one below, same suit ({s.popluJhiplu})</li>
              <li className="rounded-lg bg-black/20 p-2"><b>★ Alter</b> — same rank &amp; colour ({s.alter.join("/")})</li>
              <li className="col-span-2 rounded-lg bg-black/20 p-2"><b className="text-zinc-300">★ Plain wild</b> — same rank, other colour (wild, no points). Tiplu + Poplu + Jhiplu = <b>Marriage</b> ({s.marriage}).</li>
            </ul>
            {(s.jokers > 0 || s.bhoot) && (
              <>
                <p className="text-muted-foreground">
                  {s.jokers > 0 && (
                    <>
                      This table adds {s.jokers === 1 ? "a printed Joker" : `${s.jokers} printed Jokers`}: wild once you've seen the maal, worth{" "}
                      {s.jokerPoints.slice(0, s.jokers).join("/")} for {s.jokers === 1 ? "it" : [1, 2, 3].slice(0, s.jokers).join("/") + " Jokers"}.{" "}
                    </>
                  )}
                  {s.bhoot && (
                    <>
                      The <b className="text-foreground">Bhoot</b> is wild from the start: it can fill a pure sequence or tunnel to see the maal (but not a tunnel
                      shown before your first draw). It scores {s.bhootPoints} points and can never be thrown.{" "}
                    </>
                  )}
                  {s.dublees && "Any two printed cards make a dublee."}
                </p>
                {s.bhoot && <Example title="Pure with the Bhoot" text="The Bhoot fills the gap." cards={["4H0", "BH0", "6H0"]} />}
              </>
            )}
          </section>
          <section className="space-y-2">
            <h3 className="font-bold text-gold">3 · Finish</h3>
            <p className="text-muted-foreground">
              After drawing, make all your remaining cards into sets — sequences or trials (same rank, different suits), wild cards allowed — and throw the last card.
              {s.dublees && " A dublee player wins with an 8th dublee."}
            </p>
            <Example title="Trial" text="Same rank, different suits." cards={["QH0", "QC0", "QS0"]} />
            <Example title="Sequence with a wild" text="7♦ maal: the Jhiplu 6♦ fills the gap." cards={["4S0", "6D0", "6S0"]} maal="7D0" />
          </section>
          <section>
            <h3 className="mb-1 font-bold text-gold">Scoring</h3>
            <p className="text-muted-foreground">
              Every pair of players settles the difference in maal points. Each other player then pays the winner {s.seenPoints} if they saw the maal or {s.unseenPoints} if they didn't
              {s.dublees ? `, plus ${s.dubleeBonus} for a dublee win` : ""}. Unseen players' maal: <b className="text-foreground">{s.unseenRule}</b>.
            </p>
          </section>
        </div>
      </SheetContent>
    </Sheet>
  );
}
