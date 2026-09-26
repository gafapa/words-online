// The offline rule set: common rules plus per-language ones.

import type { Issue, Paragraph } from '../types'
import { commonRules } from './common'
import { esRules } from './es'
import { glRules } from './gl'
import { frRules } from './fr'
import { deRules } from './de'
import { enRules } from './en'
import type { Rule } from './util'

export type { Rule } from './util'

export const RULES: Rule[] = [...commonRules, ...esRules, ...glRules, ...frRules, ...deRules, ...enRules]

export function runRules(p: Paragraph, options: { optionalStyle?: boolean; disabled?: Set<string> } = {}): Issue[] {
  const out: Issue[] = []
  for (const rule of RULES) {
    if (rule.langs !== 'all' && !rule.langs.includes(p.lang)) continue
    if (rule.optional && !options.optionalStyle) continue
    if (options.disabled?.has(rule.id)) continue
    for (const found of rule.check(p.text, p)) out.push({ ...found, kind: rule.kind, rule: rule.id })
  }
  return dedupe(out)
}

// Overlapping issues: the longer one wins (a phrase over one of its words).
export function dedupe(issues: Issue[]): Issue[] {
  const sorted = [...issues].sort((a, b) => b.to - b.from - (a.to - a.from) || a.from - b.from)
  const kept: Issue[] = []
  for (const issue of sorted) {
    if (kept.some((k) => issue.from < k.to && k.from < issue.to)) continue
    kept.push(issue)
  }
  return kept.sort((a, b) => a.from - b.from)
}
