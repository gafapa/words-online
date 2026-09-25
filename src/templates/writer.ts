// Word processor templates, written as HTML and opened through the writer's
// HTML import (same schema: paragraph styles, tables, cell colors, lists).

import { appInfo } from '../apps/registry'
import { pick, type Lang } from './types'

type Builder = (lang: Lang) => string

// ---------- HTML helpers ----------

const HEAD_BG = '#dbe7f7'
const SIDE_BG = '#f1f3f4'

const styled = (style: string) => (s: string, align?: 'center') => `<p data-style="${style}"${align ? ` style="text-align: ${align}"` : ''}>${s}</p>`
const title = styled('title')
const subtitle = styled('subtitle')
const h1 = (s: string) => `<h1>${s}</h1>`
const h2 = (s: string) => `<h2>${s}</h2>`
const p = (s = '', align?: 'center' | 'right' | 'justify') => `<p${align ? ` style="text-align: ${align}"` : ''}>${s}</p>`
const b = (s: string) => `<strong>${s}</strong>`
// Guidance for the teacher, meant to be replaced.
const hint = (s: string) => `<em><span style="color: #5f6368">[${s}]</span></em>`
const ul = (items: string[]) => `<ul>${items.map((i) => `<li><p>${i}</p></li>`).join('')}</ul>`
const ol = (items: string[]) => `<ol>${items.map((i) => `<li><p>${i}</p></li>`).join('')}</ol>`
const tasks = (items: string[]) =>
  `<ul data-type="taskList">${items.map((i) => `<li data-type="taskItem" data-checked="false"><p>${i}</p></li>`).join('')}</ul>`
const pageBreak = '<div data-page-break></div>'
const blank = (n = 40) => '_'.repeat(n)

interface TableOptions {
  // First row is a header row.
  head?: boolean
  // First column is a label column.
  side?: boolean
  // Column widths in pixels (the A4 text width is about 600px).
  widths?: number[]
}

function table(rows: string[][], { head = true, side = false, widths }: TableOptions = {}): string {
  const body = rows
    .map((row, r) => {
      const cells = row.map((text, c) => {
        const isHead = head && r === 0
        const tag = isHead ? 'th' : 'td'
        const bg = isHead ? HEAD_BG : side && c === 0 ? SIDE_BG : ''
        const attrs = [bg && `data-bg="${bg}"`, widths?.[c] && `colwidth="${widths[c]}"`].filter(Boolean).join(' ')
        return `<${tag}${attrs ? ' ' + attrs : ''}><p>${side && c === 0 && !isHead ? b(text) : text}</p></${tag}>`
      })
      return `<tr>${cells.join('')}</tr>`
    })
    .join('')
  return `<table><tbody>${body}</tbody></table>`
}

// ---------- Templates ----------

