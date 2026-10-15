// Progress's bridge (src/main/progress): how much of each video the learner understands, and its
// reading level. For the home base; the strip shows no scores.
import type { ProgressSummary } from '../shared/progress'
import type { Language } from '../shared/types'
import { invoke } from './invoke'

export const progressApi = {
  /** Each video's reading level and % now and then, and each level's averages, in `language`. */
  summary: (language: Language) => invoke<ProgressSummary>('progress:summary', language)
}
