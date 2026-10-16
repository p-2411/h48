// Everyday Japanese phrases the mascot reacts to (renderer/src/components/duet/conversation.ts).
import type { MascotPhrases } from '../module'

export const mascot: MascotPhrases = {
  oops: /私の間違い|間違えました/,
  almost: /惜しい|少し違|ちょっと違|正しくは|〜の方が自然/,
  sad: /悲しい|寂しい|亡くな|残念です/,
  encourage: /諦め|できません|難しい|わかりません|大丈夫|頑張って/,
  amazed: /本当にすごい|すごすぎ|ネイティブみたい/,
  proud: /上達しました|上手になり|成長した/,
  correct: /正解|よくでき|完璧|上手|いいですね|その通り/,
  confused: /意味がわかりません|もう一度言って|もう一度説明/,
  shy: /かわいい|大好き/,
  thanks: /ありがとう|助かり/,
  // 笑 and www are Japanese laughter online (笑顔 is a smile, not a laugh).
  laughing: /笑(?!顔)|ｗｗ|(?<![a-z.])w{2,}(?![a-z.])|あはは/,
  surprised: /びっくり|本当に[?？]|えっ|へえ/,
  determined: /もう一度|頑張ります|やってみ/,
  hello: /こんにちは|おはよう|こんばんは|さようなら|またね/,
  joke: /冗談|秘密/,
  giggle: /ふふ|へへ/,
  understood: /^わかった|^なるほど/,
  agree: /^その通り|^はい[、。！]|^そうです/,
  disagree: /^いいえ|^違います/,
  curious: /教えて|どうして/,
  exercise: /翻訳|という意味|どう言/
}
