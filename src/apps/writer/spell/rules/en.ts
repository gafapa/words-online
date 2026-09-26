// English: a few unambiguous confusions (Harper covers most of English grammar).

import { patternRule, w, type Rule } from './util'

export const enConfusions: Rule = {
  id: 'en-confusion',
  langs: ['en'],
  category: 'confusion',
  kind: 'grammar',
  check: patternRule([
    { re: w("(could|should|would|must|might)(n['’]t)? of"), fix: (m) => [`${m[1]}${m[2] ?? ''} have`] },
    { re: w('alot'), fix: () => ['a lot'] },
    { re: w('your welcome'), fix: () => ["you're welcome"] },
    { re: w('(more|less|better|worse|rather|other|bigger|smaller|greater|fewer) then'), fix: (m) => [`${m[1]} than`] },
  ]),
}

export const enRules: Rule[] = [enConfusions]
