// Each language's own font, for text marked as in it (lang="ja"): shared/languages, font. The
// stylesheet can't list them, as languages are added as folders.
import { LANGUAGE_CODES, languageModule } from '../../../shared/languages'

export function addLanguageFonts(): void {
  const rules = LANGUAGE_CODES.flatMap((code) => {
    const font = languageModule(code).font
    return font ? [`:lang(${code}) { font-family: ${font}, var(--sans); }`] : []
  })
  const style = document.createElement('style')
  style.textContent = rules.join('\n')
  document.head.append(style)
}
