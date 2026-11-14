# UI Conventions

House rules for overlay UI across all modules. New modules (and in-flight rewrites, once they land) should follow these by default.

## Sheet vs Dialog vs AlertDialog

| Component | Use for | Examples |
|---|---|---|
| `Sheet` (side="right") | **All create/edit data-entry forms.** Anything with inputs the user fills in and submits. | Create/edit tank, transaction, shift, flight, certification |
| `Dialog` | Small read-only or pick-one interactions that are not data-entry forms. | Hour-detail popovers, command palette, quick info panels |
| `AlertDialog` | Blocking confirmations of destructive/irreversible actions. | "Delete this tank?" |

The slideout (`Sheet`) is the single house standard for create/edit UI. Do not introduce new `Dialog`-based forms.

## Standard form slideout

Import from `@/components/ui/sheet` and follow this skeleton:

```tsx
<Sheet open={open} onOpenChange={onOpenChange}>
  <SheetContent
    side="right"
    className="flex w-full flex-col gap-0 p-0 sm:max-w-md"
  >
    <SheetHeader className="border-b border-border p-4">
      <SheetTitle>{isEdit ? 'Edit Thing' : 'Create Thing'}</SheetTitle>
      <SheetDescription>One-line summary of what this form does.</SheetDescription>
    </SheetHeader>

    <form onSubmit={handleSubmit} className="flex flex-1 flex-col overflow-hidden">
      {/* scrollable body */}
      <div className="flex-1 space-y-4 overflow-y-auto p-4">
        {/* fields */}
      </div>

      {/* pinned footer */}
      <SheetFooter className="flex-col gap-2 border-t border-border p-4 sm:flex-row sm:justify-end">
        <Button type="button" variant="outline" onClick={close} className="w-full sm:w-auto">
          Cancel
        </Button>
        <Button type="submit" className="w-full sm:w-auto">
          {isEdit ? 'Update' : 'Create'}
        </Button>
      </SheetFooter>
    </form>
  </SheetContent>
</Sheet>
```

### Rules

- **Side**: always `side="right"`.
- **Width**: `w-full sm:max-w-md` (448px) is the standard form width. Use `sm:max-w-xl` only for genuinely dense forms (many two-column rows); use `sm:max-w-[400px]` narrow variant only for compact property editors (see `parking/aircraft-sheet.tsx`).
- **Layout**: `p-0 gap-0` on `SheetContent`; the header, body, and footer own their `p-4` padding. Header gets `border-b`, footer gets `border-t`. Body scrolls (`flex-1 overflow-y-auto`); header and footer stay pinned.
- **Header**: always include both `SheetTitle` and `SheetDescription` (Radix logs an accessibility warning without a description). Title is "Edit X" / "Create X".
- **Footer buttons**: right-aligned; `Cancel` (variant `outline`) then the primary submit button, in that order. Buttons are `w-full sm:w-auto` (stacked full-width on mobile). A destructive action (e.g. Delete on an edit form) goes on the far left: switch the footer to `sm:justify-between`.
- **Behavior**: this is a UI-shell convention only — keep form state, validation, and submit logic exactly as you would in any form. Disable buttons while saving; show "Saving..." on the primary button.

## Confirmations

Keep destructive confirmations as `AlertDialog` (or `Dialog` where already in place) — do not migrate them to `Sheet`. A slideout implies a workspace; a confirmation is a blocking question.

## Delete confirmations and toasts (as implemented in flight operations)

- Delete is a button on the card that opens an `AlertDialog`: title "Delete <tail>?", a description of what happens (here: removed from the board, record kept in the database, an admin can restore it), `Cancel`, and a destructive `Delete` action. Button and action wording match what actually happens; do not label a hard delete "Clear" or a soft delete "Remove permanently".
- Save results use toasts (`useToast`): a short title on success ("Flight created", "Flight updated", "Flight deleted"); on failure a `destructive` toast titled "Couldn't <verb> <thing>" with the error message as description. Handlers rethrow after toasting so the Sheet stays open with the user's input. Edit-concurrency conflicts are the exception: they use the conflict UI in the form, not a toast.
- Validation problems are inline text in the form, never `alert()`.

## Docs panel

- **What**: documentation opens in a slide-in panel on the LEFT (`components/docs/docs-panel.tsx`, mounted once in `navigation-wrapper.tsx`), so a user can read it while using a form. It is a plain `<aside data-docs-panel>`, not a Radix Dialog: no overlay, no focus trap, no scroll lock. From `lg` up it is 420px wide and the page shifts right; below `lg` it is full width above the form with a Back button.
- **State**: the URL is the source of truth: `?docs=<module>` plus `#<anchor>` (`lib/docs/docs-url.ts`, `providers/docs-provider.tsx`). `useDocs()` gives `openDocs(module, anchor?)` / `closeDocs()`; it keeps other query params and survives client navigation.
- **Help affordance**: every module gets a `HelpButton` (`components/docs/help-button.tsx`) in its toolbar or header, and next to fields that need explaining. `anchor` must be one of the module's `helpAnchors` in `lib/docs/registry.ts`. Docs link back with `module:<id>` and `doc:<module>/<slug>#anchor` links.
- **Forms**: a `Sheet` form that can be open next to the panel passes `modal={!docsOpen}` to `Sheet`, `overlay={!docsOpen}` to `SheetContent` (new prop, default `true`), and ignores outside interaction and Escape whose target is inside `[data-docs-panel]` (see `flight-form-dialog.tsx`). Modal exactly as before while docs are closed.
- **Same-PR rule**: any PR that changes a module's user-visible behavior updates `frontend/content/docs/<module>/` in the same PR; the reviewer checks the diff for it.

## Status (as of 2026-11-04)

Already `Sheet`: `equipment/equipment-form-dialog.tsx`, `fuel-dispatch/transaction-form-dialog.tsx`, `fuel-farm/tank-form-dialog.tsx`, `invoicing/fuel-ticket-sheet.tsx`, `parking/aircraft-sheet.tsx`, `roles/role-sheet.tsx`, `training/completion-sheet.tsx`, `training/course-form-sheet.tsx`, `users/user-sheet.tsx`, `flight-operations/flight-form-dialog.tsx` (the file keeps its old name but renders a `Sheet`), `fuel-dispatch/fueler-assign-dialog.tsx`, `invoicing/settle-invoice-dialog.tsx` (both renamed-in-place Sheets).

No remaining data-entry `Dialog`s are pending migration. Left as `Dialog` intentionally: `invoicing/invoice-detail-dialog.tsx` (read-only), `components/ui/command.tsx` (command palette), and the parking module's non-form UI (map, area panel, compass), which is not a data-entry form. The parking sheets (`aircraft-sheet.tsx`, `area-sheet.tsx`, `add-aircraft-sheet.tsx`) follow the Sheet rules above and use theme tokens only, so they render correctly in dark mode. The parking module is no longer frozen (B57).
