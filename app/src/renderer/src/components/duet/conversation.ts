// Local, deterministic direction. No language assessment: explicit tutor feedback is the
// authority for corrections/praise; learner confidence is never treated as correctness.
import type { DuetGesture, DuetMood, DuetTone } from './engine'

export type AnimationTurn = {
  id: string
  role: 'learner' | 'tutor'
  text: string
  complete?: boolean
  context?: string
}
export type Reaction = {
  mood?: DuetMood
  gesture?: DuetGesture
  tone?: DuetTone
  priority: number
  /** How long before the same reaction may show again (default 4 s): frequent cues wait longer. */
  cooldown?: number
}
export type AnimationCue = Reaction & { id: number; until: number }
type Rule = Reaction & { role?: AnimationTurn['role']; pattern: RegExp }
// Ordered by priority: the first rule that matches a clause wins. Phrases cover how the tutor
// actually talks (English, with the taught languages' everyday words: es, ja, ko), not one wording.
const rules: Rule[] = [
  {
    mood: 'oops',
    priority: 8,
    role: 'tutor',
    pattern:
      /\b(my mistake|my bad|i was wrong|i got that wrong|sorry, i meant|let me correct myself)\b|me equivoqu[eé]|perd[oó]n, quise decir|私の間違い|間違えました|제가 잘못|제가 틀렸/iu
  },
  {
    mood: 'almost',
    tone: 'gentle',
    priority: 8,
    role: 'tutor',
    pattern:
      /\b(not quite|almost(?: right| there| had it)|so close|very close|small (?:correction|fix|mistake)|tiny (?:fix|mistake)|more natural (?:to say|would be)|we(?:['’]d| would) (?:usually )?say|it should be|careful with|try saying|one small thing|actually,? it['’]?s)\b|^almost[,.!]|casi(?:[,.!]| lo tienes| correcto)|muy cerca|peque[ñn]a correcci[oó]n|mejor decir|deber[ií]as? decir|deber[ií]a ser|cuidado con|惜しい|少し違|ちょっと違|正しくは|〜の方が自然|조금 틀|거의 다|아쉬워|더 자연스|정확히는/iu
  },
  {
    mood: 'sad',
    tone: 'gentle',
    priority: 7,
    pattern:
      /\b(i feel (?:really |so )?(?:sad|down|lonely)|i['’]?m (?:so |really )?sad|i lost my|passed away|sorry for your loss|that sounds (?:painful|hard|tough)|i['’]?m sorry to hear)\b|me siento (?:muy )?(?:triste|sol[oa])|estoy triste|lo siento mucho|lo siento por tu p[eé]rdida|悲しい|寂しい|亡くな|残念です|슬퍼요|슬퍼|외로워|돌아가셨|안타까/iu
  },
  {
    mood: 'encourage',
    tone: 'gentle',
    priority: 7,
    pattern:
      /\b(i can['’]?t do (?:this|it)|i give up|this is (?:so |really )?(?:hard|difficult)|it['’]?s (?:so |too )?(?:hard|difficult)|i['’]?m (?:so )?(?:bad at|confused)|i don['’]?t (?:get|understand)|you can do (?:this|it)|don['’]?t give up|take your time|no rush|keep going|you['’]?re getting there|don['’]?t worry)\b|no te rindas|no puedo (?:hacerlo|m[aá]s)|es (?:muy )?dif[ií]cil|no entiendo|t[oó]mate tu tiempo|sigue as[ií]|no te preocupes|諦め|できません|難しい|わかりません|大丈夫|頑張って|포기하지|못하겠|어려워|모르겠어|괜찮아|힘내/iu
  },
  {
    mood: 'amazed',
    tone: 'excited',
    priority: 6,
    role: 'tutor',
    pattern:
      /\b(that was (?:incredible|amazing|impressive)|absolutely brilliant|amazing progress|incredible|impressive|outstanding|blown away|like a native)\b|incre[ií]ble|impresionante|progreso incre[ií]ble|como un nativo|本当にすごい|すごすぎ|ネイティブみたい|정말 대단|대박|원어민 같/iu
  },
  {
    mood: 'proud',
    priority: 6,
    role: 'tutor',
    pattern:
      /\b(proud of you|you['’]?ve improved|you['’]?re improving|you did it|look how far|you['’]?ve come a long way|so much better)\b|orgullos[oa] de ti|has mejorado|est[aá]s mejorando|lo lograste|上達しました|上手になり|成長した|많이 늘었|실력이 늘/iu
  },
  {
    mood: 'correct',
    priority: 6,
    role: 'tutor',
    pattern:
      /\b(that['’]?s (?:right|correct|it|perfect)|well done|good job|great job|nice job|nicely done|you got it|you nailed it|exactly|perfect(?:ly said)?|excellent|spot on|nice one|good one|very good|bravo)\b|^(?:great|correct|right)[!.,]|muy bien|bien hecho|es correcto|^¡?correcto|perfecto|excelente|exacto|genial|eso es|正解|よくでき|完璧|上手|いいですね|その通り|정답|잘했어요|완벽해요|훌륭해요|맞아요|좋아요/iu
  },
  {
    mood: 'confused',
    priority: 5,
    role: 'tutor',
    pattern:
      /\b(i['’]?m not sure what you mean|could you clarify|i didn['’]?t (?:understand|catch that)|sorry, what|could you (?:say|repeat) that again|i didn['’]?t quite get)\b|no entend[ií]|puedes aclarar|puedes repetir|意味がわかりません|もう一度言って|もう一度説明|이해하지 못|다시 말해|다시 설명/iu
  },
  {
    mood: 'shy',
    priority: 5,
    role: 'learner',
    pattern:
      /\b(you['’]?re (?:so |really )?(?:cute|adorable|sweet|the best)|duet.{0,12}(?:cute|adorable|best)|i love you)\b|eres (?:adorable|lind[oa]|el mejor)|te quiero|かわいい|大好き|귀여워|최고야|사랑해/iu
  },
  {
    mood: 'adoring',
    priority: 4,
    pattern:
      /\b(thank(?:s| you)(?: so much)?|i appreciate (?:you|it)|you['’]?re so (?:kind|helpful)|that helps)\b|gracias|te lo agradezco|ありがとう|助かり|고마워|감사합니다|감사해요/iu,
    cooldown: 20_000
  },
  {
    mood: 'laughing',
    priority: 5,
    pattern:
      /\b(ha(?:ha)+|lol|lmao|that['’]?s (?:hilarious|so funny)|that made me laugh|so funny)\b|ja(?:ja)+|qu[eé] gracioso|笑(?!顔)|ｗｗ|(?<![a-z.])w{2,}(?![a-z.])|あはは|ㅋㅋ+|ㅎㅎ+|하하|너무 웃겨/iu
  },
  {
    mood: 'surprised',
    priority: 5,
    pattern:
      /\b(wow|whoa|no way|what a surprise|i didn['’]?t (?:expect|know) that)\b|\breally[?？]|^oh!|qu[eé] sorpresa|¿en serio\?|de verdad\?|no sab[ií]a|びっくり|本当に[?？]|えっ|へえ|놀랐|진짜[?？]|와[!！]/iu
  },
  {
    mood: 'determined',
    priority: 4,
    pattern:
      /\b(let['’]?s (?:try (?:it )?again|do (?:this|it)|go|practi[cs]e)|i['’]?ll (?:try again|practi[cs]e|keep trying)|one more time|again!)\b|intent[eé]moslo|otra vez!|¡vamos|vamos!|voy a intentarlo|もう一度|頑張ります|やってみ|다시 해볼|한 번 더|해볼게/iu
  },
  {
    gesture: 'wave',
    priority: 4,
    pattern:
      /^(?:hello|hi|hey|good (?:morning|evening|night)|goodbye|bye|see you|hola|buenos d[ií]as|buenas|adi[oó]s|hasta luego|chao)\b|こんにちは|おはよう|こんばんは|さようなら|またね|안녕/iu
  },
  {
    gesture: 'wink',
    priority: 4,
    role: 'tutor',
    pattern: /\b(just kidding|only joking|between you and me|little secret)\b|es broma|un secreto|冗談|秘密|농담|비밀/iu
  },
  { gesture: 'giggle', priority: 4, pattern: /\b(hehe|hihi|chuckle|teehee)\b|jeje|jiji|ふふ|へへ|헤헤|히히/iu },
  // The learner showing they understood: a pleased nod.
  {
    gesture: 'yes',
    priority: 3,
    role: 'learner',
    pattern: /^(?:i (?:get|got) it|i understand|i see|oh,? i see|makes sense|got it)\b|^entiendo|^ya veo|^ah,? vale|^わかった|^なるほど|^알겠|^아하/iu
  },
  {
    gesture: 'yes',
    priority: 3,
    role: 'tutor',
    pattern:
      /^(?:yes|yeah|yep|absolutely|of course|sure|i agree|right,|s[ií],|claro|por supuesto)\b|^その通り|^はい[、。！]|^そうです|^맞아요|^네[,.!]/iu
  },
  {
    gesture: 'no',
    priority: 3,
    role: 'tutor',
    pattern: /^(?:no,|nope|i disagree|not exactly|not really|no es as[ií])|^いいえ|^違います|^아니요|^아뇨/iu
  },
  // Wondering aloud or a learner's question: curious. A tutor's own questions are constant (it ends
  // most turns with one), so they only make Duet curious now and then, not every turn.
  {
    mood: 'curious',
    priority: 2,
    pattern: /\b(tell me more|i wonder|how come|what happened|and then)\b|cu[eé]ntame m[aá]s|me pregunto|教えて|どうして|궁금|어떻게 됐/iu
  },
  { mood: 'curious', priority: 2, role: 'learner', pattern: /[?？]$/u, cooldown: 12_000 },
  { mood: 'curious', priority: 2, role: 'tutor', pattern: /[?？]$/u, cooldown: 30_000 },
  // No emotion, but an exclaimed line is said with more energy (the excited speaking face).
  { tone: 'excited', priority: 1, role: 'tutor', pattern: /[!！]$|^¡/u, cooldown: 6_000 }
]

export function classifyReaction(turn: AnimationTurn): Reaction | undefined {
  // Ignore quoted examples and explicit translation/definition exercises, not just their keywords.
  const text = turn.text
    .replace(/“[^”]*”|「[^」]*」|『[^』]*』|"[^"]*"|(?<!\p{L})'[^'\n]+'|‘[^’]*’/gu, '')
    .trim()
  if (
    /\b(translate|translation|how do (?:you|i) say|what does .+ mean|the word|say after me|repeat after me)\b|c[oó]mo se dice|qu[eé] significa|tradu|翻訳|という意味|どう言|번역|무슨 뜻|따라 해/iu.test(
      `${turn.context ?? ''}\n${text}`
    )
  )
    return
  for (const { pattern, role, ...reaction } of rules) {
    if (role && role !== turn.role) continue
    const match = pattern.exec(text)
    if (!match) continue
    // Negation immediately before a positive phrase must not celebrate it. Negative phrases
    // such as "not quite" are complete rules themselves and are deliberately retained.
    const prefix = text.slice(Math.max(0, match.index - 28), match.index)
    if (
      /\b(?:not|never|isn['’]?t|wasn['’]?t|no|nunca)\s+(?:really\s+|actually\s+)?$/iu.test(prefix)
    )
      continue
    return reaction
  }
  return undefined
}

/** Streaming buffer: consume complete clauses once; flush an unpunctuated tail after a pause. */
export class ClauseBuffer {
  private id = ''
  private text = ''
  private consumed = 0
  private changed = 0
  reset(): void {
    this.id = ''
    this.text = ''
    this.consumed = 0
  }
  read(turn: AnimationTurn, now: number): AnimationTurn[] {
    if (turn.id !== this.id || !turn.text.startsWith(this.text)) {
      this.id = turn.id
      this.consumed = 0
      this.text = ''
      this.changed = now
    }
    if (this.text !== turn.text) {
      this.text = turn.text
      this.changed = now
    }
    const remaining = this.text.slice(this.consumed)
    const clauses: string[] = []
    let start = 0
    let quote = ''
    const closes: Record<string, string> = {
      '“': '”',
      '「': '」',
      '『': '』',
      '"': '"',
      '‘': '’',
      "'": "'"
    }
    for (let i = 0; i < remaining.length; i++) {
      const c = remaining[i]
      if (quote) {
        if (c === quote) quote = ''
        continue
      }
      if (closes[c] && !(c === "'" && /\p{L}/u.test(remaining[i - 1] ?? ''))) {
        quote = closes[c]
        continue
      }
      if (/[.!?。！？\n]/u.test(c)) {
        clauses.push(remaining.slice(start, i + 1))
        start = i + 1
      }
    }
    const length = clauses.join('').length
    this.consumed += length
    if (
      !quote &&
      (turn.complete || now - this.changed >= 600) &&
      this.consumed < this.text.length
    ) {
      clauses.push(this.text.slice(this.consumed))
      this.consumed = this.text.length
    }
    return clauses.map((text) => ({
      ...turn,
      context: turn.context,
      text: text.slice(-1200)
    }))
  }
}

/** One expiring cue, no queue. Time is injected so races/cooldowns can be tested without audio. */
export class ConversationDirector {
  cue: AnimationCue | undefined
  private sequence = 0
  private recent = new Map<string, number>()
  private buffer = new ClauseBuffer()
  private turn = ''
  private role: AnimationTurn['role'] | undefined
  private previous = ''
  private previousRole: AnimationTurn['role'] | undefined
  private currentText = ''
  private lastAttempt = ''
  reset(): void {
    this.cue = undefined
    this.recent.clear()
    this.buffer.reset()
    this.turn = ''
    this.role = undefined
    this.previous = ''
    this.previousRole = undefined
    this.currentText = ''
    this.lastAttempt = ''
  }
  interrupt(): void {
    this.cue = undefined
  }
  tick(now: number): void {
    if (this.cue && now >= this.cue.until) this.cue = undefined
  }
  offer(reaction: Reaction, now: number): void {
    this.tick(now)
    const key = `${reaction.mood ?? ''}:${reaction.gesture ?? ''}:${reaction.tone ?? ''}`
    if (now - (this.recent.get(key) ?? -Infinity) < (reaction.cooldown ?? 4000)) return
    if (this.cue && this.cue.priority >= reaction.priority) return
    this.recent.set(key, now)
    this.cue = { ...reaction, id: ++this.sequence, until: now + (reaction.mood ? 2400 : 1800) }
  }
  read(turn: AnimationTurn | undefined, now: number): void {
    this.tick(now)
    if (!turn) return
    if (turn.id !== this.turn) {
      if (turn.role === 'learner' && this.role === 'tutor') this.interrupt()
      // A learner's turn just ended: was it another go at the same phrase? Then Duet is determined
      // with them (any script; read from the transcript the app already has).
      if (this.role === 'learner') {
        const attempt = this.currentText.trim()
        if (this.lastAttempt && attempt.length >= 6 && similarity(attempt, this.lastAttempt) >= 0.6)
          this.offer({ mood: 'determined', priority: 4, cooldown: 15_000 }, now)
        this.lastAttempt = attempt
      }
      this.previous = this.currentText
      this.previousRole = this.role
      this.turn = turn.id
      this.role = turn.role
    }
    this.currentText = turn.text.slice(-1200)
    // A learner's request ("translate…") frames the tutor's answer; the tutor's own last turn doesn't.
    const context = this.previousRole === 'learner' ? this.previous.slice(-300) : ''
    for (const clause of this.buffer.read({ ...turn, context }, now)) {
      const reaction = classifyReaction(clause)
      if (reaction) this.offer(reaction, now)
    }
  }
}

/** RMS gate calibrated from quiet samples. A pause acknowledges a phrase, never background noise. */
export class ListeningActivity {
  private floor = 0.008
  private spoken = 0
  private quiet = 0
  private last = 0
  private cooldown = -Infinity
  private voiced = false
  private peak = 0
  private trough = Infinity
  reset(): void {
    this.spoken = 0
    this.quiet = 0
    this.last = 0
    this.voiced = false
    this.floor = 0.008
    this.cooldown = -Infinity
    this.peak = 0
    this.trough = Infinity
  }
  sample(rms: number, now: number): { started: boolean; backchannel: boolean } {
    const dt = this.last ? Math.min(50, now - this.last) : 0
    this.last = now
    const active = rms > Math.max(0.018, this.floor * 2.8)
    // Track steady ambient levels slowly even above the gate; speech has much larger modulation.
    this.floor += (rms - this.floor) * (active ? 0.004 : 0.05)
    let started = false
    if (active) {
      this.spoken += dt
      this.quiet = 0
      this.peak = Math.max(this.peak, rms)
      this.trough = Math.min(this.trough, rms)
      if (this.spoken >= 120 && !this.voiced && this.peak > this.trough * 1.25) {
        this.voiced = true
        started = true
      }
    } else this.quiet += dt
    let backchannel = false
    if (this.quiet >= 350) {
      backchannel = this.voiced && this.spoken >= 900 && now - this.cooldown >= 3000
      if (backchannel) this.cooldown = now
      this.spoken = 0
      this.voiced = false
      this.peak = 0
      this.trough = Infinity
    }
    return { started, backchannel }
  }
}

/**
 * How the learner sounds, read on-device from the microphone level the app already measures (no
 * audio leaves the computer, no API calls). Every threshold is relative to the learner's own
 * background noise and their own speaking loudness, so it adapts to the mic and the room. Each
 * signal is conservative: it shows only when the pattern is clear, and then not again for a while.
 *
 * - laughing: a run of short, evenly spaced bursts with near-silence between ("ha-ha-ha"). Speech
 *   syllables come at a similar rate but unevenly and without the deep dips.
 * - surprised: a sudden burst much louder than the learner's usual voice, out of a quiet moment.
 * - curious: the learner speaking animatedly (clearly louder than usual) for a while: Duet leans in.
 * - encourage: a halting turn (several pauses, little said), or a long silence after Duet asked.
 */
export class VoiceMood {
  private floor = 0.008
  private base = 0 // the learner's usual speaking loudness
  private heard = 0 // ms of speech the base is built on
  private last = 0
  private quiet = 0 // ms since the learner last spoke
  private loud = 0 // ms of animated speech
  private level = 0 // the voice now, smoothed over the dips between syllables
  private onset = -Infinity // when the current stretch of speech began
  // Laughter: the last few bursts' peak times, and whether the level dipped low before each.
  private env = 0
  private rising = false
  private dipped = true
  private burstPeak = 0
  private peaks: number[] = []
  // A halting turn: pauses inside one turn, and how much was said in it.
  private pauses = 0
  private said = 0
  private waitedFrom = -Infinity
  private recent = new Map<string, number>()

  reset(): void {
    this.floor = 0.008
    this.base = 0
    this.heard = 0
    this.last = 0
    this.quiet = 0
    this.loud = 0
    this.level = 0
    this.onset = -Infinity
    this.env = 0
    this.rising = false
    this.dipped = true
    this.burstPeak = 0
    this.peaks = []
    this.pauses = 0
    this.said = 0
    this.waitedFrom = -Infinity
  }

  /** Duet has just finished speaking and is waiting for the learner (for the long-silence signal). */
  waiting(now: number): void {
    this.waitedFrom = now
  }

  private once(key: string, cooldown: number, now: number, reaction: Reaction): Reaction | undefined {
    if (now - (this.recent.get(key) ?? -Infinity) < cooldown) return undefined
    this.recent.set(key, now)
    return reaction
  }

  sample(rms: number, now: number, listening: boolean): Reaction | undefined {
    const dt = this.last ? Math.min(50, now - this.last) : 0
    this.last = now
    const active = rms > Math.max(0.018, this.floor * 2.8)
    // The room's noise floor falls at once but rises only slowly, so the dips between syllables in a
    // long stretch of talking never drag it up into the learner's own voice; steady noise (a fan)
    // still raises it over a few seconds.
    this.floor += (rms - this.floor) * (rms < this.floor ? 0.1 : active ? 0.002 : 0.01)
    const established = this.heard >= 2000 && this.base > 0
    let reaction: Reaction | undefined

    if (active) {
      if (this.quiet >= 500 && this.quiet <= 2500 && this.said > 0) this.pauses++
      if (this.quiet > 2500) {
        // A new turn: forget the last one's pauses.
        this.pauses = 0
        this.said = 0
      }
      if (this.quiet >= 800) this.onset = now
      // Surprise: out of a quiet moment, much louder than the learner's usual voice, at once.
      if (established && now - this.onset < 300 && rms > this.base * 2.6)
        reaction = this.once('surprised', 15_000, now, { mood: 'surprised', priority: 3 })
      this.quiet = 0
      this.said += dt
      this.heard += dt
      // The learner's usual loudness adapts slowly, so getting animated doesn't count as usual at once.
      this.base = this.base ? this.base + (rms - this.base) * 0.008 : rms
      this.level += (rms - this.level) * 0.15
      this.waitedFrom = -Infinity
      // Animated: their voice (smoothed over the dips between syllables) clearly louder than usual
      // for over a second.
      this.loud = established && this.level > this.base * 1.5 ? this.loud + dt : Math.max(0, this.loud - dt)
      if (this.loud >= 1200) reaction ??= this.once('curious', 20_000, now, { mood: 'curious', priority: 2 })
    } else {
      this.quiet += dt
      this.level *= 0.9
      if (this.quiet > 400) this.loud = 0
    }

    // Laughter: count bursts (peaks after a deep dip), and look for an even, quick run of them.
    const previous = this.env
    this.env += (rms - this.env) * 0.5
    if (this.env < this.burstPeak * 0.35 || !active) this.dipped = true
    if (this.env > previous) this.rising = true
    else if (this.rising) {
      this.rising = false
      // (A burst's peak is known one sample late, often in the quiet after it: judge it by its own level.)
      if (this.dipped && previous > Math.max(0.03, this.floor * 4)) {
        this.peaks.push(now)
        this.burstPeak = previous
        this.dipped = false
      }
    }
    this.peaks = this.peaks.filter((t) => now - t <= 1800)
    if (this.peaks.length >= 5) {
      const gaps = this.peaks.slice(1).map((t, i) => t - this.peaks[i])
      const mean = gaps.reduce((a, b) => a + b, 0) / gaps.length
      const spread = Math.sqrt(gaps.reduce((a, b) => a + (b - mean) ** 2, 0) / gaps.length) / mean
      if (mean >= 130 && mean <= 330 && spread < 0.25) {
        reaction = this.once('laughing', 12_000, now, { mood: 'laughing', priority: 5 }) ?? reaction
        this.peaks = []
      }
    }

    if (listening) {
      // A halting turn: three or more pauses, and little said, then quiet.
      if (this.quiet >= 900 && this.pauses >= 3 && this.said < 4000) {
        reaction ??= this.once('halting', 25_000, now, { mood: 'encourage', tone: 'gentle', priority: 3 })
        this.pauses = 0
      }
      // A long silence after Duet asked something.
      if (Number.isFinite(this.waitedFrom) && now - this.waitedFrom >= 7000) {
        reaction ??= this.once('silence', 40_000, now, { mood: 'encourage', tone: 'gentle', priority: 2 })
        this.waitedFrom = -Infinity
      }
    }
    return reaction
  }
}

/** How alike two attempts are (0–1): letter pairs in common, so it works in any script. */
export function similarity(a: string, b: string): number {
  const clean = (s: string): string => s.toLowerCase().normalize('NFKC').replace(/[^\p{L}\p{N}]+/gu, '')
  const pairs = (s: string): string[] => Array.from({ length: Math.max(0, s.length - 1) }, (_, i) => s.slice(i, i + 2))
  const x = pairs(clean(a)), y = pairs(clean(b))
  if (!x.length || !y.length) return 0
  const pool = new Map<string, number>()
  for (const p of x) pool.set(p, (pool.get(p) ?? 0) + 1)
  let shared = 0
  for (const p of y) {
    const n = pool.get(p) ?? 0
    if (n > 0) { shared++; pool.set(p, n - 1) }
  }
  return (2 * shared) / (x.length + y.length)
}
