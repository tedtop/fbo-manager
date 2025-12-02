'use client'

import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Pencil, Trash2, Briefcase } from 'lucide-react'
import {
  startOfWeek,
  endOfWeek,
  format,
  parseISO,
  isWithinInterval,
} from 'date-fns'

type Shift = {
  employee: string
  job: string
  date: string // yyyy-MM-dd
  start: string // HH:MM
  end: string   // HH:MM
}

const JOB_OPTIONS = [
  { name: 'Fueler', emoji: '⛽' },
  { name: 'Dispatcher', emoji: '🧾' },
  { name: 'Equipment', emoji: '🚧' },
  { name: 'Manager', emoji: '👔' },
  { name: 'Ground Ops', emoji: '👷‍♂️' },
]

function ExpandedShiftModal({
  day,
  shifts,
  onClose,
}: {
  day: string | null
  shifts: Shift[]
  onClose: () => void
}) {
  if (!day) return null
  const parsed = parseISO(day)
  const label = isNaN(parsed.getTime())
    ? day
    : format(parsed, 'EEEE, MMM d, yyyy')

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
        className="fixed inset-0 bg-black/80 backdrop-blur-xl flex items-center justify-center z-[999]"
      >
        <motion.div
          initial={{ scale: 0.8, y: 20 }}
          animate={{ scale: 1, y: 0 }}
          exit={{ scale: 0.8, y: 20 }}
          className="w-[90%] max-w-lg bg-[#1E293B] border border-white/10 p-5 rounded-2xl shadow-2xl"
          onClick={(e) => e.stopPropagation()}
        >
          <h3 className="text-xl font-bold mb-3 text-center">{label}</h3>
          <div className="space-y-3">
            {shifts.length === 0 && (
              <p className="text-sm opacity-60 text-center">
                No shifts this day.
              </p>
            )}
            {shifts.map((s, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                className="bg-black/40 border border-white/5 p-3 rounded-xl shadow"
              >
                <p className="text-sm font-semibold">{s.employee}</p>
                <p className="text-xs opacity-70">
                  {s.start} – {s.end}
                </p>
                <p className="text-xs flex items-center gap-1">
                  {JOB_OPTIONS.find((o) => o.name === s.job)?.emoji} {s.job}
                </p>
              </motion.div>
            ))}
          </div>

          <div className="mt-4">
            <button
              onClick={onClose}
              className="w-full bg-blue-600 hover:bg-blue-500 p-2 rounded-xl text-sm font-semibold shadow-lg transition active:scale-[0.97]"
            >
              Close
            </button>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  )
}

