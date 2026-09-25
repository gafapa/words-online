// Presentation templates, written as .pptx with pptxgenjs and opened through
// the presentations app's PowerPoint import.

import PptxGenJS from 'pptxgenjs'
import { appInfo } from '../apps/registry'
import { pick, type Lang } from './types'

type Pptx = InstanceType<typeof PptxGenJS>
type Slide = ReturnType<Pptx['addSlide']>

// 16:9 slide, 10 × 5.625 inches.
const W = 10
const FONT = 'Helvetica'
const INK = '1F2937'
const MUTED = '5F6368'

interface Palette {
  accent: string
  dark: string
  light: string
}

function titleBar(slide: Slide, text: string, p: Palette): void {
  slide.addShape('rect', { x: 0, y: 0, w: 0.18, h: 5.625, fill: { color: p.accent }, line: { color: p.accent } })
  slide.addText(text, { x: 0.5, y: 0.3, w: 9, h: 0.8, fontFace: FONT, fontSize: 30, bold: true, color: INK, valign: 'middle' })
}

function bullets(slide: Slide, items: string[], x = 0.6, y = 1.3, w = 8.8, h = 3.8, fontSize = 20): void {
  slide.addText(
    items.map((text) => ({ text, options: { bullet: true, breakLine: true } })),
    { x, y, w, h, fontFace: FONT, fontSize, color: INK, valign: 'top', paraSpaceAfter: 8 },
  )
}

function cover(pptx: Pptx, title: string, subtitle: string, p: Palette): void {
  const s = pptx.addSlide()
  s.background = { color: p.accent }
  s.addShape('rect', { x: 0, y: 3.9, w: W, h: 1.725, fill: { color: p.dark }, line: { color: p.dark } })
  s.addText(title, { x: 0.7, y: 1.2, w: 8.6, h: 1.6, fontFace: FONT, fontSize: 40, bold: true, color: 'FFFFFF', valign: 'bottom' })
  s.addText(subtitle, { x: 0.7, y: 2.9, w: 8.6, h: 0.7, fontFace: FONT, fontSize: 20, color: 'FFFFFF', valign: 'top' })
}

