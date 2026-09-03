// 验证插件核心搜索逻辑：pinyin 生成 + fuzzysort 匹配（从插件 node_modules 直接引库）
import fuzzysort from 'fuzzysort'
import { pinyin } from 'pinyin-pro'

const skills = [
  { name: 'backup-memory', description: '备份 DeepSeek Harness 的 OpenViking 记忆库（~/.openviking）到百度网盘。' },
  { name: 'duo-xuan-pi-gai', description: '将用户作答的多选题txt与Obsidian标准答案对比批改' },
  { name: 'exam-prep-system', description: '刷题驱动的通用考试备考系统' },
  { name: 'find-skills', description: '技能搜索神器：直接描述需求即可自动搜索并安装对应 Skill' },
  { name: 'success-diary', description: '小狗钱钱版成功日记生成器。每晚10点自动化调用' },
  { name: 'obsidian-backup', description: '备份 Obsidian 知识库「思想建设」到百度网盘' },
  { name: 'daily-ai-news', description: '全球AI新闻日报搜集' },
]

// 复刻插件的 skillPinyinText
const pinyinCache = new Map()
function skillPinyinText(name, description = '') {
  const key = `${name}\u0000${description}`
  const cached = pinyinCache.get(key)
  if (cached !== undefined) return cached
  let text = ''
  try {
    const base = { toneType: 'none', nonZh: 'consecutive' }
    const nameSpaced = pinyin(name, base)
    const nameJoined = pinyin(name, { ...base, separator: '' })
    const nameFirstSpaced = pinyin(name, { ...base, pattern: 'first' })
    const nameFirstJoined = pinyin(name, { ...base, pattern: 'first', separator: '' })
    const descSpaced = pinyin(description, base)
    const descJoined = pinyin(description, { ...base, separator: '' })
    const descFirstSpaced = pinyin(description, { ...base, pattern: 'first' })
    const descFirstJoined = pinyin(description, { ...base, pattern: 'first', separator: '' })
    text = `${nameSpaced} ${nameJoined} ${nameFirstSpaced} ${nameFirstJoined} ${descSpaced} ${descJoined} ${descFirstSpaced} ${descFirstJoined}`
  } catch {
    text = ''
  }
  pinyinCache.set(key, text)
  return text
}

// 模拟用户输入
const queries = ['ji yi', 'jiyi', 'jy', 'bei fen', 'beifen', 'duo xuan', 'duoxuan']

console.log('===== pinyin 生成检查 =====')
for (const s of skills.slice(0, 3)) {
  const py = skillPinyinText(s.name, s.description)
  console.log(`${s.name} -> ${py.slice(0, 80)}...`)
}

console.log('\n===== fuzzysort 匹配检查（/ 补全逻辑） =====')
for (const q of queries) {
  const ordered = skills
  const targets = ordered.map((s) => ({
    s,
    search: `${s.name} ${s.description ?? ''} ${skillPinyinText(s.name, s.description ?? '')}`,
  }))
  const results = fuzzysort.go(q, targets, { key: 'search', limit: 12, threshold: -10000 })
  const matched = results.filter((r) => r.score > 0).map((r) => r.obj.s.name)
  console.log(`query "${q}" -> ${matched.length ? matched.join(', ') : '(无结果)'}`)
}
