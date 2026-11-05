import './commands'

// Every spec file starts from the app defaults for the settings other specs read (tail prefix N, home airport KMSO).
// The local DB is shared and not reset between runs, so a spec that died mid-test would otherwise poison later ones.
before(() => {
  cy.task('resetAppSettings')
})
