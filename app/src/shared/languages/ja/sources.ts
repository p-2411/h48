// Open data only Japanese uses (credited in Settings → Sources): JMdict for its dictionary, and
// UniDic for pitch accent (its dictionary.mjs says how each is used).
import type { Source } from '../../sources'

export const sources: Source[] = [
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
  }
]
