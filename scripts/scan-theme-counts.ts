#!/usr/bin/env node
import { scanProject } from './check-theme-colors.ts'

const raw = await scanProject({ mode: 'raw' })
const enforced = await scanProject({ mode: 'enforced' })
console.log(JSON.stringify({ raw: raw.length, enforced: enforced.length }, null, 2))
