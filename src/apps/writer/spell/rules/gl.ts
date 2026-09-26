// Galician: frequent Castilianisms with the forms of the RAG norm, and
// optional style advice.

import { patternRule, w, type Rule } from './util'

// Castilian form → Galician alternatives (Normas ortográficas e morfolóxicas, RAG).
const CASTELANISMOS: Record<string, string[]> = {
  entonces: ['entón'],
  luego: ['logo', 'despois'],
  después: ['despois'],
  siempre: ['sempre'],
  todavía: ['aínda'],
  ahora: ['agora'],
  mientras: ['mentres'],
  también: ['tamén'],
  aunque: ['aínda que', 'malia que'],
  cuando: ['cando'],
  donde: ['onde'],
  mucho: ['moito'],
  mucha: ['moita'],
  muchos: ['moitos'],
  muchas: ['moitas'],
  muy: ['moi'],
  pues: ['pois'],
  hoy: ['hoxe'],
  ayer: ['onte'],
  mañana: ['mañá'],
  gracias: ['grazas'],
  tampoco: ['tampouco'],
  además: ['ademais'],
  alrededor: ['arredor'],
  cualquier: ['calquera'],
  cualquiera: ['calquera'],
  lejos: ['lonxe'],
  abajo: ['abaixo'],
  debajo: ['debaixo'],
  hacia: ['cara a'],
  despacio: ['amodo', 'devagar'],
  tiempo: ['tempo'],
  ciudad: ['cidade'],
  pueblo: ['pobo', 'vila'],
  silla: ['cadeira'],
  lluvia: ['choiva'],
  hijo: ['fillo'],
  hija: ['filla'],
  hijos: ['fillos'],
  mujer: ['muller'],
  hombre: ['home'],
  ojo: ['ollo'],
  ojos: ['ollos'],
  jefe: ['xefe'],
  basura: ['lixo'],
  cuchillo: ['coitelo'],
  apellido: ['apelido'],
  cumpleaños: ['aniversario'],
  hermano: ['irmán'],
  hermana: ['irmá'],
  abuelo: ['avó'],
  abuela: ['avoa'],
  ventana: ['fiestra', 'xanela'],
  pájaro: ['paxaro'],
  perro: ['can'],
  rodilla: ['xeonllo'],
  oreja: ['orella'],
  hoja: ['folla'],
  rojo: ['vermello'],
  amarillo: ['amarelo'],
  naranja: ['laranxa'],
  manzana: ['mazá'],
  pequeño: ['pequeno'],
  mejor: ['mellor'],
  nuevo: ['novo'],
  nueva: ['nova'],
  viejo: ['vello'],
  vieja: ['vella'],
  bien: ['ben'],
}

const PHRASES: [string, string[]][] = [
  ['desde luego', ['desde logo', 'por suposto']],
  ['a lo mejor', ['se cadra', 'quizais']],
  ['sin embargo', ['porén', 'con todo', 'non obstante']],
  ['o sea', ['ou sexa']],
  ['por supuesto', ['por suposto']],
  ['a veces', ['ás veces']],
  ['de nuevo', ['de novo']],
  ['es decir', ['é dicir']],
  ['por eso', ['por iso']],
]

export const castelanismos: Rule = {
  id: 'gl-castelanismo',
  langs: ['gl'],
  category: 'lexicon',
  kind: 'spelling',
  check: patternRule([
    ...PHRASES.map(([phrase, fix]) => ({ re: w(phrase), fix: () => fix })),
    {
      re: w(Object.keys(CASTELANISMOS).join('|')),
      fix: (m: RegExpExecArray) => CASTELANISMOS[m[0].toLowerCase()],
      // Names ("Pueblo Nuevo") are written with capitals mid-sentence.
      unless: (m: RegExpExecArray, text: string) => {
        if (m[0][0] === m[0][0].toLowerCase()) return false
        const before = text.slice(0, m.index).trimEnd()
        return before !== '' && !/[.!?¿¡:"«“—–-]$/u.test(before)
      },
    },
    // "hasta" is a noun too ("a hasta da bandeira").
    {
      re: w('hasta'),
      fix: () => ['ata'],
      unless: (m: RegExpExecArray, text: string) => /(?:^|[^\p{L}])(?:a|as|unha|unhas|da|das|na|nas|esta|estas|esa|esas|súa|súas)\s+$/iu.test(text.slice(0, m.index)),
    },
  ]),
}

// "pero" is correct Galician; "mais" is often preferred in formal writing.
export const peroMais: Rule = {
  id: 'gl-pero-mais',
  langs: ['gl'],
  category: 'style',
  kind: 'style',
  optional: true,
  check: patternRule([{ re: w('pero'), fix: () => ['mais'], unless: (m, text) => /(?:^|[^\p{L}])(?:o|un|os|uns|do|dun)\s+$/iu.test(text.slice(0, m.index)) }]),
}

export const glRules: Rule[] = [castelanismos, peroMais]
