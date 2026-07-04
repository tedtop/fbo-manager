// Standalone entry point for `pnpm e2e:seed` — Playwright's globalSetup also calls
// seedDevUsers() directly, this is just for seeding manually against a running local stack
// without spinning up a full Playwright run (e.g. to poke around at http://127.0.0.1:3100
// by hand with a working login).
import { DEV_USERS } from './env'
import { seedDevUsers } from './seed'

seedDevUsers()
  .then(() => {
    console.log(
      'Seeded dev users:',
      Object.values(DEV_USERS)
        .map((u) => u.email)
        .join(', ')
    )
  })
  .catch((err) => {
    console.error(err)
    process.exit(1)
  })
