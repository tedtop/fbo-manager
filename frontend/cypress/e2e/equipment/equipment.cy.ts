import { taskUntil } from '../../support/task-poll'

// Cypress spec: the equipment form's create and edit must really persist.
const stamp = Date.now().toString(36).toUpperCase()
const createId = `E2E-EQ-${stamp}`
const createName = `E2E Fuel Truck ${stamp}`
const editId = `E2E-EQ-EDIT-${stamp}`
const originalName = `E2E Original Name ${stamp}`
const updatedName = `E2E Updated Name ${stamp}`

describe('Equipment form: create and edit actually persist', () => {
  before(() => {
    cy.task('seedEquipment', { equipmentId: editId, name: originalName })
  })

  after(() => {
    cy.task('cleanEquipment', [createId, editId])
  })

  beforeEach(() => {
    cy.login()
  })

  it('Add Equipment form creates a real row in the database', () => {
    cy.visit('/equipment')
    cy.contains('button', 'Add Equipment').click()

    cy.get('#equipment_id').type(createId)
    cy.get('#equipment_name').type(createName)
    cy.get('#manufacturer').type('E2E Manufacturer')
    cy.get('#model').type('E2E Model')
    cy.get('[role="dialog"]').contains('button', 'Add Equipment').click()

    // The dialog closing on its own is the first signal the submit "succeeded" from the UI's point of view:
    // exactly where the known bug class hides (this can happen even if nothing was persisted).
    cy.get('[role="dialog"]').should('not.exist')

    // The only proof that matters: a real row exists in the database with this data (retried until it lands).
    taskUntil<{ equipment_name: string; manufacturer: string } | null>('getEquipmentById', createId, (row) => {
      expect(row, 'equipment row').to.not.eq(null)
      expect(row!.equipment_name).to.eq(createName)
      expect(row!.manufacturer).to.eq('E2E Manufacturer')
    })

    // And the UI list reflects the same row, not just a locally-optimistic one.
    cy.contains(createName).should('be.visible')
  })

  it('Editing equipment persists the change to the database', () => {
    cy.visit('/equipment')
    // Each card has its own "Edit" button (components/equipment/equipment-status-card.tsx); the name text itself
    // isn't clickable, so scope to the specific card by its distinguishing class.
    cy.contains('.border-l-4', originalName).contains('button', 'Edit').click()

    cy.get('#equipment_name').clear().type(updatedName)
    cy.contains('button', 'Save Changes').click()
    cy.get('[role="dialog"]').should('not.exist')

    taskUntil<{ equipment_name: string } | null>('getEquipmentById', editId, (row) => {
      expect(row, 'equipment row').to.not.eq(null)
      expect(row!.equipment_name).to.eq(updatedName)
    })
  })
})
