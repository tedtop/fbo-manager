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

  /** Removes the courses with these names (their completions go with them). */
  async cleanTrainingCourses(names: string[]) {
    const db = createE2EDbClient()
    const { error } = await db.from('training_course').delete().in('name', names)
    if (error) throw new Error(`cleanTrainingCourses: ${error.message}`)
    return null
  }
}