const learningSituation: Builder = (lang) => {
  const L = pick(lang)
  return [
    title(L('Situación de aprendizaje: ', 'Situación de aprendizaxe: ') + hint(L('título', 'título'))),
    subtitle(L('Programación de aula conforme a la LOMLOE', 'Programación de aula conforme á LOMLOE')),
    h1(L('1. Identificación', '1. Identificación')),
    table(
      [
        [L('Centro educativo', 'Centro educativo'), hint(L('nombre del centro', 'nome do centro'))],
        [L('Etapa y curso', 'Etapa e curso'), hint(L('p. ej., 2.º ESO', 'p. ex., 2.º ESO'))],
        [L('Materia / Área / Ámbito', 'Materia / Área / Ámbito'), ''],
        [L('Temporalización', 'Temporalización'), hint(L('n.º de sesiones, trimestre y fechas', 'n.º de sesións, trimestre e datas'))],
        [L('Docente(s)', 'Docente(s)'), ''],
        [L('Vinculación con los ODS y retos del siglo XXI', 'Vinculación cos ODS e retos do século XXI'), ''],
        [L('Producto final', 'Produto final'), hint(L('qué elaborará el alumnado', 'que elaborará o alumnado'))],
      ],
      { head: false, side: true, widths: [200, 400] },
    ),
    h1(L('2. Justificación y descripción', '2. Xustificación e descrición')),
    p(
      hint(
        L(
          'Contexto real o significativo en el que se sitúa el reto, problema o pregunta que da sentido a la situación de aprendizaje, finalidad y relación con los intereses del alumnado.',
          'Contexto real ou significativo no que se sitúa o reto, problema ou pregunta que dá sentido á situación de aprendizaxe, finalidade e relación cos intereses do alumnado.',
        ),
      ),
    ),
    p(''),
    h1(L('3. Competencias específicas', '3. Competencias específicas')),
    table(
      [
        [L('Competencia específica', 'Competencia específica'), L('Descripción', 'Descrición'), L('Descriptores del perfil de salida', 'Descritores do perfil de saída')],
        ['CE1', '', hint('CCL1, STEM2, CD1…')],
        ['CE2', '', ''],
        ['CE3', '', ''],
      ],
      { widths: [120, 300, 180] },
    ),
    p(
      L(
        'Competencias clave: comunicación lingüística (CCL), plurilingüe (CP), matemática y en ciencia, tecnología e ingeniería (STEM), digital (CD), personal, social y de aprender a aprender (CPSAA), ciudadana (CC), emprendedora (CE) y en conciencia y expresión culturales (CCEC).',
        'Competencias clave: comunicación lingüística (CCL), plurilingüe (CP), matemática e en ciencia, tecnoloxía e enxeñaría (STEM), dixital (CD), persoal, social e de aprender a aprender (CPSAA), cidadá (CC), emprendedora (CE) e en conciencia e expresión culturais (CCEC).',
      ),
    ),
    h1(L('4. Criterios de evaluación', '4. Criterios de avaliación')),
    table(
      [
        [L('Criterio de evaluación', 'Criterio de avaliación'), L('Competencia específica', 'Competencia específica'), L('Instrumento de evaluación', 'Instrumento de avaliación')],
        ['1.1', 'CE1', hint(L('rúbrica, lista de cotejo, prueba…', 'rúbrica, lista de cotexo, proba…'))],
        ['1.2', 'CE1', ''],
        ['2.1', 'CE2', ''],
        ['3.1', 'CE3', ''],
      ],
      { widths: [280, 140, 180] },
    ),
    h1(L('5. Saberes básicos', '5. Saberes básicos')),
    ul([
      b(L('Bloque A. ', 'Bloque A. ')) + hint(L('saber básico', 'saber básico')),
      b(L('Bloque B. ', 'Bloque B. ')) + hint(L('saber básico', 'saber básico')),
      b(L('Bloque C. ', 'Bloque C. ')) + hint(L('saber básico', 'saber básico')),
    ]),
    h1(L('6. Secuencia de actividades', '6. Secuencia de actividades')),
    table(
      [
        [L('Fase', 'Fase'), L('Sesión', 'Sesión'), L('Actividades y tareas', 'Actividades e tarefas'), L('Agrupamiento', 'Agrupamento'), L('Recursos', 'Recursos')],
        [L('Activación', 'Activación'), '1', hint(L('conocimientos previos, pregunta motivadora', 'coñecementos previos, pregunta motivadora')), L('Gran grupo', 'Grupo clase'), ''],
        [L('Exploración', 'Exploración'), '2–3', '', L('Parejas', 'Parellas'), ''],
        [L('Estructuración', 'Estruturación'), '4–5', '', L('Individual', 'Individual'), ''],
        [L('Aplicación', 'Aplicación'), '6–7', hint(L('elaboración del producto final', 'elaboración do produto final')), L('Equipos cooperativos', 'Equipos cooperativos'), ''],
        [L('Conclusión', 'Conclusión'), '8', hint(L('presentación, metacognición', 'presentación, metacognición')), L('Gran grupo', 'Grupo clase'), ''],
      ],
      { side: true, widths: [110, 60, 230, 110, 90] },
    ),
    h1(L('7. Atención a la diversidad (DUA)', '7. Atención á diversidade (DUA)')),
    table(
      [
        [L('Principio del DUA', 'Principio do DUA'), L('Medidas previstas', 'Medidas previstas')],
        [L('Múltiples formas de implicación (el porqué)', 'Múltiples formas de implicación (o porqué)'), hint(L('elección, relevancia, trabajo cooperativo, autorregulación', 'elección, relevancia, traballo cooperativo, autorregulación'))],
        [L('Múltiples formas de representación (el qué)', 'Múltiples formas de representación (o que)'), hint(L('textos, vídeos, esquemas, subtítulos, glosario', 'textos, vídeos, esquemas, subtítulos, glosario'))],
        [L('Múltiples formas de acción y expresión (el cómo)', 'Múltiples formas de acción e expresión (o como)'), hint(L('producto oral, escrito, digital o gráfico a elegir', 'produto oral, escrito, dixital ou gráfico a escoller'))],
        [L('Medidas específicas', 'Medidas específicas'), hint(L('alumnado NEAE, adaptaciones, refuerzo y ampliación', 'alumnado NEAE, adaptacións, reforzo e ampliación'))],
      ],
      { side: true, widths: [230, 370] },
    ),
    h1(L('8. Evaluación', '8. Avaliación')),
    table(
      [
        [L('Instrumento', 'Instrumento'), L('Criterios evaluados', 'Criterios avaliados'), L('Peso (%)', 'Peso (%)')],
        [L('Rúbrica del producto final', 'Rúbrica do produto final'), '1.1, 2.1', '40'],
        [L('Observación sistemática', 'Observación sistemática'), '1.2', '20'],
        [L('Cuaderno / portfolio', 'Caderno / portfolio'), '3.1', '20'],
        [L('Autoevaluación y coevaluación', 'Autoavaliación e coavaliación'), '1.2, 3.1', '20'],
      ],
      { widths: [260, 220, 120] },
    ),
    h2(L('Evaluación de la práctica docente', 'Avaliación da práctica docente')),
    tasks([
      L('Los objetivos y criterios se comunicaron al alumnado.', 'Os obxectivos e criterios comunicáronse ao alumnado.'),
      L('La temporalización fue adecuada.', 'A temporalización foi axeitada.'),
      L('Las medidas DUA facilitaron la participación de todo el alumnado.', 'As medidas DUA facilitaron a participación de todo o alumnado.'),
      L('Propuestas de mejora: ', 'Propostas de mellora: ') + hint('…'),
    ]),
  ].join('')
}

