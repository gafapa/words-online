// German: das/dass after verbs of saying and thinking, seit/seid, als/wie
// after comparatives and a few fixed spellings. Noun capitalization is left
// to the spelling dictionary.

import { patternRule, w, type Rule } from './util'

const INTRO =
  'glaube|glaubst|glaubt|glauben|glaubte|denke|denkst|denkt|denken|dachte|dachten|weiß|weißt|wissen|wusste|wussten|' +
  'hoffe|hoffst|hofft|hoffen|hoffte|meine|meinst|meint|meinen|finde|findest|findet|finden|fand|fanden|sagte|sagt|sagen|' +
  'behauptet|bedeutet|heißt|merke|merkt|bemerkte|erkannte|versprach|gesagt|sicher|klar|möglich|wichtig|schade|froh|stolz|gut'

const SUBJECT = 'ich|du|er|sie|es|wir|ihr|man|der|die|das|mein|meine|dein|deine|sein|seine|unser|unsere|kein|keine|jemand|niemand|alle|viele'

export const dasDass: Rule = {
  id: 'de-das-dass',
  langs: ['de'],
  category: 'confusion',
  kind: 'grammar',
  // Case-sensitive: "das Wissen, das er hat" is a relative clause.
  check: patternRule([{ re: w(`(${INTRO}), das (${SUBJECT})`, 'gu'), fix: (m) => [`${m[1]}, dass ${m[2]}`] }]),
}

export const seitSeid: Rule = {
  id: 'de-seit-seid',
  langs: ['de'],
  category: 'confusion',
  kind: 'grammar',
  check: patternRule([
    { re: w('ihr seit'), fix: () => ['ihr seid'] },
    {
      re: w('seid (einigen|langem|kurzem|gestern|heute|wann|jeher|damals|Jahren|Monaten|Wochen|Tagen|Stunden|dem|einem|einer|vielen|\\d+)'),
      fix: (m) => [`seit ${m[1]}`],
    },
  ]),
}

export const alsWie: Rule = {
  id: 'de-als-wie',
  langs: ['de'],
  category: 'grammar',
  kind: 'grammar',
  check: patternRule([
    {
      re: w('(größer|kleiner|besser|schneller|höher|älter|jünger|länger|kürzer|mehr|weniger|schöner|stärker|schwächer|schwerer|leichter|teurer|billiger|lieber|anders) wie'),
      fix: (m) => [`${m[1]} als`],
    },
  ]),
}

export const deSpelling: Rule = {
  id: 'de-fixed',
  langs: ['de'],
  category: 'confusion',
  kind: 'grammar',
  check: patternRule([
    { re: w('(das|der|die|dem|den) selbe(n?)'), fix: (m) => [`${m[1]}selbe${m[2]}`] },
    { re: w('Standart'), fix: () => ['Standard'] },
    { re: w('garnicht'), fix: () => ['gar nicht'] },
    { re: w('garkein(e|en|er|es|em)?'), fix: (m) => [`gar kein${m[1] ?? ''}`] },
  ]),
}

export const deRules: Rule[] = [dasDass, seitSeid, alsWie, deSpelling]
