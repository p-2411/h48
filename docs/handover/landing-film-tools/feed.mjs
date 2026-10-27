// Feeds Sintel's Spanish subtitles (YouTube's own track, as Duet fetched it earlier) to the stand-in
// reader as on-screen captions: each line for a few seconds, then a gap. Loops.
import { appendFileSync } from 'fs'
const file = process.argv[2]
const LINES = [
  'Ha derramado mucha sangre inocente.',
  'Eres una tonta por viajar sola, sin ninguna preparación.',
  'Tienes suerte de que aún corra sangre por tus venas.',
  'Gracias.',
  'Entonces...',
  '¿Qué te trae a la tierra de los guardianes?',
  'Estoy buscando a alguien.',
  '¿Alguien muy querido? ¿Un alma gemela?',
  'Un dragón.',
  'He estado sola desde que tengo memoria.'
]
const say = (text) => appendFileSync(file, JSON.stringify({ type: 'caption', text, at: Date.now() }) + '\n')
const wait = (ms) => new Promise((r) => setTimeout(r, ms))
for (;;) for (const line of LINES) { say(line); await wait(4200); say(''); await wait(700) }