const rubric: Builder = (lang) => {
  const L = pick(lang)
  const levels = [L('Excelente (4)', 'Excelente (4)'), L('Bien (3)', 'Ben (3)'), L('Suficiente (2)', 'Suficiente (2)'), L('Insuficiente (1)', 'Insuficiente (1)')]
  const row = (criterion: string, weight: string, d: string[]) => [criterion, weight, ...d]
  return [
    title(L('Rúbrica de evaluación', 'Rúbrica de avaliación')),
    table(
      [
        [L('Materia', 'Materia'), '', L('Curso', 'Curso'), ''],
        [L('Tarea / producto', 'Tarefa / produto'), '', L('Alumno/a', 'Alumno/a'), ''],
      ],
      { head: false, side: true, widths: [130, 190, 90, 190] },
    ),
    p(''),
    table(
      [
        [L('Criterio', 'Criterio'), L('Peso', 'Peso'), ...levels],
        row(L('Contenido', 'Contido'), '30%', [
          L('Información completa, rigurosa y bien relacionada.', 'Información completa, rigorosa e ben relacionada.'),
          L('Información correcta con pequeñas omisiones.', 'Información correcta con pequenas omisións.'),
          L('Información básica, con algunos errores.', 'Información básica, con algúns erros.'),
          L('Información escasa o incorrecta.', 'Información escasa ou incorrecta.'),
        ]),
        row(L('Organización', 'Organización'), '20%', [
          L('Estructura clara y lógica en todas las partes.', 'Estrutura clara e lóxica en todas as partes.'),
          L('Estructura clara con algún salto.', 'Estrutura clara con algún salto.'),
          L('Estructura poco clara.', 'Estrutura pouco clara.'),
          L('Sin estructura reconocible.', 'Sen estrutura recoñecible.'),
        ]),
        row(L('Expresión y vocabulario', 'Expresión e vocabulario'), '20%', [
          L('Vocabulario preciso y sin errores.', 'Vocabulario preciso e sen erros.'),
          L('Vocabulario adecuado, errores leves.', 'Vocabulario axeitado, erros leves.'),
          L('Vocabulario limitado, varios errores.', 'Vocabulario limitado, varios erros.'),
          L('Errores frecuentes que dificultan la comprensión.', 'Erros frecuentes que dificultan a comprensión.'),
        ]),
        row(L('Presentación', 'Presentación'), '15%', [
          L('Cuidada, original y atractiva.', 'Coidada, orixinal e atractiva.'),
          L('Cuidada y ordenada.', 'Coidada e ordenada.'),
          L('Aceptable.', 'Aceptable.'),
          L('Descuidada.', 'Descoidada.'),
        ]),
        row(L('Fuentes y citas', 'Fontes e citas'), '15%', [
          L('Varias fuentes fiables, bien citadas.', 'Varias fontes fiables, ben citadas.'),
          L('Fuentes fiables, citas incompletas.', 'Fontes fiables, citas incompletas.'),
          L('Una sola fuente o sin citar.', 'Unha soa fonte ou sen citar.'),
          L('Sin fuentes.', 'Sen fontes.'),
        ]),
      ],
      { side: true, widths: [110, 50, 110, 110, 110, 110] },
    ),
    p(''),
    p(b(L('Calificación: ', 'Cualificación: ')) + L('suma de (nivel × peso) ÷ 4 × 10 = ', 'suma de (nivel × peso) ÷ 4 × 10 = ') + blank(8) + ' / 10'),
    p(b(L('Observaciones: ', 'Observacións: '))),
    p(blank(80)),
    p(blank(80)),
  ].join('')
}

