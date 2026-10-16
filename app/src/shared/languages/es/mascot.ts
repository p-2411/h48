// Everyday Spanish phrases the mascot reacts to (renderer/src/components/duet/conversation.ts).
import type { MascotPhrases } from '../module'

export const mascot: MascotPhrases = {
  oops: /me equivoqu[eé]|perd[oó]n, quise decir/,
  almost:
    /casi(?:[,.!]| lo tienes| correcto)|muy cerca|peque[ñn]a correcci[oó]n|mejor decir|deber[ií]as? decir|deber[ií]a ser|cuidado con/,
  sad: /me siento (?:muy )?(?:triste|sol[oa])|estoy triste|lo siento mucho|lo siento por tu p[eé]rdida/,
  encourage:
    /no te rindas|no puedo (?:hacerlo|m[aá]s)|es (?:muy )?dif[ií]cil|no entiendo|t[oó]mate tu tiempo|sigue as[ií]|no te preocupes/,
  amazed: /incre[ií]ble|impresionante|progreso incre[ií]ble|como un nativo/,
  proud: /orgullos[oa] de ti|has mejorado|est[aá]s mejorando|lo lograste/,
  correct: /muy bien|bien hecho|es correcto|^¡?correcto|perfecto|excelente|exacto|genial|eso es/,
  confused: /no entend[ií]|puedes aclarar|puedes repetir/,
  shy: /eres (?:adorable|lind[oa]|el mejor)|te quiero/,
  thanks: /gracias|te lo agradezco/,
  laughing: /ja(?:ja)+|qu[eé] gracioso/,
  surprised: /qu[eé] sorpresa|¿en serio\?|de verdad\?|no sab[ií]a/,
  determined: /intent[eé]moslo|otra vez!|¡vamos|vamos!|voy a intentarlo/,
  hello: /^(?:hola|buenos d[ií]as|buenas|adi[oó]s|hasta luego|chao)\b/,
  joke: /es broma|un secreto/,
  giggle: /jeje|jiji/,
  understood: /^entiendo|^ya veo|^ah,? vale/,
  agree: /^(?:s[ií],|claro|por supuesto)\b/,
  disagree: /^no es as[ií]/,
  curious: /cu[eé]ntame m[aá]s|me pregunto/,
  exercise: /c[oó]mo se dice|qu[eé] significa|tradu/,
  negations: ['nunca']
}
