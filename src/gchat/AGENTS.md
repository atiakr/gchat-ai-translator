# src/gchat — Google Chat page adapter

## Scope
- All knowledge of the Google Chat web page: selectors and attribute names (`selectors.ts`), body text extraction (`text.ts`), reading and observing rooms, messages, the composer, and the theme (`adapter.ts`), parsing legacy URL formats (`url.ts`).
- Out of scope: translation decisions (limits, status), UI rendering, messaging, storage access. This module does not import `src/engine`, `src/providers`, `src/settings`, or `src/messaging`.

## Invariants
- Selector strings exist only in `selectors.ts`. `adapter.ts` finds DOM nodes only through the `SELECTORS` / `ATTR` constants and the `safeQuery*` helpers.
- No public function throws. Failure is `null`, `[]`, or `false`. A DOMException from a bad selector never escapes either.
- Room ids are normalized to `dm/<id>` or `space/<id>` (`room/<id>` → `space/<id>`), independent of the account index.
- A message's room is its closest `[data-group-id]` ancestor, otherwise the room of `[role="main"]`.
- When `data-id` is missing, `readMessage` builds a `derived:<hash>` id and marks it with `idSource: 'derived'`.
- Body text excludes quote blocks, `aria-hidden` subtrees inside the body, and the incoming host. Text inside the original-text wrapper (`data-gat-original`) is still read (the hash stays the same after wrapping).
- A body of only emoji/whitespace, a body with only a quote, and an element with neither a heading nor a sender id give `hasBody: false`, `text: ''`.
- `getOwnContentNodes(container or body)` returns the body's direct children that make up the message's own text (excluding quote blocks and extension elements).
- `changed` from `observeMessages` reports only changes inside the body element. Inserting, removing, or moving extension elements (`data-gat-incoming`, `data-gat-original`) into the wrapper does not count, and mutations made inside `mutateUnobserved(fn)` are discarded entirely.

## Implementation
- Each selector constant carries a comment with the date and method of confirmation. Anything not confirmed is marked `UNVERIFIED` (currently: attachment chips, the composer's formatting/mention tag set, the sidebar name element).
- Own message: the heading's display text ≠ `data-name`, and the display text does not start with the real name. The detected `data-user-id` is remembered in module state (reset with `forgetSelfUserId`).
- Replacing composer text: `execCommand('insertText')` → re-check → on failure, one `<div>` per line plus a bubbling `input` event.
- Active composer: the focused one → the one inside `[role="main"]` → the first one.
- Room header slot (`getRoomHeaderSlot`): the `roomHeader` child of the `roomPane` ancestor of the current room root. In the home right-pane view, before the icon `section`; in the full view, before the last (spacer) child of the header row, because the row's right end is covered by Google's side toolbar.

## Tests
- Verified against fixtures in `tests/fixtures/gchat/*.html`. When the page structure changes, capture it again from the live page and update the fixtures, the selectors, and `tests/fixtures/gchat/README.md` together.
- Tests that must stay: no function throws on an empty document, own-message detection ("나"/"You", remembered id, app badge suffix), text extraction for links / mentions / code, extracting only the message's own text from a quoted message (no hidden screen-reader text), messages without a body, the room of a panel message, `added`/`changed` observation and ignoring extension elements, reading / replacing the composer and detecting formatting.
