// B41: the times hint replaces the old Transient / Hangar pull / Return buttons.
describe('Flight form times hint (B41)', () => {
  beforeEach(() => {
    cy.login()
    cy.visit('/')
    cy.contains('button', 'Add Flight').click()
    cy.contains('h2', 'Add New Flight').should('be.visible')
  })

  it('shows the hint and no preset buttons', () => {
    cy.get('[data-testid="form-times-hint"]').should('be.visible').and('contain.text', 'QT is ticked by default')
    cy.contains('button', 'Hangar pull').should('not.exist')
  })

  it('clearing the computed departure unticks QT so a return can be entered', () => {
    cy.get('#arrivalTime').type('10:00')
    cy.get('#departureTime').should('have.value', '11:00')
    cy.get('#departureTime').clear()
    cy.get('#quickTurn').should('have.attr', 'data-state', 'unchecked')
    cy.get('#departureTime').should('have.value', '')
  })
})
