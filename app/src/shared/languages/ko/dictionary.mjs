// Korean's dictionary pack (scripts/build-dictionaries.mjs runs this): English Wiktionary through
// kaikki.org (CC BY-SA 4.0 and GFDL), ranked by wordfreq's small Korean list, as the standard build
// does, with the list's stems counted for their verbs. Its raw data, beside the shared:
//   curl -LO https://kaikki.org/dictionary/Korean/kaikki.org-dictionary-Korean.jsonl.gz

export default async function build({ ranks, best, wiktionaryPack, writePack, versionOf, today }) {
  // wordfreq's Korean is split by MeCab: verbs and adjectives are stems (먹, not 먹다), and 하다
  // words are their noun (공부, not 공부하다).
  const rank = ranks('small_ko')
  // A particle or ending (-에서) is as common as its own text.
  const rankOf = (word) => {
    const key = word.replace(/^-/, '')
    return best(
      rank.get(key),
      key.endsWith('하다') ? rank.get(key.slice(0, -2)) : undefined,
      key.endsWith('다') ? rank.get(key.slice(0, -1)) : undefined
    )
  }
  // Words wordfreq doesn't list still count, after the listed ones: Korean's list is a small one.
  const unlisted = 1_000_000
  const pack = await wiktionaryPack('ko', 'Korean', (key) => rankOf(key) ?? unlisted + key.length)
  writePack('ko', versionOf('ko', today), pack.entries, pack.keys)
}
