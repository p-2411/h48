// The open data Duet is built on, and the credit each licence asks for. Settings → Sources shows
// them (a screen of its own, as JMdict's licence asks of an app). Add a dataset here when Duet ships
// one; scripts/build-dictionaries.mjs says which pack uses which.

export type Source = {
  name: string
  /** Who made it. */
  by: string
  /** What Duet uses it for. */
  use: string
  licence: string
  licenceUrl: string
  url: string
  /** Whether Duet's copy is changed from the original (CC BY-SA asks to say so). */
  changed?: string
  /** A notice the licence asks to be shown in full. */
  notice?: string
}

const CC_BY_SA = 'https://creativecommons.org/licenses/by-sa/4.0/'

export const SOURCES: Source[] = [
  {
    name: 'Wiktionary',
    by: 'Wiktionary’s contributors, extracted by kaikki.org (wiktextract, Tatu Ylonen)',
    use: 'Spanish and Korean dictionary entries: pronunciation, syllables, word type, gender, meanings, examples and related words; Japanese pronunciation and examples',
    licence: 'CC BY-SA 4.0 and GFDL',
    licenceUrl: 'https://en.wiktionary.org/wiki/Wiktionary:Copyrights',
    url: 'https://kaikki.org/dictionary/',
    changed:
      'Shortened to the most common words and the fields a card shows. Duet’s dictionary files keep this licence.'
  },
  {
    name: 'JMdict',
    by: 'Jim Breen and the Electronic Dictionary Research and Development Group',
    use: 'Japanese dictionary entries: words, kana readings, word types and meanings',
    licence: 'CC BY-SA 4.0 (EDRDG licence)',
    licenceUrl: 'https://www.edrdg.org/edrdg/licence.html',
    url: 'https://www.edrdg.org/wiki/index.php/JMdict-EDICT_Dictionary_Project',
    changed:
      'Shortened to the most common words and the fields a card shows. Duet’s Japanese dictionary file keeps this licence.'
  },
  {
    name: 'UniDic',
    by: 'The UniDic Consortium (version 2.1.2, through unidic-lite)',
    use: 'Japanese pitch accent',
    licence: 'BSD licence',
    licenceUrl: 'https://github.com/polm/unidic-lite/blob/master/LICENSE.unidic',
    url: 'https://clrd.ninjal.ac.jp/unidic/',
    changed: 'Only each word’s accent is kept.',
    notice: `Copyright (c) 2011-2017, The UniDic Consortium
All rights reserved.

Redistribution and use in source and binary forms, with or without modification, are permitted provided that the following conditions are met:

* Redistributions of source code must retain the above copyright notice, this list of conditions and the following disclaimer.

* Redistributions in binary form must reproduce the above copyright notice, this list of conditions and the following disclaimer in the documentation and/or other materials provided with the distribution.

* Neither the name of the UniDic Consortium nor the names of its contributors may be used to endorse or promote products derived from this software without specific prior written permission.

THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS" AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT OWNER OR CONTRIBUTORS BE LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.`
  },
  {
    name: 'wordfreq',
    by: 'Robyn Speer (data from OpenSubtitles, SUBTLEX, Wikipedia and other sources)',
    use: 'How common each word is: reading levels, and which words the dictionaries keep',
    licence: 'CC BY-SA 4.0',
    licenceUrl: CC_BY_SA,
    url: 'https://github.com/rspeer/wordfreq'
  }
]
