// Port of e2e/flight-edit.e2e.ts (Playwright): edit persists, status dropdown, soft delete, and the
// edit-concurrency conflict dialog (PR #43). One seeded departure-only flight per test so tests never
// interfere and tail text maps to exactly one card.
// KNOWN BUG tags pin today's behavior; each flips when the matching backlog item lands.
import type { Database } from '../../../types/database'

type FlightRow = Database['public']['Tables']['flight']['Row']

const stamp = Date.now().toString(36).toUpperCase()
const tailEdit = `CE1${stamp}`
const tailStatus = `CE2${stamp}`
const tailDelete = `CE3${stamp}`
const tailConflict = `CE4${stamp}`
const tailEditFail = `CE5${stamp}`
const tailStatusFail = `CE6${stamp}`
const tailCancel = `CE7${stamp}`
const tailDeparted = `CE8${stamp}`
const tailFuel = `CE9${stamp}`
const tailMenu = `CEA${stamp}`
const tails = [tailEdit, tailStatus, tailDelete, tailConflict, tailEditFail, tailStatusFail, tailCancel, tailDeparted, tailFuel, tailMenu]
const ids: Record<string, number> = {}

const card = (tail: string) => cy.contains('[data-slot="card"]', tail)

const openBoard = (tail: string) => {
  cy.login()
  cy.visit('/')
  cy.contains(tail, { timeout: 15_000 }).should('be.visible')
}

const openEditSheet = (tail: string) => {
  card(tail).contains('button', 'Edit').click()
  cy.contains('Edit Flight').should('be.visible')
}

