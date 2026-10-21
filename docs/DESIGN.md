# Design brief (Phase 4)

## Direction
A premium card-room feel, like the reference iOS app:
- **Colours:** near-black green surfaces, a lit felt oval, gold as the single accent, crisp white cards.
- **Calm, confident motion:** cards slide, piles respond, your turn glows. Nothing bounces for its own sake.
- **Information hierarchy on the table:**
  1. Whose turn it is and what to do (hint + glow).
  2. My hand.
  3. The piles.
  4. Opponents.
  5. Scores, which are one tap away.

## Tokens (already in `index.css` / `tailwind.config.ts`)
- Background `#07120f`, surfaces `#0f1c18` / `#13221d`, felt radial `#1f9a6b → #0a4430`, gold `#f5b83d` (gradient `#f7c45a → #eba52a`), success `#34d399`, danger `#e0565b`.
- Type: Plus Jakarta Sans. Bold 700–800 for numbers and names, tabular numbers for scores.
- Radius: 14px on surfaces, cards 11% of width.

## Audit from Phase 3 screenshots (to fix)
| Where | Problem | Fix |
|---|---|---|
| Table, landscape | Top opponent collides with the hint banner and piles | Opponents sit on the felt rim (top seat overlapping the top edge); hint moves into the top bar / under the piles |
| Table, portrait | Hint banner overlaps side seats; the hand's bottom row can clip | Side seats higher; hint above my hand; hand height computed so both rows are fully visible |
| Table, desktop | Huge empty felt, small cards | Cap felt size (max-w ~1200, aspect ~2.1), bigger hand and pile cards, centre the composition |
| Cards | Face cards: the inner panel looks off-centre and the crown is crude; the hand shows only the left strip | Use the classic corner index + centred court panel with a better crown/jack glyph; tune overlap so the index is always legible |
| Seats | Bot badge reads as a mug icon; name chip and count badge crowd the avatar | Cleaner seat card: avatar ring, name, "21 cards" mini-fan, status chips (Seen, Dealer) |
| Action bar | Buttons are small on phones; Show/Declare don't stand out | Primary action pinned at bottom right (like "Discard 7♥" in the reference), secondary icon buttons |
| Turn feedback | Hard to see whose turn it is | Gold ring + pulse on the active seat, hint pill turns gold on my turn, subtle felt vignette |
| Motion | None | Card draw/discard slide (framer-motion layout), dealt hand fan-in, round-result entrance |
| Home, desktop | Content sits high with a large empty area below | Vertically centre; the hero cards fan neatly (no clipped tag) |
| Score sheet, landscape | The sheet covers the table; rows are tall | Compact rows; side sheet on wide screens |

## Screens to screenshot each iteration
Home, Create dialog, Lobby (host + guest), Table (my turn draw / discard / seen with wilds / opponent turn), Round result, Scoreboard, Settle up, Menu, Rules. Viewports: 844×390, 390×844, 1440×900.
