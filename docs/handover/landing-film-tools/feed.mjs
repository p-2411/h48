// Feeds Sintel's subtitles to the stand-in reader as on-screen captions: each line for a few seconds,
// then a gap. Loops.  node feed.mjs <file> [es|ko]
// Spanish is YouTube's own track, as Duet fetched it earlier; Korean is the same lines in Korean.
import { appendFileSync } from 'fs'
const file = process.argv[2]
const LINES = {
  es: [
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
  ],
  ko: [
    '무고한 피를 너무 많이 흘렸군.',
    '아무 준비도 없이 혼자 다니다니 어리석구나.',
    '아직 피가 돌고 있는 게 다행인 줄 알아라.',
    '고마워요.',
    '그래서...',
    '수호자들의 땅에는 무슨 일로 왔지?',
    '누군가를 찾고 있어요.',
    '아주 소중한 사람인가? 영혼의 짝?',
    '용이에요.',
    '기억나는 때부터 저는 혼자였어요.'
  ]
}[process.argv[3] || 'es']
const say = (text) => appendFileSync(file, JSON.stringify({ type: 'caption', text, at: Date.now() }) + '\n')
const wait = (ms) => new Promise((r) => setTimeout(r, ms))
for (;;) for (const line of LINES) { say(line); await wait(4200); say(''); await wait(700) }
