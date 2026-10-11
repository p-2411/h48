// Duet's AI models. Tasks (lines/, explain/) are written once on top of a StructuredModel
// (structured.ts), and providers/ picks which provider serves them; voice/ is the same idea for
// speech. Nothing outside src/main/ai knows which provider is in use.
import { Explainer } from './explain'
import { Lines } from './lines'
import { createStructuredModel } from './providers'

export * from './lines'
export * from './explain'
export { ModelError } from './errors'

export type Models = { lines: Lines; explainer: Explainer }

/** All text models, on the provider chosen in the environment (see providers/index.ts). */
export function createModels(env: NodeJS.ProcessEnv = process.env): Models {
  const model = createStructuredModel(env)
  return { lines: new Lines(model), explainer: new Explainer(model) }
}