const worksheet: Builder = (lang) => {
  const L = pick(lang)
  return [
    table(
      [
        [L('Nombre y apellidos', 'Nome e apelidos'), '', L('N.º', 'N.º'), ''],
        [L('Curso y grupo', 'Curso e grupo'), '', L('Fecha', 'Data'), ''],
      ],
      { head: false, side: true, widths: [150, 270, 70, 110] },
    ),
    title(L('Ficha de trabajo: ', 'Ficha de traballo: ') + hint(L('tema', 'tema'))),
    p(b(L('Objetivo: ', 'Obxectivo: ')) + hint(L('qué vas a aprender con esta ficha', 'que vas aprender con esta ficha'))),
    p(b(L('Instrucciones: ', 'Instrucións: ')) + L('lee con atención cada enunciado antes de responder.', 'le con atención cada enunciado antes de responder.')),
    h2(L('1. Completa los huecos', '1. Completa os ocos')),
    p(L('El agua de los ríos y mares se ', 'A auga dos ríos e mares ') + blank(12) + L(' con el calor del sol y forma las ', ' coa calor do sol e forma as ') + blank(12) + '.'),
    p(L('Cuando el vapor se enfría, se ', 'Cando o vapor arrefría, ') + blank(12) + L(' y cae en forma de ', ' e cae en forma de ') + blank(12) + '.'),
    h2(L('2. Relaciona cada concepto con su definición', '2. Relaciona cada concepto coa súa definición')),
    table(
      [
        [L('Concepto', 'Concepto'), L('Letra', 'Letra'), L('Definición', 'Definición')],
        [L('1. Evaporación', '1. Evaporación'), '', L('a) Paso de vapor a líquido', 'a) Paso de vapor a líquido')],
        [L('2. Condensación', '2. Condensación'), '', L('b) Caída de agua desde las nubes', 'b) Caída de auga desde as nubes')],
        [L('3. Precipitación', '3. Precipitación'), '', L('c) Paso de líquido a vapor', 'c) Paso de líquido a vapor')],
      ],
      { widths: [200, 70, 330] },
    ),
    h2(L('3. Verdadero o falso', '3. Verdadeiro ou falso')),
    table(
      [
        [L('Afirmación', 'Afirmación'), 'V', 'F'],
        [L('El agua solo existe en estado líquido.', 'A auga só existe en estado líquido.'), '', ''],
        [L('Las nubes están formadas por gotas de agua.', 'As nubes están formadas por pingas de auga.'), '', ''],
        [L('El ciclo del agua no tiene principio ni fin.', 'O ciclo da auga non ten principio nin fin.'), '', ''],
      ],
      { widths: [500, 50, 50] },
    ),
    h2(L('4. Responde con tus palabras', '4. Responde coas túas palabras')),
    p(L('¿Por qué es importante cuidar el agua? Pon dos ejemplos.', 'Por que é importante coidar a auga? Pon dous exemplos.')),
    p(blank(80)),
    p(blank(80)),
    p(blank(80)),
    h2(L('5. Autoevaluación', '5. Autoavaliación')),
    tasks([
      L('He entendido los conceptos principales.', 'Entendín os conceptos principais.'),
      L('Puedo explicarlo a un compañero o compañera.', 'Podo explicalo a un compañeiro ou compañeira.'),
      L('Necesito repasar: ', 'Necesito repasar: ') + blank(30),
    ]),
  ].join('')
}

