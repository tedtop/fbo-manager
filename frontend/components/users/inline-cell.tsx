'use client'

import { PhoneInput } from '@/components/users/phone-input'
import { Input } from '@/components/ui/input'
import type { InlineField, InlineValue, NameDraft } from '@/lib/user-inline-edit'
import { type ReactNode, useRef, useState } from 'react'

export type CellStatus = 'saving' | 'saved' | 'error'
export interface CellState {
  status: CellStatus
  message?: string
}

/** Where focus goes after a save: nowhere, the next editable cell, or the previous one. */
export type Nav = 'none' | 'next' | 'prev'

interface Props {
  userId: string
  field: InlineField
  label: string
  editing: boolean
  readOnly?: boolean
  /** What the cell shows when not editing. */
  display: ReactNode
  /** Draft the editor opens with. */
  initial: InlineValue
  state?: CellState
  onStart: () => void
  onCancel: () => void
  /** Returns an error message to keep the editor open, or null when the value was accepted. */
  onCommit: (value: InlineValue, nav: Nav) => string | null
}

const inputClass = 'h-8 px-2 text-sm'

/** B107: one spreadsheet-style cell. Click to edit; Enter or blur saves, Esc cancels, Tab saves and moves on. */
export function InlineCell(props: Props) {
  const { userId, field, label, editing, readOnly, display, state, onStart } = props
  const key = `${userId}:${field}`

  return (
    <div data-cell={key} className="min-w-0">
      {editing && !readOnly ? (
        <CellEditor {...props} />
      ) : (
        <div className="flex flex-col">
          {readOnly ? (
            <span>{display}</span>
          ) : (
            <button
              type="button"
              aria-label={`Edit ${label}`}
              onClick={onStart}
              className="-mx-1 min-h-6 w-full rounded px-1 text-left hover:bg-accent/50 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring cursor-text"
            >
              {display}
            </button>
          )}
          {state && (
            <span
              role={state.status === 'error' ? 'alert' : 'status'}
              data-cell-state={state.status}
              className={`text-xs ${state.status === 'error' ? 'text-destructive' : 'text-muted-foreground'}`}
            >
              {state.status === 'saving' ? 'Saving…' : state.status === 'saved' ? 'Saved' : state.message}
            </span>
          )}
        </div>
      )}
    </div>
  )
}

function CellEditor({ field, label, initial, onCancel, onCommit }: Props) {
  const [draft, setDraft] = useState<InlineValue>(initial)
  const [error, setError] = useState<string | null>(null)
  const done = useRef(false)
  const box = useRef<HTMLDivElement>(null)

  const commit = (nav: Nav) => {
    if (done.current) return
    const err = onCommit(draft, nav)
    if (err) setError(err)
    else done.current = true
  }
  const cancel = () => {
    done.current = true
    onCancel()
  }

  const onBlur = (e: React.FocusEvent) => {
    if (box.current?.contains(e.relatedTarget as Node | null)) return
    commit('none')
  }

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault()
      cancel()
    } else if (e.key === 'Enter') {
      e.preventDefault()
      commit('none')
    } else if (e.key === 'Tab') {
      const inputs = box.current?.querySelectorAll('input') ?? []
      const first = inputs[0]
      const last = inputs[inputs.length - 1]
      const target = e.target as Element
      // Inside the two-box name editor, Tab between the boxes is native; only the ends leave the cell.
      if (e.shiftKey ? target !== first : target !== last) return
      e.preventDefault()
      commit(e.shiftKey ? 'prev' : 'next')
    }
  }

  const aria = { 'aria-invalid': !!error, 'aria-label': label }
  const set = (v: string) => {
    setError(null)
    setDraft(v)
  }

  let editor: ReactNode
  if (field === 'name') {
    const d = draft as NameDraft
    const setName = (patch: Partial<NameDraft>) => {
      setError(null)
      setDraft({ ...d, ...patch })
    }
    editor = (
      <div className="flex gap-1">
        <Input
          autoFocus
          className={inputClass}
          aria-label="First name"
          placeholder="First"
          value={d.first}
          onChange={(e) => setName({ first: e.target.value })}
          onFocus={(e) => e.currentTarget.select()}
        />
        <Input
          className={inputClass}
          aria-label="Last name"
          placeholder="Last"
          value={d.last}
          onChange={(e) => setName({ last: e.target.value })}
        />
      </div>
    )
  } else if (field === 'phone') {
    editor = (
      <PhoneInput
        autoFocus
        className={inputClass}
        {...aria}
        value={draft as string}
        onValueChange={set}
        onFocus={(e) => e.currentTarget.select()}
      />
    )
  } else {
    editor = (
      <Input
        autoFocus
        className={inputClass}
        type={field === 'hire_date' ? 'date' : field === 'email' ? 'email' : 'text'}
        {...aria}
        value={draft as string}
        onChange={(e) => set(e.target.value)}
        onFocus={(e) => e.currentTarget.select?.()}
      />
    )
  }

  return (
    <div ref={box} onBlur={onBlur} onKeyDown={onKeyDown} className="flex flex-col gap-0.5">
      {editor}
      {error && (
        <span role="alert" className="text-xs text-destructive">
          {error}
        </span>
      )}
    </div>
  )
}
