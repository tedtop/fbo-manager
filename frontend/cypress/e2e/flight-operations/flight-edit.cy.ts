// Port of e2e/flight-edit.e2e.ts (Playwright): edit persists, status dropdown, soft delete, and the
// edit-concurrency conflict dialog (PR #43). One seeded departure-only flight per test so tests never
// interfere and tail text maps to exactly one card.
// KNOWN BUG / NOT YET tags pin today's behavior; each flips when the matching backlog item lands.
import type { Database } from '../../../types/database'

type FlightRow = Database['public']['Tables']['flight']['Row']

const stamp = Date.now().toString(36).toUpperCase()
const tailEdit = `CE1${stamp}`
const tailStatus = `CE2${stamp}`
const tailDelete = `CE3${stamp}`
const tailConflict = `CE4${stamp}`
const tails = [tailEdit, tailStatus, tailDelete, tailConflict]
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
      cy.task('seedFlight', { tail, departureInMin: 360 }).then((id) => {
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
    // KNOWN BUG (new, reported with B08): FlightCard seeds localNotes/localServices from props with
    // useState once, so after an edit the card keeps the old notes/services until reload.
    // Flips to visible-without-reload once the card derives them from props.
    card(tailEdit).contains('edited by cypress').should('not.exist')
    cy.reload()
    card(tailEdit).contains('edited by cypress').should('be.visible')
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
    // NOT YET (B11): no success/error toast on status change.
    cy.reload()
    card(tailStatus).contains('Delayed').should('be.visible')
  })

  it('delete removes the card and soft-deletes the row', () => {
    openBoard(tailDelete)
    card(tailDelete).contains('button', 'Delete').click()
    cy.get('[role="alertdialog"]').should('contain.text', tailDelete)
    cy.get('[role="alertdialog"]').contains('button', 'Delete').click()

    cy.contains(tailDelete).should('not.exist')
    cy.task('getFlightByTail', tailDelete).should((row: FlightRow) => {
      // Soft delete: the row is still there, just stamped.
      expect(row.id).to.eq(ids[tailDelete])
      expect(row.deleted_at).to.be.a('string')
    })
    cy.reload()
    cy.contains(tailConflict, { timeout: 15_000 }).should('exist')
    cy.contains(tailDelete).should('not.exist')
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