const report: Builder = (lang) => {
  const L = pick(lang)
  const cover = (label: string) => p(b(label + ': ') + blank(30), 'center')
  return [
    p(''),
    p(''),
    p(''),
    title(L('Título del trabajo', 'Título do traballo'), 'center'),
    subtitle(L('Subtítulo o tema', 'Subtítulo ou tema'), 'center'),
    p(''),
    p(''),
    p(''),
    cover(L('Autor/a', 'Autor/a')),
    cover(L('Curso y grupo', 'Curso e grupo')),
    cover(L('Materia', 'Materia')),
    cover(L('Docente', 'Docente')),
    cover(L('Centro', 'Centro')),
    cover(L('Fecha de entrega', 'Data de entrega')),
    pageBreak,
    h1(L('Índice', 'Índice')),
    ol([
      L('Introducción', 'Introdución'),
      L('Objetivos', 'Obxectivos'),
      L('Desarrollo', 'Desenvolvemento'),
      L('Conclusiones', 'Conclusións'),
      L('Bibliografía', 'Bibliografía'),
      L('Anexos', 'Anexos'),
    ]),
    pageBreak,
    h1(L('1. Introducción', '1. Introdución')),
    p(hint(L('Presenta el tema, por qué lo has elegido y cómo está organizado el trabajo.', 'Presenta o tema, por que o escolliches e como está organizado o traballo.'))),
    h1(L('2. Objetivos', '2. Obxectivos')),
    ul([hint(L('objetivo 1', 'obxectivo 1')), hint(L('objetivo 2', 'obxectivo 2'))]),
    h1(L('3. Desarrollo', '3. Desenvolvemento')),
    h2(L('3.1. Primer apartado', '3.1. Primeira epígrafe')),
    p(hint(L('Desarrolla la información con tus propias palabras y cita las fuentes.', 'Desenvolve a información coas túas propias palabras e cita as fontes.'))),
    h2(L('3.2. Segundo apartado', '3.2. Segunda epígrafe')),
    p(''),
    h1(L('4. Conclusiones', '4. Conclusións')),
    p(hint(L('¿Qué has aprendido? ¿Se han cumplido los objetivos?', 'Que aprendiches? Cumpríronse os obxectivos?'))),
    h1(L('5. Bibliografía', '5. Bibliografía')),
    p(L('Cita las fuentes en formato APA (7.ª edición). Ejemplos:', 'Cita as fontes en formato APA (7.ª edición). Exemplos:')),
    ul([
      L('Apellido, N. (Año). ', 'Apelido, N. (Ano). ') + `<em>${L('Título del libro', 'Título do libro')}</em>` + L('. Editorial.', '. Editorial.'),
      L('Apellido, N. (Año, día de mes). Título de la página. ', 'Apelido, N. (Ano, día de mes). Título da páxina. ') + `<em>${L('Nombre del sitio', 'Nome do sitio')}</em>. https://…`,
    ]),
    h1(L('6. Anexos', '6. Anexos')),
    p(''),
  ].join('')
}

