This branch contains the Line Schedule UI page only for now (local React state, nothing connected to backend yet).

To run it on your laptop after cloning, make sure you have:

- :contentReference[oaicite:1]{index=1} (LTS recommended)
- :contentReference[oaicite:2]{index=2} installed globally

Then run these commands inside the project:

pnpm install
pnpm dev

The Line Schedule page currently lets you add employee shifts with job, date, and start/end time, and displays them on an interactive calendar with modals (still using local state only).