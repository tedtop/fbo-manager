// Cypress tasks for the Training spec (service role, local stack only: see ./env.ts).
import { createE2EDbClient } from './db'

export const trainingTasks = {
  /** The training_course row with this name and its completions (null when there is no such course). */
  async getTrainingCourse(name: string) {
    const db = createE2EDbClient()
    const { data, error } = await db.from('training_course').select('*, completions:training_completion(*)').eq('name', name).maybeSingle()
    if (error) throw new Error(`getTrainingCourse: ${error.message}`)
    return data
  },

  /** Another user's save: changes the course's instructions behind an open sheet (the updated_at trigger bumps the row). */
  async touchTrainingCourse({ name, instructions }: { name: string; instructions: string }) {
    const db = createE2EDbClient()
    const { error } = await db.from('training_course').update({ instructions }).eq('name', name)
    if (error) throw new Error(`touchTrainingCourse: ${error.message}`)
    return null
  },

  /** Inserts a one-year training course (service role) and returns its id. */
  async createTrainingCourse(name: string) {
    const db = createE2EDbClient()
    const { data, error } = await db.from('training_course').insert({ name, validity_amount: 1, validity_unit: 'years' }).select('id').single()
    if (error) throw new Error(`createTrainingCourse: ${error.message}`)
    return data.id as number
  },

  /** The profile (id and names) for this email, or null (B141: completion attribution comes from the profile). */
  async getProfileByEmail(email: string) {
    const db = createE2EDbClient()
    const { data, error } = await db.from('profiles').select('id, first_name, last_name').eq('email', email).maybeSingle()
    if (error) throw new Error(`getProfileByEmail: ${error.message}`)
    return data
  },

  /** Sets a profile's display name (the spec restores the original afterwards). */
  async setProfileName({ email, first, last }: { email: string; first: string; last: string }) {
    const db = createE2EDbClient()
    const { error } = await db.from('profiles').update({ first_name: first, last_name: last }).eq('email', email)
    if (error) throw new Error(`setProfileName: ${error.message}`)
    return null
  },

  /** Removes the courses with these names (their completions go with them). */
  async cleanTrainingCourses(names: string[]) {
    const db = createE2EDbClient()
    const { error } = await db.from('training_course').delete().in('name', names)
    if (error) throw new Error(`cleanTrainingCourses: ${error.message}`)
    return null
  }
}
