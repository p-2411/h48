// Spanish.
import { sampleEnglish, token as t, type LanguageModule } from './module'

export const es: LanguageModule = {
  name: 'Spanish',
  recognise: {
    kind: 'words',
    words: ['que', 'de', 'el', 'la', 'los', 'las', 'y', 'en', 'un', 'una', 'es', 'no', 'por', 'con', 'para', 'lo', 'se', 'me', 'te', 'mi', 'tu', 'qué', 'está', 'estoy', 'pero', 'como', 'muy', 'yo', 'eres', 'soy', 'del', 'al', 'más', 'sí', 'bien', 'aquí', 'ya', 'hay', 'tiene', 'tengo', 'ha', 'he', 'mucho', 'mucha', 'alguien', 'algo', 'nada', 'todo', 'este', 'esta', 'ese', 'esa', 'eso', 'su', 'sus', 'nos', 'le', 'les', 'cuando', 'donde', 'porque', 'también', 'ahora', 'vamos', 'puedo', 'quiero'],
    // ñ ¿ ¡ only Spanish uses (of the languages weighed); á í ó ú lean Spanish.
    marks: [
      { pattern: /[ñ¿¡]/giu, weight: 2 },
      { pattern: /[áíóú]/giu, weight: 1 }
    ]
  },
  sample: {
    translation: 'My sister bought a new car.',
    source: [t('Mi', 'p', 1), t('hermana', 'n', 2), t('compró', 'v', 3), t('un', 'g', 4), t('coche', 'n', 5), t('nuevo', 'a', 6, false), t('.', 'g', null)],
    english: sampleEnglish(1)
  },
  phrasing: '',
  tutor: {
    speech: [
      'Speak Spanish with clear, natural, neutral pronunciation. Keep its even syllable rhythm and pure vowels, tap or trill the r correctly, and stress the right syllable.'
    ],
    corrections: [
      'Gender and number agreement (el/la, -o/-a, plurals).',
      'Ser against estar, and por against para.',
      'Verb forms: the person and tense, preterite against imperfect, and the subjunctive where it is needed.'
    ]
  }
}
