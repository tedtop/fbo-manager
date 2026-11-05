// Standalone entry point for `pnpm cypress:seed` — the Cypress `seedDevUsers` task calls
// seedDevUsers() directly, this is just for seeding manually against a running local stack
// without a Cypress run (e.g. to poke around the app by hand with a working login).
import { DEV_USERS } from './env'
import { seedDevUsers } from './seed'

seedDevUsers()
  .then(() => {
    console.log('Seeded dev users:', Object.values(DEV_USERS).map((u) => u.email).join(', '))
  })
  .catch((err) => {
    console.error(err)
    process.exit(1)
  })