function learningSituation(pptx: Pptx, lang: Lang): void {
  const L = pick(lang)
  const p = { accent: '1A73E8', dark: '174EA6', light: 'E8F0FE' }
  cover(pptx, L('[Título de la situación de aprendizaje]', '[Título da situación de aprendizaxe]'), L('Materia · Curso · Trimestre', 'Materia · Curso · Trimestre'), p)

  let s = pptx.addSlide()
  titleBar(s, L('¿Qué reto vamos a resolver?', 'Que reto imos resolver?'), p)
  s.addShape('roundRect', { x: 0.6, y: 1.4, w: 8.8, h: 1.6, fill: { color: p.light }, line: { color: p.accent }, rectRadius: 0.15 })
  s.addText(L('[Pregunta o problema motivador conectado con la vida real]', '[Pregunta ou problema motivador conectado coa vida real]'), {
    x: 0.8, y: 1.5, w: 8.4, h: 1.4, fontFace: FONT, fontSize: 24, italic: true, color: INK, align: 'center', valign: 'middle',
  })
  s.addText(L('Contexto: ', 'Contexto: ') + L('¿por qué es importante para nosotros?', 'por que é importante para nós?'), { x: 0.6, y: 3.4, w: 8.8, h: 0.8, fontFace: FONT, fontSize: 18, color: MUTED })

  s = pptx.addSlide()
  titleBar(s, L('¿Qué vamos a aprender?', 'Que imos aprender?'), p)
  bullets(s, [
    L('Objetivo 1: …', 'Obxectivo 1: …'),
    L('Objetivo 2: …', 'Obxectivo 2: …'),
    L('Objetivo 3: …', 'Obxectivo 3: …'),
    L('Competencias clave: CCL, STEM, CD, CPSAA…', 'Competencias clave: CCL, STEM, CD, CPSAA…'),
  ])

  s = pptx.addSlide()
  titleBar(s, L('¿Cómo lo vamos a hacer?', 'Como o imos facer?'), p)
  const phases = [
    [L('Activación', 'Activación'), L('Ideas previas', 'Ideas previas')],
    [L('Exploración', 'Exploración'), L('Investigamos', 'Investigamos')],
    [L('Estructuración', 'Estruturación'), L('Organizamos', 'Organizamos')],
    [L('Aplicación', 'Aplicación'), L('Producto final', 'Produto final')],
    [L('Conclusión', 'Conclusión'), L('Presentamos y reflexionamos', 'Presentamos e reflexionamos')],
  ]
  phases.forEach(([name, desc], i) => {
    const x = 0.5 + i * 1.83
    s.addShape('chevron', { x, y: 1.8, w: 1.8, h: 0.9, fill: { color: p.accent, transparency: i * 12 }, line: { color: 'FFFFFF' } })
    s.addText(name, { x: x + 0.25, y: 1.8, w: 1.4, h: 0.9, fontFace: FONT, fontSize: 13, bold: true, color: 'FFFFFF', align: 'center', valign: 'middle' })
    s.addText(desc, { x, y: 2.9, w: 1.8, h: 0.9, fontFace: FONT, fontSize: 14, color: INK, align: 'center', valign: 'top' })
  })
  s.addText(L('Sesiones: [n.º] · Agrupamientos: individual, parejas y equipos', 'Sesións: [n.º] · Agrupamentos: individual, parellas e equipos'), {
    x: 0.6, y: 4.4, w: 8.8, h: 0.5, fontFace: FONT, fontSize: 16, color: MUTED,
  })

  s = pptx.addSlide()
  titleBar(s, L('Producto final', 'Produto final'), p)
  bullets(s, [
    L('¿Qué vamos a crear? …', 'Que imos crear? …'),
    L('¿Para quién? …', 'Para quen? …'),
    L('Formato a elegir: póster, vídeo, presentación, maqueta…', 'Formato a escoller: póster, vídeo, presentación, maqueta…'),
    L('Fecha de entrega: …', 'Data de entrega: …'),
  ])

  s = pptx.addSlide()
  titleBar(s, L('¿Cómo se evaluará?', 'Como se avaliará?'), p)
  const items = [
    [L('Rúbrica del producto', 'Rúbrica do produto'), '40%'],
    [L('Observación en clase', 'Observación na clase'), '20%'],
    [L('Cuaderno / portfolio', 'Caderno / portfolio'), '20%'],
    [L('Autoevaluación y coevaluación', 'Autoavaliación e coavaliación'), '20%'],
  ]
  items.forEach(([name, pct], i) => {
    const x = 0.6 + (i % 2) * 4.5
    const y = 1.4 + Math.floor(i / 2) * 1.7
    s.addShape('roundRect', { x, y, w: 4.2, h: 1.4, fill: { color: p.light }, line: { color: p.accent }, rectRadius: 0.1 })
    s.addText(pct, { x: x + 0.2, y, w: 1.4, h: 1.4, fontFace: FONT, fontSize: 32, bold: true, color: p.accent, valign: 'middle' })
    s.addText(name, { x: x + 1.6, y, w: 2.5, h: 1.4, fontFace: FONT, fontSize: 17, color: INK, valign: 'middle' })
  })

  s = pptx.addSlide()
  titleBar(s, L('¿Qué he aprendido?', 'Que aprendín?'), p)
  bullets(s, [
    L('Lo que más me ha gustado…', 'O que máis me gustou…'),
    L('Lo que me ha resultado difícil…', 'O que me resultou difícil…'),
    L('Lo que puedo mejorar…', 'O que podo mellorar…'),
  ])
}

