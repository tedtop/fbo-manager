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

## Status (as of 2026-07-04)

Already `Sheet` (verified by the Playwright E2E suite's `expectConventionalSheet`
assertion — which also checks the panel follows the active dark/light theme
(`frontend/e2e/support/ui.ts`) — except `parking/aircraft-sheet.tsx`, since the parking
module is excluded from E2E): `equipment/equipment-form-dialog.tsx`,
`flight-operations/flight-form-dialog.tsx`, `fuel-dispatch/transaction-form-dialog.tsx`,
`fuel-dispatch/fueler-assign-dialog.tsx`, `fuel-farm/tank-form-dialog.tsx`,
`invoicing/fuel-ticket-sheet.tsx`, `invoicing/settle-invoice-dialog.tsx`,
`parking/aircraft-sheet.tsx`, `roles/role-sheet.tsx`, `training/completion-sheet.tsx`,
`training/course-form-sheet.tsx`, `users/user-sheet.tsx`.

Left as `Dialog` intentionally: `invoicing/invoice-detail-dialog.tsx` (read-only),
`components/ui/command.tsx` (command palette), and the parking module generally (frozen —
audit-only, do not change UX per `.omc/specs/deep-interview-fbo-manager-modules.md`).

Note on theming: the `dark` class must live on `<html>` (`navigation-wrapper.tsx` maintains
it there). Sheets/dialogs/dropdowns portal to `<body>`, so scoping the theme class any lower
silently un-themes every overlay.