const minutes: Builder = (lang) => {
  const L = pick(lang)
  return [
    title(L('Acta de reunión', 'Acta de reunión')),
    table(
      [
        [L('Órgano', 'Órgano'), hint(L('Claustro / Departamento / Equipo docente / CCP', 'Claustro / Departamento / Equipo docente / CCP'))],
        [L('Acta n.º', 'Acta n.º'), ''],
        [L('Fecha', 'Data'), ''],
        [L('Hora de inicio y fin', 'Hora de inicio e fin'), ''],
        [L('Lugar / modalidad', 'Lugar / modalidade'), hint(L('presencial o telemática', 'presencial ou telemática'))],
        [L('Preside', 'Preside'), ''],
        [L('Secretario/a', 'Secretario/a'), ''],
      ],
      { head: false, side: true, widths: [180, 420] },
    ),
    h2(L('Asistentes', 'Asistentes')),
    ul(['', '']),
    h2(L('Ausencias justificadas', 'Ausencias xustificadas')),
    ul(['']),
    h2(L('Orden del día', 'Orde do día')),
    ol([
      L('Lectura y aprobación, si procede, del acta de la sesión anterior.', 'Lectura e aprobación, se procede, da acta da sesión anterior.'),
      hint(L('punto', 'punto')),
      hint(L('punto', 'punto')),
      L('Ruegos y preguntas.', 'Rogos e preguntas.'),
    ]),
    h2(L('Desarrollo de la sesión', 'Desenvolvemento da sesión')),
    p(b(L('Punto 1. ', 'Punto 1. ')) + L('Se aprueba el acta de la sesión anterior ', 'Apróbase a acta da sesión anterior ') + hint(L('por unanimidad / con las siguientes modificaciones', 'por unanimidade / coas seguintes modificacións')) + '.'),
    p(b(L('Punto 2. ', 'Punto 2. ')) + hint(L('resumen de las intervenciones', 'resumo das intervencións'))),
    p(b(L('Punto 3. ', 'Punto 3. ')) + hint(L('resumen de las intervenciones', 'resumo das intervencións'))),
    h2(L('Acuerdos adoptados', 'Acordos adoptados')),
    table(
      [
        [L('Acuerdo', 'Acordo'), L('Responsable', 'Responsable'), L('Plazo', 'Prazo')],
        ['', '', ''],
        ['', '', ''],
      ],
      { widths: [360, 140, 100] },
    ),
    h2(L('Ruegos y preguntas', 'Rogos e preguntas')),
    p(''),
    p(
      L(
        'Sin más asuntos que tratar, se levanta la sesión a las ____ horas, de lo que, como secretario/a, doy fe.',
        'Sen máis asuntos que tratar, levántase a sesión ás ____ horas, do que, como secretario/a, dou fe.',
      ),
    ),
    p(''),
    table(
      [
        [L('V.º B.º El/La presidente/a', 'V.º e pr. O/A presidente/a'), L('El/La secretario/a', 'O/A secretario/a')],
        [`<br>${L('Fdo.: ', 'Asdo.: ')}${blank(20)}`, `<br>${L('Fdo.: ', 'Asdo.: ')}${blank(20)}`],
      ],
      { widths: [300, 300] },
    ),
  ].join('')
}

