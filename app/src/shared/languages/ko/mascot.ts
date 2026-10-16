// Everyday Korean phrases the mascot reacts to (renderer/src/components/duet/conversation.ts).
import type { MascotPhrases } from '../module'

export const mascot: MascotPhrases = {
  oops: /제가 잘못|제가 틀렸/,
  almost: /조금 틀|거의 다|아쉬워|더 자연스|정확히는/,
  sad: /슬퍼요|슬퍼|외로워|돌아가셨|안타까/,
  encourage: /포기하지|못하겠|어려워|모르겠어|괜찮아|힘내/,
  amazed: /정말 대단|대박|원어민 같/,
  proud: /많이 늘었|실력이 늘/,
  correct: /정답|잘했어요|완벽해요|훌륭해요|맞아요|좋아요/,
  confused: /이해하지 못|다시 말해|다시 설명/,
  shy: /귀여워|최고야|사랑해/,
  thanks: /고마워|감사합니다|감사해요/,
  laughing: /ㅋㅋ+|ㅎㅎ+|하하|너무 웃겨/,
  surprised: /놀랐|진짜[?？]|와[!！]/,
  determined: /다시 해볼|한 번 더|해볼게/,
  hello: /안녕/,
  joke: /농담|비밀/,
  giggle: /헤헤|히히/,
  understood: /^알겠|^아하/,
  agree: /^맞아요|^네[,.!]/,
  disagree: /^아니요|^아뇨/,
  curious: /궁금|어떻게 됐/,
  exercise: /번역|무슨 뜻|따라 해/
}
