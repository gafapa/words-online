// Test cases for the offline rules: each text must produce exactly the listed
// rule matches (rule id and first replacement, or '' when there is none).
// Run with `node scripts/test-spell.mjs`.

import type { Lang } from '../types'
import { runRules } from './index'

type Case = [Lang, string, [string, string][]]

const none: [string, string][] = []

export const CASES: Case[] = [
  // ---------- Common ----------
  ['en', 'This is is a test.', [['repeated-word', 'is']]],
  ['en', 'We had had enough of it.', none],
  ['fr', 'Nous nous levons tôt.', none],
  ['de', 'Die Frau, die die Zeitung liest, lacht.', none],
  ['es', 'La casa casa de mi madre.', [['repeated-word', 'casa']]],
  ['en', 'Two  spaces here.', [['double-space', ' ']]],
  ['en', 'Hello , world.', [['space-before-punctuation', ',']]],
  ['es', 'Hola ,mundo.', [['space-before-punctuation', ', mundo']]],
  ['en', 'Wait ... and see.', none],
  ['en', 'One,two and three.', [['missing-space-after-punctuation', ', two']]],
  ['en', 'The value is 3,5 or 1.5 in total.', none],
  ['en', 'It ended.Then we left.', [['missing-space-after-punctuation', '. Then']]],
  ['en', 'See e.g. the manual and www.example.com today.', none],
  ['es', 'Escríbeme a ana.garcia@example.com mañana.', none],
  ['en', 'this sentence starts in lowercase.', [['sentence-capital', 'This']]],
  ['en', 'It rained. then it stopped.', [['sentence-capital', 'Then']]],
  ['en', 'We met Mr. smith and Dr. jones at 5 p.m. yesterday.', none],
  ['es', 'Trajo lápices, gomas, etc. y cuadernos.', none],
  ['es', 'Vivió en EE.UU. durante años.', none],
  ['de', 'Das war z.B. gut, bzw. sehr gut.', none],
  ['en', 'iPhone sales grew.', none],
  ['en', 'Go to https://example.com/a,b now.', none],
  // ---------- Spanish ----------
  ['es', 'Haber si vienes mañana.', [['es-a-ver-haber', 'A ver si']]],
  ['es', 'Va haber una fiesta.', [['es-a-ver-haber', 'Va a haber']]],
  ['es', 'Tiene que haber alguien.', none],
  ['es', 'Puede haber quien no lo sepa.', none],
  ['es', 'Debe a ver sido él.', [['es-a-ver-haber', 'Debe haber']]],
  ['es', 'Vamos a ver la película.', none],
  ['es', 'El echo de que no vengas me duele.', [['es-echo-hecho', 'El hecho']]],
  ['es', 'Lo he echo yo.', [['es-echo-hecho', 'he hecho']]],
  ['es', 'Te hecho de menos.', [['es-echo-hecho', 'echo de menos']]],
  ['es', 'Me echo a dormir.', none],
  ['es', 'Espero que no halla sido nada.', [['es-halla-haya', 'haya sido']]],
  ['es', 'Se halla en el centro.', none],
  ['es', 'No es rojo, sino azul.', none],
  ['es', 'Sino vienes, me enfado.', [['es-sino-si-no', 'Si no vienes']]],
  ['es', 'No solo canta, si no que baila.', [['es-sino-si-no', 'sino que']]],
  ['es', 'Ahí que estudiar más.', [['es-ahi-hay', 'Hay que estudiar']]],
  ['es', 'Ahí está tu libro.', none],
  ['es', 'Lo dejé por hay.', [['es-ahi-hay', 'por ahí']]],
  ['es', 'Hoy a sido un buen día.', [['es-a-ha', 'ha sido']]],
  ['es', 'Pasó a estado líquido.', none],
  ['es', '¿Porque no vienes?', [['es-por-que', '¿Por qué']]],
  ['es', 'No vino porque llovía.', none],
  ['es', 'Pienso de que tienes razón.', [['es-dequeismo', 'Pienso que']]],
  ['es', 'Me acuerdo de que llovía.', none],
  ['es', 'Osea, no lo sé.', [['es-joined', 'O sea']]],
  ['es', 'Me gusta sobretodo el mar.', [['es-joined', 'sobre todo']]],
  ['es', 'Llevaba un sobretodo gris.', none],
  ['es', '¿Dónde fuistes ayer?', [['es-preterite-s', 'fuiste']]],
  ['es', 'Estamos tristes hoy.', none],
  ['es', 'Qué hora es?', [['es-question-exclamation', '¿Qué hora es?']]],
  ['es', 'Hola, ¿qué tal? ¡Muy bien!', none],
  ['es', '¡¿Qué dices?!', none],
  ['es', '¿Qué dices. Nada.', [['es-question-exclamation', '']]],
  ['es', 'Hola!', [['es-question-exclamation', '¡Hola!']]],
  ['es', 'Vendrá mañana (?) según dijo.', none],
  ['es', '¡Qué bien, ¿no?', [['es-question-exclamation', '']]],
  // ---------- Galician ----------
  ['gl', 'Entonces fomos á praia.', [['gl-castelanismo', 'Entón']]],
  ['gl', 'Estou muy contento.', [['gl-castelanismo', 'moi']]],
  ['gl', 'Desde luego que si.', [['gl-castelanismo', 'Desde logo']]],
  ['gl', 'Esperamos hasta mañá.', [['gl-castelanismo', 'ata']]],
  ['gl', 'Levantaron a hasta da bandeira.', none],
  ['gl', 'Chamábase Pueblo Nuevo.', none],
  ['gl', 'Quero ir, pero non podo.', none],
  ['gl', 'Que hora é?', none],
  ['gl', '¿Que hora é.', [['es-question-exclamation', '']]],
  ['gl', 'Entón fomos á praia e despois comemos.', none],
  // ---------- French ----------
  ['fr', 'Vraiment? Oui!', [['fr-nbsp', ' ?'], ['fr-nbsp', ' !']]],
  ['fr', 'Vraiment ? Oui !', [['fr-nbsp', ' ?'], ['fr-nbsp', ' !']]],
  ['fr', 'Vraiment ? Oui ! Il dit : bonjour.', none],
  ['fr', 'Rendez-vous à 10:30 sur https://exemple.fr.', none],
  ['fr', 'Il dit «bonjour».', [['fr-nbsp', '« '], ['fr-nbsp', ' »']]],
  ['fr', 'Il y à du monde.', [['fr-confusion', 'Il y a']]],
  ['fr', 'Elle à faim.', [['fr-confusion', 'Elle a']]],
  ['fr', 'Il a mal a partir de midi.', [['fr-confusion', 'à partir de']]],
  ['fr', 'Il a mal à la tête.', none],
  ['fr', 'Sa va bien.', [['fr-confusion', 'Ça va']]],
  ['fr', 'Je fais comme sa.', [['fr-confusion', 'comme ça']]],
  ['fr', 'Elle aime sa maison.', none],
  ['fr', 'Je vois ça mère.', [['fr-confusion', 'sa mère']]],
  ['fr', 'Je viens quelque fois.', [['fr-confusion', 'quelquefois']]],
  ['fr', 'On a pas le temps.', [['fr-confusion', "On n'a pas"]]],
  ['fr', 'On a plus de temps.', none],
  ['fr', 'Si il pleut, on reste.', [['fr-confusion', "S'il"]]],
  ['fr', 'Ils on raison.', [['fr-confusion', 'Ils ont']]],
  ['fr', 'Je leurs ai dit.', [['fr-confusion', 'Je leur']]],
  ['fr', 'Grâce a toi.', [['fr-confusion', 'Grâce à']]],
  ['fr', 'La grâce a touché le public.', none],
  // ---------- German ----------
  ['de', 'Ich glaube, das er kommt.', [['de-das-dass', 'glaube, dass er']]],
  ['de', 'Das Wissen, das er hat, ist groß.', none],
  ['de', 'Das Buch, das er liest, ist gut.', none],
  ['de', 'Ich finde, das ist gut.', none],
  ['de', 'Ihr seit spät.', [['de-seit-seid', 'Ihr seid']]],
  ['de', 'Ich warte seid gestern.', [['de-seit-seid', 'seit gestern']]],
  ['de', 'Seid ruhig!', none],
  ['de', 'Er ist größer wie ich.', [['de-als-wie', 'größer als']]],
  ['de', 'Er ist so groß wie ich.', none],
  ['de', 'Das ist das selbe Auto.', [['de-fixed', 'dasselbe']]],
  // ---------- English ----------
  ['en', 'You should of told me.', [['en-confusion', 'should have']]],
  ['en', 'It is bigger then that.', [['en-confusion', 'bigger than']]],
  ['en', 'We ate, and then we slept.', none],
]

// Returns a description of every failing case.
export function runTests(): string[] {
  const failures: string[] = []
  for (const [lang, text, expected] of CASES) {
    const got = runRules({ text, lang }).map((i) => [i.rule, i.replacements[0] ?? ''])
    const a = JSON.stringify(got)
    const b = JSON.stringify(expected)
    if (a !== b) failures.push(`[${lang}] ${JSON.stringify(text)}\n    expected ${b}\n    got      ${a}`)
  }
  return failures
}