export default function LineSchedulePage() {
  const [shifts, setShifts] = useState<Shift[]>([])
  const [employee, setEmployee] = useState('')
  const [job, setJob] = useState('')
  const [date, setDate] = useState('')
  const [start, setStart] = useState('')
  const [end, setEnd] = useState('')
  const [editIndex, setEditIndex] = useState<number | null>(null)

  const [viewCalendar, setViewCalendar] = useState(false)
  const [currentMonth, setCurrentMonth] = useState<Date>(new Date())
  const [expandedDay, setExpandedDay] = useState<string | null>(null)

  const [showDeleteModal, setShowDeleteModal] = useState(false)
  const [pendingDeleteIndex, setPendingDeleteIndex] = useState<number | null>(null)

  const selectedDate = date || null

  const prevMonth = () =>
    setCurrentMonth(
      new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1, 1)
    )

  const nextMonth = () =>
    setCurrentMonth(
      new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 1)
    )

  const getShiftsForDate = (d: string | null) =>
    d ? shifts.filter((s) => s.date === d) : []

  const weekShiftCount = (baseDate: string | null) => {
    if (!baseDate) return 0
    const b = parseISO(baseDate)
    const startWeek = startOfWeek(b, { weekStartsOn: 0 })
    const endWeek = endOfWeek(b, { weekStartsOn: 0 })

    return shifts.filter((s) =>
      isWithinInterval(parseISO(s.date), { start: startWeek, end: endWeek })
    ).length
  }

  const totalShiftsThisWeek =
    viewCalendar && expandedDay
      ? weekShiftCount(expandedDay)
      : selectedDate
      ? weekShiftCount(selectedDate)
      : 0

  const requestDeleteShift = (index: number) => {
    setPendingDeleteIndex(index)
    setShowDeleteModal(true)
  }

  const confirmDeleteShift = () => {
    if (pendingDeleteIndex !== null) {
      setShifts((prev) => prev.filter((_, i) => i !== pendingDeleteIndex))
    }
    setShowDeleteModal(false)
    setPendingDeleteIndex(null)
    if (editIndex === pendingDeleteIndex) setEditIndex(null)
  }

  const cancelDeleteShift = () => {
    setShowDeleteModal(false)
    setPendingDeleteIndex(null)
  }

  const addShift = () => {
    if (!employee || !job || !selectedDate || !start || !end) return

    const newShift: Shift = { employee, job, date: selectedDate, start, end }

    if (editIndex !== null) {
      setShifts((prev) => prev.map((p, i) => (i === editIndex ? newShift : p)))
      setEditIndex(null)
    } else {
      setShifts((prev) => [...prev, newShift])
    }

    // ✅ Only reset other fields, keep date so weekly counter still works
    setEmployee('')
    setJob('')
    setStart('')
    setEnd('')
  }

  const editShift = (index: number) => {
    const s = shifts[index]
    setEmployee(s.employee)
    setJob(s.job)
    setDate(s.date)
    setStart(s.start)
    setEnd(s.end)
    setEditIndex(index)
  }

  const calendarDays = (() => {
    const first = new Date(currentMonth.getFullYear(), currentMonth.getMonth(), 1)
    const last = new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 0)

    const days: string[] = []
    for (let d = new Date(first); d <= last; d.setDate(d.getDate() + 1)) {
      days.push(format(d, 'yyyy-MM-dd'))
    }
    return days
  })()

  return (
    <div className="min-h-screen bg-gradient-to-b from-black via-[#0F172A] to-black text-[#E5E7EB] p-6 font-sans">

      {/* DELETE MODAL */}
      <AnimatePresence>
        {showDeleteModal && pendingDeleteIndex !== null && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={cancelDeleteShift}
            className="fixed inset-0 bg-black bg-opacity-70 flex items-center justify-center z-50"
          >
            <motion.div
              initial={{ scale: 0.9, y: 15 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.9, y: 15 }}
              className="w-80 backdrop-blur-lg bg-white/10 border border-white/20 p-5 rounded-2xl shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            >
              <h3 className="mb-2 text-lg font-semibold">Delete this shift?</h3>
              <p className="mb-4 text-sm opacity-75">
                Remove <strong>{shifts[pendingDeleteIndex].employee}</strong>'s shift?
              </p>
              <div className="grid grid-cols-2 gap-3">
                <button onClick={cancelDeleteShift} className="rounded-xl bg-neutral-800 p-2 text-sm">Cancel</button>
                <button onClick={confirmDeleteShift} className="rounded-xl bg-red-700 p-2 text-sm">Delete</button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* MAIN FORM CARD */}
      <div className="mx-auto max-w-3xl backdrop-blur-xl bg-white/5 border border-white/10 rounded-2xl p-5 shadow-2xl">
        <h2 className="text-2xl font-bold mb-3 flex items-center gap-2">
          <Briefcase size={22} /> Line Schedule
        </h2>

        <div className="grid grid-cols-2 md:grid-cols-5 gap-3 text-sm">
          <input
            placeholder="Employee Name"
            className="col-span-2 md:col-span-1 rounded-xl border border-neutral-600 bg-neutral-800/50 p-2 shadow"
            value={employee}
            onChange={(e) => setEmployee(e.target.value)}
          />

          <select
            className="col-span-2 md:col-span-1 rounded-xl border border-neutral-600 bg-neutral-800/50 p-2 shadow"
            value={job}
            onChange={(e) => setJob(e.target.value)}
          >
            <option value="">Job</option>
            {JOB_OPTIONS.map((opt) => (
              <option key={opt.name} value={opt.name}>
                {opt.emoji} {opt.name}
              </option>
            ))}
          </select>

          <input
            type="date"
            className="col-span-2 md:col-span-1 rounded-xl border border-neutral-600 bg-neutral-800/50 p-2 shadow"
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />

          <input
            type="time"
            value={start}
            onChange={(e) => setStart(e.target.value)}
            className="rounded-xl border border-neutral-600 bg-neutral-800/50 p-2 shadow"
          />

          <input
            type="time"
            value={end}
            onChange={(e) => setEnd(e.target.value)}
            className="rounded-xl border border-neutral-600 bg-neutral-800/50 p-2 shadow"
          />
        </div>

        <button
          onClick={addShift}
          className="mt-5 w-full bg-blue-600 hover:bg-blue-500 active:scale-[0.98] transition-all p-2 rounded-xl text-sm font-semibold shadow-lg flex justify-center items-center gap-2"
        >
          <Briefcase size={18} /> {editIndex !== null ? 'Save Shift' : 'Add Shift'}
        </button>

        {/* TOTAL FOR THE CURRENT CALENDAR WEEK */}
        <motion.div
          key={expandedDay ?? (selectedDate || '')}
          initial={{ opacity: 0, y: 5 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -5 }}
          className="mt-5 text-center text-sm"
        >
          <strong>Total shifts this week:</strong>{' '}
          <span className="text-blue-400">{totalShiftsThisWeek}</span>
        </motion.div>

        <div className="mt-5 flex flex-wrap justify-center gap-3 rounded-xl bg-black/50 border border-white/10 p-3 text-xs shadow backdrop-blur-md">
          {JOB_OPTIONS.map((opt) => (
            <div key={opt.name} className="flex items-center gap-1">
              {opt.emoji} {opt.name}
            </div>
          ))}
        </div>
      </div>

      {/* SHIFT LIST */}
      <div className="mx-auto mt-8 max-w-3xl backdrop-blur-lg bg-white/5 border border-white/10 rounded-2xl p-5 shadow-xl">
        <h3 className="text-lg font-semibold mb-4 text-center">Shifts</h3>
        <div className="space-y-3">
          {shifts.length === 0 ? (
            <p className="text-sm opacity-60 text-center">No shifts yet.</p>
          ) : (
            shifts.map((s, i) => (
              <motion.div
                key={i}
                className="bg-black/40 border border-white/5 p-4 rounded-xl shadow flex justify-between items-center"
              >
                <div>
                  <p className="text-sm font-semibold">{s.employee}</p>
                  <p className="text-xs flex items-center gap-1 opacity-80">
                    {JOB_OPTIONS.find((o) => o.name === s.job)?.emoji} {s.job}
                  </p>
                  <p className="text-[10px] opacity-60">{s.start} → {s.end}</p>
                  <p className="text-[10px] opacity-60">on {s.date}</p>
                </div>

                <div className="flex flex-col gap-2">
                  <button onClick={() => editShift(i)} className="p-2 bg-yellow-600 hover:bg-yellow-500 rounded-xl">
                    <Pencil size={14} />
                  </button>
                  <button onClick={() => requestDeleteShift(i)} className="p-2 bg-red-600 hover:bg-red-500 rounded-xl">
                    <Trash2 size={14} />
                  </button>
                </div>
              </motion.div>
            ))
          )}
        </div>
      </div>

      {/* CALENDAR VIEW */}
      <button
        onClick={() => setViewCalendar((v) => !v)}
        className="mx-auto mt-7 w-full max-w-3xl bg-blue-600 hover:bg-blue-500 active:scale-[0.98] transition-all p-2 rounded-xl text-sm font-semibold shadow-lg flex justify-center items-center gap-2"
      >
        🗓 {viewCalendar ? 'Hide Calendar' : 'View Calendar'}
      </button>

      <AnimatePresence>
        {viewCalendar && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="mt-6 max-w-6xl mx-auto backdrop-blur-lg bg-white/5 border border-white/10 rounded-2xl p-5 shadow-2xl"
          >
            <h3 className="text-xl font-bold mb-5 text-center text-blue-400">
              {format(currentMonth, 'MMMM yyyy')}
            </h3>

            <div className="mb-5 flex justify-center items-center gap-5">
              <button onClick={prevMonth} className="px-4 py-2 rounded-xl bg-neutral-800 shadow hover:scale-105 transition text-sm">◀ Prev</button>
              <button onClick={nextMonth} className="px-4 py-2 rounded-xl bg-neutral-800 shadow hover:scale-105 transition text-sm">Next ▶</button>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 lg:grid-cols-7 gap-3">
              {calendarDays.map((day) => (
                <motion.div
                  key={day}
                  onClick={() => {
                    setExpandedDay(day)
                    setDate(day) // ✅ also set form date when clicking cell
                  }}
                  whileHover={{ scale: 1.05 }}
                  className="bg-neutral-800/40 border border-white/10 rounded-xl p-3 shadow cursor-pointer"
                >
                  <div className="text-center">
                    <p className="text-sm font-semibold text-white/90">
                      {format(parseISO(day), 'd')}
                    </p>
                    <p className="text-[10px] opacity-65">
                      {format(parseISO(day), 'EEE')}
                    </p>
                  </div>

                  <div className="mt-2 space-y-1">
                    {getShiftsForDate(day).map((s, i2) => (
                      <div
                        key={i2}
                        className="text-[10px] bg-black/40 px-1 py-0.5 rounded-md border border-white/5 text-center"
                      >
                        {JOB_OPTIONS.find((o) => o.name === s.job)?.emoji} {s.start}-{s.end}
                      </div>
                    ))}
                  </div>
                </motion.div>
              ))}
            </div>
            {/* FIX: Removed the blank line between the closing </motion.div> and <ExpandedShiftModal> */}
            <ExpandedShiftModal
              day={expandedDay}
              shifts={getShiftsForDate(expandedDay)}
              onClose={() => setExpandedDay(null)}
            />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}