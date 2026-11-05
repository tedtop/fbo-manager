/**
 * cy.task is not retried by a following .should(), but a form's submit handler can return a beat before the row
 * lands. taskUntil re-runs the task until `check` stops throwing (or the timeout elapses, then the last failure is
 * thrown), so the spec's DB read is retry-able instead of one racy shot.
 */
export function taskUntil<T>(name: string, arg: unknown, check: (result: T) => void, timeoutMs = 10_000): Cypress.Chainable<T> {
  const deadline = Date.now() + timeoutMs
  const attempt = (): Cypress.Chainable<T> =>
    cy.task(name, arg, { log: false }).then((result) => {
      try {
        check(result as T)
        return cy.wrap(result as T, { log: false })
      } catch (err) {
        if (Date.now() > deadline) throw err
        return cy.wait(250, { log: false }).then(() => attempt())
      }
    })
  return attempt()
}
