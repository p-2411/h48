// Local only: the flashcards page's data from its own tour sample (home/flashcards/sample.ts).
import * as s from '../src/renderer/src/home/flashcards/sample'
declare const handlers: Record<string, (...args: unknown[]) => unknown>
const api = s.sampleApi() as unknown as Record<string, (...args: unknown[]) => unknown>
for (const k of Object.keys(api)) handlers['flashcards.' + k] = (...a) => api[k](...a)
handlers['flashcards.prefs'] = async () => ({ guideSeen: true, kindsSeen: ['understand', 'recall', 'say', 'use', 'type'] })
handlers['flashcards.setPrefs'] = async () => ({ guideSeen: true, kindsSeen: ['understand', 'recall', 'say', 'use', 'type'] })
handlers['flashcards.today'] = async () => s.sampleToday()
handlers['flashcards.collections'] = async () => s.sampleCollections()
handlers['flashcards.videos'] = async () => s.sampleVideos()