const familyLetter: Builder = (lang) => {
  const L = pick(lang)
  return [
    p(b(hint(L('Nombre del centro', 'Nome do centro'))) + '<br>' + hint(L('Dirección · Teléfono · Correo electrónico', 'Enderezo · Teléfono · Correo electrónico'))),
    p(''),
    p(hint(L('Localidad', 'Localidade')) + L(', a ', ', ') + hint(L('día', 'día')) + L(' de ', ' de ') + hint(L('mes', 'mes')) + L(' de ', ' de ') + hint(L('año', 'ano')), 'right'),
    p(''),
    p(b(L('Asunto: ', 'Asunto: ')) + L('Salida didáctica a ', 'Saída didáctica a ') + hint(L('lugar', 'lugar'))),
    p(''),
    p(L('Estimadas familias:', 'Estimadas familias:')),
    p(
      L(
        'Nos ponemos en contacto con ustedes para informarles de que el alumnado de ',
        'Poñémonos en contacto con vós para informarvos de que o alumnado de ',
      ) +
        hint(L('curso y grupo', 'curso e grupo')) +
        L(
          ' realizará una salida didáctica como parte de la situación de aprendizaje que estamos trabajando en el aula. Los datos de la actividad son los siguientes:',
          ' realizará unha saída didáctica como parte da situación de aprendizaxe que estamos a traballar na aula. Os datos da actividade son os seguintes:',
        ),
      'justify',
    ),
    ul([
      b(L('Fecha: ', 'Data: ')) + blank(20),
      b(L('Horario: ', 'Horario: ')) + L('salida a las ', 'saída ás ') + blank(6) + L(' y regreso a las ', ' e regreso ás ') + blank(6),
      b(L('Lugar: ', 'Lugar: ')) + blank(30),
      b(L('Coste: ', 'Custo: ')) + blank(10),
      b(L('Material necesario: ', 'Material necesario: ')) + blank(30),
    ]),
    p(
      L(
        'Les rogamos que devuelvan la autorización firmada al tutor o tutora antes del ',
        'Pregámosvos que devolvades a autorización asinada ao titor ou titora antes do ',
      ) +
        blank(12) +
        L('. Para cualquier duda pueden contactar con el centro por los medios habituales.', '. Para calquera dúbida podedes contactar co centro polos medios habituais.'),
      'justify',
    ),
    p(L('Reciban un cordial saludo.', 'Recibide un cordial saúdo.')),
    p(''),
    p(L('El tutor / La tutora', 'O titor / A titora')),
    p(''),
    p(L('Fdo.: ', 'Asdo.: ') + blank(30)),
    p(''),
    p('✂ - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -', 'center'),
    h2(L('Autorización', 'Autorización')),
    p(
      L('D./D.ª ', 'D./D.ª ') +
        blank(36) +
        L(', con DNI ', ', con DNI ') +
        blank(12) +
        L(', como padre, madre o tutor/a legal del alumno/a ', ', como pai, nai ou titor/a legal do alumno/a ') +
        blank(36) +
        L(' del curso ', ' do curso ') +
        blank(8) +
        ':',
      'justify',
    ),
    tasks([
      L('Autorizo su participación en la actividad.', 'Autorizo a súa participación na actividade.'),
      L('No autorizo su participación en la actividad.', 'Non autorizo a súa participación na actividade.'),
    ]),
    p(L('Firma: ', 'Sinatura: ') + blank(30) + L('   Fecha: ', '   Data: ') + blank(14)),
  ].join('')
}

const BUILDERS: Record<string, Builder> = {
  'learning-situation': learningSituation,
  rubric,
  worksheet,
  report,
  minutes,
  'family-letter': familyLetter,
}

export async function createWriterTemplate(id: string, lang: Lang, name: string): Promise<string> {
  const html = `<!doctype html><html><head><meta charset="utf-8"></head><body>${BUILDERS[id](lang)}</body></html>`
  const module = await appInfo('writer').load!()
  return module.importFile(new File([html], `${name}.html`, { type: 'text/html' }))
}
