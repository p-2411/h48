// What the voice session is told when it starts, by what the conversation is about: a line (Explain,
// or the strip on a line) or nothing in particular (Talk, or the strip with no line). The rest of the
// tutor's instructions come from the main process (src/main/tutor/prompts.ts). Pure, for tests.

export type VoiceTopic = 'line' | 'free'

/** The greeting: what the model is told (instructions) and what it says it's doing (commentary). */
export function voiceGreeting(topic: VoiceTopic): { instructions: string; commentary: string } {
  const instructions =
    topic === 'line'
      ? 'The learner switched to voice to talk about the line in the context. If the conversation so far is empty, greet them briefly in English as Duet and ask whether they want to practise saying the line or talk about it; otherwise pick up where the conversation left off, in one short sentence, without repeating the explanation.'
      : 'The learner started a free conversation by voice, to practise speaking. If the conversation so far is empty, greet them briefly as Duet, in the language they are learning at their level, and ask a simple, friendly question to get them talking; otherwise pick up where the conversation left off, in one short sentence.'
  return {
    instructions: `${instructions} Do not search saved cards unless the learner opened them to Duet. Then pause and listen.`,
    commentary: 'Greet the learner briefly as Duet, or pick up the conversation where it left off.'
  }
}
