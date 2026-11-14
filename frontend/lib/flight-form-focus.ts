/**
 * The tail field of a new flight is disabled while the aircraft list loads. The sheet's auto-focus runs at open
 * time, finds it disabled and lands on the next control (Aircraft type), so a person (or test) typing right after
 * opening types into the wrong field. When the field turns enabled it takes the focus back, unless the person has
 * since moved into a text field of their own.
 */
export function shouldFocusTailOnEnable(
  wasDisabled: boolean,
  isDisabled: boolean,
  activeTag: string | undefined,
  activeIsEditable = false
): boolean {
  if (!wasDisabled || isDisabled) return false
  const tag = (activeTag ?? '').toUpperCase()
  return !(tag === 'INPUT' || tag === 'TEXTAREA' || activeIsEditable)
}
