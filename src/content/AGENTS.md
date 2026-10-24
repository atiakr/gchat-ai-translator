# src/content — content script wiring

## Scope
- `createContentController(deps)`: ties the adapter, UI, and messaging together. Owns the incoming translation pipeline, reacting to on/off changes, restoring translation UI that Google removed, following the theme, reporting broken page structure, wiring the outgoing controller, and answering `room.current` and `command.translateOutgoing`.
- Out of scope: DOM selectors (gchat), rendering details (ui), provider calls and history (background). This module does not import `src/providers`.

## Invariants
- The user's own messages never reach `translate.batch` by any path.
- When translation is unavailable (globally off, no key, invalid key) or incoming translation is off for the room, no `translate.batch` is sent. The moment translation becomes unavailable, all incoming UI is removed. Turning incoming off for a room does not hide the outgoing button.
- Limits are judged with `judgeLimits` before any request. `no_text` gets no UI; `same_language` (a message mostly written in the target language, judged locally for Korean, Japanese, and Thai by `src/engine/script.ts`) gets no UI and no call; `skipped_*` gets a notice line without a call.
- Rank is counted newest-first over the ids of incoming messages with a body seen so far in the current room, accumulated in order (kept even after they leave the DOM). Switching rooms or stopping clears the accumulated list and status map and removes all UI.
- The `pending` loading indicator is attached only after a 150 ms grace period. If the result arrives before that, the final state is attached directly. The grace timer is cancelled when the message is removed, the room changes, or the controller stops.
- In the per-message status map (`messageId → textHash, status, translation`), an unchanged hash is never requested again. A changed hash goes back to `pending` and is requested again.
- If the hash is unchanged but Google's re-render removed the incoming UI (no handle, or `isAttached()` is false), the last result in the status map is re-attached without a request (on both `added` and `changed` ticks).
- My own messages from `added` and `changed` ticks (and every container when a room becomes ready) go to the outgoing `restoreSentOriginals`, so the in-place original comes back after Google re-renders the body.
- Late responses from a previous room are dropped.
- An exception while handling one message never stops handling of other messages.

## Implementation
- All request targets of one observation tick go out as a single `translate.batch` (the background re-batches them).
- If there is no response or it is rejected, send once more; if that also fails, mark `error`/`server`.
- If `settings.get` fails at startup, stay off and ask again up to 3 times at 2-second intervals. A `settings.changed` message recovers immediately.
- Broken-page reporting: after 60 seconds with 0 messages on a conversation screen, report `messagesFound: 0` (once); when messages are found, report the count. Found reports are sent at most once per 10 seconds unless the state changes.
- Theme: only the `data-theme` attribute of `body` is observed. On change, call `setTheme` on the incoming UI and re-`mount` the outgoing UI.
- The outgoing controller is re-`mount`ed every time messages are added so the button survives composer re-renders.

## Tests
- Verified with a fake adapter (in-memory containers + `emit`), fake messaging, fake mounts, and fake timers.
- Tests that must stay: own messages and no-body messages excluded, handling per limit, re-request on edit / no request when unchanged, request-free restore of removed UI, off / no key / room-off behavior, retry, re-request after disconnect, settings retry, broken-page report timing, room-switch reset and late-response drop, cleanup on stop.
