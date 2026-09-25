// Template catalog for schools (Spain / Galicia, LOMLOE). Metadata only: the
// content of each app's templates is a separate chunk, loaded when used.

import type { DocType } from '../core/store'
import { THUMBS } from './thumbs'
import type { Lang, Template } from './types'

type Entry = [id: string, app: DocType, name: [es: string, gl: string], description: [es: string, gl: string]]

const ENTRIES: Entry[] = [
  [
    'learning-situation',
    'writer',
    ['Situación de aprendizaje', 'Situación de aprendizaxe'],
    [
      'Estructura LOMLOE: competencias, criterios, saberes básicos, actividades, DUA y evaluación.',
      'Estrutura LOMLOE: competencias, criterios, saberes básicos, actividades, DUA e avaliación.',
    ],
  ],
  ['rubric', 'writer', ['Rúbrica', 'Rúbrica'], ['Tabla de criterios con cuatro niveles de logro y pesos.', 'Táboa de criterios con catro niveis de logro e pesos.']],
  [
    'worksheet',
    'writer',
    ['Ficha de trabajo', 'Ficha de traballo'],
    ['Cabecera con nombre, curso y fecha, ejercicios variados y autoevaluación.', 'Cabeceira con nome, curso e data, exercicios variados e autoavaliación.'],
  ],
  [
    'report',
    'writer',
    ['Trabajo de alumno', 'Traballo de alumno'],
    ['Portada, índice, apartados, conclusiones y bibliografía en APA.', 'Portada, índice, epígrafes, conclusións e bibliografía en APA.'],
  ],
  [
    'minutes',
    'writer',
    ['Acta de reunión', 'Acta de reunión'],
    ['Claustro, departamento o equipo docente: asistentes, orden del día y acuerdos.', 'Claustro, departamento ou equipo docente: asistentes, orde do día e acordos.'],
  ],
  [
    'family-letter',
    'writer',
    ['Carta a las familias', 'Carta ás familias'],
    ['Comunicación de una salida didáctica con autorización recortable.', 'Comunicación dunha saída didáctica con autorización recortable.'],
  ],
  [
    'gradebook',
    'sheet',
    ['Cuaderno de notas', 'Caderno de notas'],
    [
      'Medias ponderadas por evaluación, nota final, calificación y aprobados/suspensos en color.',
      'Medias ponderadas por avaliación, nota final, cualificación e aprobados/suspensos en cor.',
    ],
  ],
  ['timetable', 'sheet', ['Horario semanal', 'Horario semanal'], ['Sesiones de lunes a viernes con recreo y lista de materias.', 'Sesións de luns a venres con recreo e lista de materias.']],
  [
    'attendance',
    'sheet',
    ['Registro de asistencia', 'Rexistro de asistencia'],
    ['Cuadrícula mensual con faltas, justificadas, retrasos y porcentaje de asistencia.', 'Cuadrícula mensual con faltas, xustificadas, atrasos e porcentaxe de asistencia.'],
  ],
  [
    'scored-rubric',
    'sheet',
    ['Rúbrica con puntuación', 'Rúbrica con puntuación'],
    ['Introduce el nivel de cada criterio y obtén la nota automáticamente.', 'Introduce o nivel de cada criterio e obtén a nota automaticamente.'],
  ],
  ['concept-map', 'diagram', ['Mapa conceptual', 'Mapa conceptual'], ['Conceptos jerarquizados unidos por palabras de enlace.', 'Conceptos xerarquizados unidos por palabras de ligazón.']],
  ['timeline', 'diagram', ['Línea del tiempo', 'Liña do tempo'], ['Acontecimientos ordenados con fechas y tarjetas.', 'Acontecementos ordenados con datas e tarxetas.']],
  [
    'flowchart',
    'diagram',
    ['Diagrama de flujo', 'Diagrama de fluxo'],
    ['Pasos y decisiones de un proceso con símbolos estándar.', 'Pasos e decisións dun proceso con símbolos estándar.'],
  ],
  [
    'organizers',
    'diagram',
    ['Organizadores gráficos', 'Organizadores gráficos'],
    ['Tabla SQA (KWL), diagrama de Venn y causa-efecto, en tres páginas.', 'Táboa SQA (KWL), diagrama de Venn e causa-efecto, en tres páxinas.'],
  ],
  [
    'slides-learning-situation',
    'slides',
    ['Presentación de la situación de aprendizaje', 'Presentación da situación de aprendizaxe'],
    ['Reto, objetivos, fases, producto final y evaluación para presentar al alumnado.', 'Reto, obxectivos, fases, produto final e avaliación para presentar ao alumnado.'],
  ],
  [
    'oral-presentation',
    'slides',
    ['Exposición oral del alumnado', 'Exposición oral do alumnado'],
    ['Portada, índice, desarrollo con imagen, conclusiones y fuentes.', 'Portada, índice, desenvolvemento con imaxe, conclusións e fontes.'],
  ],
  [
    'brainstorm',
    'draw',
    ['Lluvia de ideas', 'Chuvia de ideas'],
    ['Pizarra con tema central y notas de colores para generar ideas.', 'Lousa con tema central e notas de cores para xerar ideas.'],
  ],
]

async function create(id: string, app: DocType, lang: Lang, name: string): Promise<string> {
  switch (app) {
    case 'writer':
      return (await import('./writer')).createWriterTemplate(id, lang, name)
    case 'sheet':
      return (await import('./sheet')).createSheetTemplate(id, lang, name)
    case 'diagram':
      return (await import('./diagram')).createDiagramTemplate(id, lang, name)
    case 'draw':
      return (await import('./draw')).createDrawTemplate(id, lang, name)
    case 'slides':
      return (await import('./slides')).createSlidesTemplate(id, lang, name)
    default:
      throw new Error(`No templates for ${app}`)
  }
}

export const TEMPLATES: Template[] = ENTRIES.map(([id, app, [es, gl], [des, dgl]]) => ({
  id,
  app,
  name: { es, gl },
  description: { es: des, gl: dgl },
  thumb: THUMBS[id],
  create: (lang) => create(id, app, lang, lang === 'gl' ? gl : es),
}))