describe('Flight edit, status change, delete', () => {
  before(() => {
    for (const tail of tails) {
      cy.task('seedFlight', { tail, departureInMin: 360, status: tail === tailDeparted ? 'departed' : 'scheduled' }).then((id) => {
        ids[tail] = id as number
      })
    }
  })

  after(() => {
    cy.task('cleanFlights', tails)
  })

  it('edit dialog persists changed fields to the DB', () => {
    cy.on('window:alert', (msg) => {
      throw new Error(`Unexpected alert: ${msg}`)
    })
    cy.task('getFlightByTail', tailEdit).then((before: FlightRow) => {
      openBoard(tailEdit)
      openEditSheet(tailEdit)

      // The form is pre-populated from the seeded row.
      cy.get('#origin').should('have.value', 'KAAA')
      cy.get('#destination').should('have.value', 'KBBB')

      cy.get('#origin').clear().type('KTEB')
      cy.get('#destination').clear().type('KASE')
      cy.get('#contactName').clear().type('Edited Contact')
      cy.get('#notes').clear().type('edited by cypress')
      cy.get('#hangar').click()
      cy.contains('button', 'Update Flight').click()
      cy.contains('Edit Flight').should('not.exist')
      cy.contains('[role="status"]', 'Flight updated').should('be.visible')

      cy.task('getFlightByTail', tailEdit).should((after: FlightRow) => {
        expect(after.origin).to.eq('KTEB')
        expect(after.destination).to.eq('KASE')
        expect(after.contact_name).to.eq('Edited Contact')
        expect(after.notes).to.eq('edited by cypress')
        expect(after.services).to.include('hangar')
        expect(after.flight_status).to.eq('scheduled')
        expect(after.deleted_at).to.eq(null)
        expect(after.modified_at).not.to.eq(before.modified_at)
      })
    })

    card(tailEdit).contains('KASE').should('be.visible')
    // B44 fixed: the card shows the saved notes and services straight away, no reload needed.
    card(tailEdit).contains('edited by cypress').should('be.visible')
    card(tailEdit).contains('Hangar').should('be.visible')
    cy.reload()
    card(tailEdit).contains('edited by cypress').should('be.visible')
  })

  // F3 fixed (B14): fuel_order_notes is a form field and survives an unrelated edit.
  it('fuel order notes entered in the form persist and survive an unrelated edit', () => {
    openBoard(tailFuel)
    openEditSheet(tailFuel)
    cy.get('#fuelOrderNotes').clear().type('Jet A 500 gal, top off')
    cy.contains('button', 'Update Flight').click()
    cy.contains('Edit Flight').should('not.exist')
    cy.task('getFlightByTail', tailFuel).should((row: FlightRow) => {
      expect(row.fuel_order_notes).to.eq('Jet A 500 gal, top off')
    })

    // Reload so the form is seeded from the stored row, then change something else.
    cy.reload()
    cy.contains(tailFuel, { timeout: 15_000 }).should('be.visible')
    openEditSheet(tailFuel)
    cy.get('#fuelOrderNotes').should('have.value', 'Jet A 500 gal, top off')
    cy.get('#origin').clear().type('KTEB')
    cy.contains('button', 'Update Flight').click()
    cy.contains('Edit Flight').should('not.exist')
    cy.task('getFlightByTail', tailFuel).should((row: FlightRow) => {
      expect(row.origin).to.eq('KTEB')
      expect(row.fuel_order_notes).to.eq('Jet A 500 gal, top off')
    })
  })

  // F3 fixed (B14): the DB has no en-route status, so the card offers only the real ones.
  it('status dropdown offers only real statuses', () => {
    openBoard(tailMenu)
    card(tailMenu).contains('Scheduled').click()
    cy.get('[role="menuitem"]').should('have.length', 5)
    cy.get('[role="menuitem"]').then(($items) => {
      expect([...$items].map((el) => el.textContent?.trim())).to.deep.eq(['Scheduled', 'Arrived', 'Departed', 'Delayed', 'Cancelled'])
    })
    cy.contains('[role="menuitem"]', 'En Route').should('not.exist')
  })

  it('status dropdown on the card persists the new status', () => {
    openBoard(tailStatus)
    card(tailStatus).contains('Scheduled').should('be.visible')
    card(tailStatus).contains('Scheduled').click()
    cy.contains('[role="menuitem"]', 'Delayed').click()

    cy.task('getFlightByTail', tailStatus).should((row: FlightRow) => {
      expect(row.flight_status).to.eq('delayed')
      expect(row.origin).to.eq('KAAA') // untouched fields survive a status-only update
      expect(row.deleted_at).to.eq(null)
    })
    card(tailStatus).contains('Delayed').should('be.visible')
    cy.contains('[role="status"]', 'Flight updated').should('be.visible')
    cy.reload()
    card(tailStatus).contains('Delayed').should('be.visible')
  })

  it('delete removes the card and soft-deletes the row', () => {
    openBoard(tailDelete)
    card(tailDelete).contains('button', 'Delete').click()
    cy.get('[role="alertdialog"]').should('contain.text', `Delete ${tailDelete}?`)
    cy.get('[role="alertdialog"]').contains('button', 'Delete').click()

    cy.contains(tailDelete).should('not.exist')
    // Not [role="status"]: the AlertDialog briefly hides the rest of the page from the a11y tree.
    cy.contains('Flight deleted').should('be.visible')
    cy.task('getFlightByTail', tailDelete).should((row: FlightRow) => {
      // Soft delete: the row is still there, just stamped.
      expect(row.id).to.eq(ids[tailDelete])
      expect(row.deleted_at).to.be.a('string')
    })
    cy.reload()
    cy.contains(tailConflict, { timeout: 15_000 }).should('exist')
    cy.contains(tailDelete).should('not.exist')
  })

  it('cancelling the delete confirmation leaves the card and the row untouched', () => {
    openBoard(tailCancel)
    card(tailCancel).contains('button', 'Delete').click()
    cy.get('[role="alertdialog"]').should('contain.text', `Delete ${tailCancel}?`)
    cy.get('[role="alertdialog"]').should('contain.text', 'removed from the board')
    cy.get('[role="alertdialog"]').contains('button', 'Cancel').click()
    cy.get('[role="alertdialog"]').should('not.exist')
    card(tailCancel).should('be.visible')
    cy.task('getFlightByTail', tailCancel).its('deleted_at').should('eq', null)
    cy.reload()
    card(tailCancel).should('be.visible')
  })

  it('a departed flight uses the same Delete wording and soft-deletes after confirming', () => {
    openBoard(tailDeparted)
    card(tailDeparted).contains('button', 'Clear').should('not.exist')
    card(tailDeparted).contains('button', 'Delete').click()
    cy.get('[role="alertdialog"]').should('contain.text', `Delete ${tailDeparted}?`)
    cy.get('[role="alertdialog"]').contains('button', 'Delete').click()
    cy.contains('Flight deleted').should('be.visible')
    cy.contains(tailDeparted).should('not.exist')
    cy.task('getFlightByTail', tailDeparted).should((row: FlightRow) => {
      expect(row.deleted_at).to.be.a('string')
    })
  })

  const failPatches = () =>
    cy.intercept({ method: 'PATCH', pathname: '/rest/v1/flight' }, {
      statusCode: 500,
      body: { code: 'XX000', message: 'forced cypress failure', details: null, hint: null }
    })

  it('failed edit shows an error toast, keeps the sheet open with the typed input, writes nothing', () => {
    cy.task('getFlightByTail', tailEditFail).then((before: FlightRow) => {
      openBoard(tailEditFail)
      openEditSheet(tailEditFail)
      failPatches()
      cy.get('#origin').clear().type('KFAIL')
      cy.contains('button', 'Update Flight').click()
      cy.contains('[role="status"]', "Couldn't update flight", { timeout: 10_000 })
        .should('contain.text', 'forced cypress failure')
      cy.contains('Edit Flight').should('be.visible')
      cy.get('#origin').should('have.value', 'KFAIL')
      cy.task('getFlightByTail', tailEditFail).should((after: FlightRow) => {
        expect(after.origin).to.eq('KAAA')
        expect(after.modified_at).to.eq(before.modified_at)
      })
    })
  })

  it('failed status change shows an error toast and the status is unchanged', () => {
    openBoard(tailStatusFail)
    failPatches()
    card(tailStatusFail).contains('Scheduled').click()
    cy.contains('[role="menuitem"]', 'Delayed').click()
    cy.contains('[role="status"]', "Couldn't update flight", { timeout: 10_000 })
      .should('contain.text', 'forced cypress failure')
    cy.task('getFlightByTail', tailStatusFail).should((row: FlightRow) => {
      expect(row.flight_status).to.eq('scheduled')
    })
  })

  it('edit conflict: row changed behind the dialog shows the conflict UI and keeps the other write', () => {
    cy.task('getFlightByTail', tailConflict).then((before: FlightRow) => {
      openBoard(tailConflict)
      openEditSheet(tailConflict)
      cy.get('#origin').should('have.value', 'KAAA')

      // Someone else saves the same row while our dialog is open (modified_at trigger bumps it).
      cy.task('touchFlight', { id: ids[tailConflict], notes: 'changed by someone else' })
      cy.task('getFlightByTail', tailConflict).then((bumped: FlightRow) => {
        expect(bumped.modified_at).not.to.eq(before.modified_at)

        cy.get('#origin').clear().type('KJFK')
        cy.contains('button', 'Update Flight').click()

        cy.get('[role="alertdialog"]', { timeout: 10_000 }).should('contain.text', 'Someone else saved changes to this record')
        cy.get('[role="alertdialog"]').contains('button', 'Overwrite anyway').should('be.visible')
        cy.get('[role="alertdialog"]').contains('button', 'Reload their changes').should('be.visible')

        // The compare-and-swap rejected our write: origin unchanged, the other write intact.
        cy.task('getFlightByTail', tailConflict).then((after: FlightRow) => {
          expect(after.origin).to.eq('KAAA')
          expect(after.notes).to.eq('changed by someone else')
          expect(after.modified_at).to.eq(bumped.modified_at)
        })

        // Reload their changes: form repopulates from the DB, our edit is discarded, nothing is written.
        cy.get('[role="alertdialog"]').contains('button', 'Reload their changes').click()
        cy.get('[role="alertdialog"]').should('not.exist')
        cy.get('#origin').should('have.value', 'KAAA')
        cy.get('#notes').should('have.value', 'changed by someone else')
        cy.task('getFlightByTail', tailConflict).its('modified_at').should('eq', bumped.modified_at)
      })
    })
  })

  it('edit conflict: Overwrite anyway saves our change over theirs', () => {
    // Re-seeds nothing: reuses the conflict flight, which now holds the other writer's notes.
    openBoard(tailConflict)
    openEditSheet(tailConflict)
    cy.task('touchFlight', { id: ids[tailConflict], notes: 'second concurrent write' })
    cy.get('#origin').clear().type('KJFK')
    cy.contains('button', 'Update Flight').click()
    cy.get('[role="alertdialog"]', { timeout: 10_000 }).contains('button', 'Overwrite anyway').click()
    cy.get('[role="alertdialog"]').should('not.exist')
    cy.task('getFlightByTail', tailConflict).should((row: FlightRow) => {
      expect(row.origin).to.eq('KJFK')
    })
  })
})
