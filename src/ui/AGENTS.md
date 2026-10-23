# src/ui — user interface

## Scope
- Design tokens (`tokens.css`), theme helpers (`theme.ts`), the shared Shadow DOM host (`shadow.ts`).
- Incoming translation UI (`incoming/`): per-status components, `mount.ts` which manages one host per container plus the original-text wrapper, and extension element markers (`markers.ts`, also used by the adapter).
- Outgoing translation UI (`outgoing/`): button, preview, language select, and sent-original components, the behavior in `controller.ts`, and the outgoing-only host `host.ts`.
- Shared options/popup components (`common/`), the options page (`settings/OptionsApp.tsx` and its sections, including clear-history), and the popup (`popup/PopupApp.tsx`, with `usePopupSettings` which never reads keys).
- Out of scope: provider calls, limit judgement, Google Chat selectors. The outgoing controller reaches Google Chat only through adapter functions.

## Invariants
- UI over the chat page is drawn only inside Shadow DOM. The incoming host (`gat-incoming`, `data-gat-incoming`) lives **inside** the body element: right after the original-text wrapper (`<span data-gat-original>`) when `translated`, otherwise at the end of the body. Outgoing elements are hosts with the `data-gat-outgoing` attribute.
- `unmount` / `unmountAll()` move wrapped original nodes back where they were and remove the wrapper and host, leaving Google's DOM exactly as it was. For a detached or missing anchor, `mountIncoming` returns `null` and does not throw.
- Only in the `translated` state is the message's own text (`getOwnContentNodes`, excluding the quote block) wrapped and hidden, with the translation drawn in the same typography as the original (`inherit`). A small "See original" / "See translation" text button switches between them. `pending`, `error`, and skipped states leave the original as is and append a small line.
- Body DOM mutations (wrapping, restoring, moving the host) happen only inside the adapter's `mutateUnobserved`. `isAttached()` tells whether a Google re-render removed the wrapper or host, and calling `mountIncoming` again on the same container restores it.
- Outgoing: nothing changes the composer or sends before the user confirms. Cancel leaves the composer untouched. Late translation results for a previously selected language are dropped. Key handlers are attached only to the composer element.
- The options page saves keys only through `setApiKey`, on blur/Enter. A custom URL is saved only when its permission is granted. The popup never calls `getApiKeys` or `watchApiKeys`.
- All strings go through `t()`. Colors and spacing use only `--gat-*` tokens.

## Implementation
- Visual style: white / dark-gray surfaces, generous spacing, 12px radius (8px for small elements), a single blue accent, minimal shadows, no decoration. The only animation is a 150 ms opacity transition on the loading indicator, disabled under `prefers-reduced-motion`.
- The sent original sits right after the body of my translated message, collapsed to a small "See original" text button; clicking expands the original below it. The sent message itself is never hidden or changed.
- The outgoing preview is attached to `document.body` with `position: fixed`, positioned from the composer's screen coordinates.
- Sync-backed text inputs on the options page save only on blur/Enter to stay under the sync write quota.

## Tests
- Testing Library for per-status rendering and callbacks; jsdom for host placement, original-text wrapping, the toggle, exact restoration (innerHTML comparison, including the quote fixture), and observer silence. If `test.css: true` in `vitest.config.ts` is turned off, style injection tests fail with an empty string.
- Tests that must stay: incoming rendering per status, `unmountAll` cleanup and exact DOM restoration, the "See original" toggle, extension mutations not triggering `changed`, the outgoing controller's empty composer / duplicate shortcut / confirm / failure / cancel / save check / sent-original matching, options storing keys in local / not saving when permission is denied / passing values to the connection test, the popup handling no response for the current room.