function oralPresentation(pptx: Pptx, lang: Lang): void {
  const L = pick(lang)
  const p = { accent: '188038', dark: '0D652D', light: 'E6F4EA' }
  cover(pptx, L('[Título de la exposición]', '[Título da exposición]'), L('Nombre y apellidos · Curso · Fecha', 'Nome e apelidos · Curso · Data'), p)

  let s = pptx.addSlide()
  titleBar(s, L('Índice', 'Índice'), p)
  ;[L('Introducción', 'Introdución'), L('Desarrollo', 'Desenvolvemento'), L('Conclusiones', 'Conclusións'), L('Fuentes', 'Fontes')].forEach((item, i) => {
    const y = 1.35 + i * 0.95
    s.addShape('ellipse', { x: 0.7, y, w: 0.7, h: 0.7, fill: { color: p.accent }, line: { color: p.accent } })
    s.addText(String(i + 1), { x: 0.7, y, w: 0.7, h: 0.7, fontFace: FONT, fontSize: 20, bold: true, color: 'FFFFFF', align: 'center', valign: 'middle' })
    s.addText(item, { x: 1.7, y, w: 7, h: 0.7, fontFace: FONT, fontSize: 22, color: INK, valign: 'middle' })
  })

  s = pptx.addSlide()
  titleBar(s, L('Introducción', 'Introdución'), p)
  bullets(s, [L('¿De qué trata el tema?', 'De que trata o tema?'), L('¿Por qué lo he elegido?', 'Por que o escollín?'), L('¿Qué vais a aprender?', 'Que ides aprender?')])

  s = pptx.addSlide()
  titleBar(s, L('Desarrollo', 'Desenvolvemento'), p)
  bullets(s, [L('Idea principal 1', 'Idea principal 1'), L('Dato o ejemplo', 'Dato ou exemplo')], 0.6, 1.3, 4.3, 3.8)
  s.addShape('rect', { x: 5.2, y: 1.4, w: 4.2, h: 3.4, fill: { color: p.light }, line: { color: p.accent, dashType: 'dash' } })
  s.addText(L('[Imagen, gráfico o mapa]', '[Imaxe, gráfico ou mapa]'), { x: 5.2, y: 1.4, w: 4.2, h: 3.4, fontFace: FONT, fontSize: 16, italic: true, color: MUTED, align: 'center', valign: 'middle' })

  s = pptx.addSlide()
  titleBar(s, L('Conclusiones', 'Conclusións'), p)
  bullets(s, [L('Lo más importante es…', 'O máis importante é…'), L('He aprendido que…', 'Aprendín que…'), L('Me pregunto…', 'Pregúntome…')])

  s = pptx.addSlide()
  titleBar(s, L('Fuentes', 'Fontes'), p)
  bullets(
    s,
    [
      L('Apellido, N. (Año). Título del libro. Editorial.', 'Apelido, N. (Ano). Título do libro. Editorial.'),
      L('Apellido, N. (Año). Título de la página. Sitio web. https://…', 'Apelido, N. (Ano). Título da páxina. Sitio web. https://…'),
    ],
    0.6,
    1.3,
    8.8,
    3.8,
    16,
  )

  s = pptx.addSlide()
  s.background = { color: p.accent }
  s.addText(L('¡Gracias!', 'Grazas!'), { x: 0.5, y: 1.5, w: 9, h: 1.4, fontFace: FONT, fontSize: 54, bold: true, color: 'FFFFFF', align: 'center', valign: 'middle' })
  s.addText(L('¿Preguntas?', 'Preguntas?'), { x: 0.5, y: 2.9, w: 9, h: 0.8, fontFace: FONT, fontSize: 26, color: 'FFFFFF', align: 'center', valign: 'middle' })
}

const BUILDERS: Record<string, (pptx: Pptx, lang: Lang) => void> = {
  'slides-learning-situation': learningSituation,
  'oral-presentation': oralPresentation,
}

export async function createSlidesTemplate(id: string, lang: Lang, name: string): Promise<string> {
  const pptx = new PptxGenJS()
  pptx.layout = 'LAYOUT_16x9'
  pptx.title = name
  BUILDERS[id](pptx, lang)
  const data = (await pptx.write({ outputType: 'arraybuffer' })) as ArrayBuffer
  const module = await appInfo('slides').load!()
  return module.importFile(new File([data], `${name}.pptx`, { type: 'application/vnd.openxmlformats-officedocument.presentationml.presentation' }))
}
