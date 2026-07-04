# Form UX questions for Ted

Running list of questions and observations from the form CRUD/testing/UX pass, saved up
for check-in rather than guessed at. Non-drastic improvements are applied directly as
each form is touched; anything here changes a field, workflow, or data model and needs
a decision first.

## Open questions

### 1. Missing standalone CRUD forms — intentional or a gap?

`aircraft`, `customers`, `products`, `fuelers`, and `certifications` each have a
working, tested repository layer (`frontend/repositories/*.repo.ts`) but **no dedicated
create/edit form component exists anywhere** in `frontend/components/`. Specifically:

- **Aircraft**: only created inline via `tail-number-autocomplete.tsx` when entering a
  flight (type a new tail number → prompted to add aircraft type). There's no page to
  browse/edit/delete the aircraft registry directly.
- **Customers** and **Products**: referenced throughout invoicing (`customers.repo.ts`,
  `products.repo.ts`, both tested) but no admin UI to manage the customer list or the
  product/service catalog (pricing, SKUs) was found.
- **Fuelers**: `fuelers.repo.ts` exists and is tested, but no fueler-specific
  create/edit form — training/certifications and fuel-dispatch assignment both
  reference fuelers, but there's no roster management screen.
- **Certifications**: same pattern — `certifications.repo.ts` tested, referenced by the
  training compliance matrix, but no standalone create/edit form for a certification
  record outside whatever the training module's completion flow covers.

**Question:** are these intentionally inline-only / managed elsewhere (e.g. fuelers are
really just `users` with a role, so there's no separate "fueler" entity to manage), or
are these genuine gaps that need a dedicated admin CRUD screen (customer directory,
product/pricing catalog, aircraft registry, fueler roster)?

### 2. Flight aircraft type is free-text

`flight-form-dialog.tsx`'s "Aircraft Type" field is a plain text input
(`placeholder="e.g., Boeing 737, Citation X"`) rather than a picker against a canonical
type list. Free text means the same aircraft type can end up spelled multiple
inconsistent ways across records over time. Worth a searchable combobox against a fixed
ICAO-type list (or the existing `aircraft` table's distinct values) instead — flagging
rather than changing since it touches how aircraft records get created/matched.

### 3. Fueler assignment has no search

`fueler-assign-dialog.tsx` lists every active fueler as a flat tap-to-toggle list with
no search/filter. Fine at current roster size; would need a search box if the fueler
list grows significantly. Not urgent, noting for later.

## Answered

_(none yet)_
