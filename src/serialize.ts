/**
 * 与 Node 端 `src/main/hook/serialize.ts` 对应的「信封树」线上格式。
 *
 * 服务端把任意 JS 值编码成 `{ t, v }` 结构再走 socket.io，
 * 这里负责反向消费：类型标注、文本化、搜索、还原。
 */

export const SERIALIZED_VERSION = 1

export type SerializedValue =
  | { t: 'undef' }
  | { t: 'null' }
  | { t: 'bool'; v: boolean }
  | { t: 'num'; v: number | string }
  | { t: 'bigint'; v: string }
  | { t: 'str'; v: string; len?: number }
  | { t: 'sym'; v: string }
  | { t: 'fn'; v: string; name?: string; kind?: string }
  | { t: 'date'; v: string }
  | { t: 'regexp'; v: string; lastIndex?: number }
  | {
      t: 'err'
      name: string
      message: string
      stack?: string
      cause?: SerializedValue
      extra?: Record<string, SerializedValue>
    }
  | { t: 'arr'; v: SerializedValue[]; more?: number; id?: number }
  | {
      t: 'obj'
      v: Record<string, SerializedValue>
      ctor?: string
      more?: number
      id?: number
      getters?: string[]
      fromProto?: string[]
    }
  | { t: 'map'; v: [SerializedValue, SerializedValue][]; more?: number; ctor?: string; id?: number }
  | { t: 'set'; v: SerializedValue[]; more?: number; ctor?: string; id?: number }
  | { t: 'weak'; ctor: string; id?: number }
  | { t: 'bin'; ctor: string; byteLength: number; b64?: string; preview?: string; id?: number }
  | { t: 'promise'; id?: number }
  | { t: 'ref'; v: number; circ?: true }
  | { t: 'cut'; v: string }

/** 容器类节点，可以展开子节点 */
export type ContainerNode = Extract<SerializedValue, { t: 'arr' | 'obj' | 'map' | 'set' }>

export interface ChildEntry {
  key: string
  node: SerializedValue
  /** 键是否来自原型 getter，UI 可以淡色显示 */
  fromProto?: boolean
}

export function isContainer(node: SerializedValue | undefined): node is ContainerNode {
  if (!node) return false
  return node.t === 'arr' || node.t === 'obj' || node.t === 'map' || node.t === 'set'
}

/**
 * 兼容旧版服务端：改动前的 `requestParams` 是一段 `util.inspect` 出来的纯字符串。
 * 碰到这种数据包时包成一个字符串节点，避免整个面板直接白屏。
 */
export function normalizeNode(raw: unknown): SerializedValue {
  if (raw === undefined) return { t: 'undef' }
  if (raw === null) return { t: 'null' }

  if (typeof raw === 'string') return { t: 'str', v: raw, len: raw.length }

  if (typeof raw === 'object') {
    const rec = raw as { t?: unknown }
    if (typeof rec.t === 'string') return raw as SerializedValue
  }

  // 实在不认识就退回安全文本，保证渲染层永远拿得到合法节点
  return { t: 'str', v: String(raw) }
}

/** 收集树里所有带 id 的节点，供 ref 回填 */
function collectIds(node: SerializedValue, table: Map<number, SerializedValue>): void {
  const id = (node as { id?: number }).id
  if (typeof id === 'number' && !table.has(id)) table.set(id, node)

  switch (node.t) {
    case 'arr':
    case 'set':
      for (const item of node.v) collectIds(item, table)
      break
    case 'obj':
      for (const item of Object.values(node.v)) collectIds(item, table)
      break
    case 'map':
      for (const [k, v] of node.v) {
        collectIds(k, table)
        collectIds(v, table)
      }
      break
    case 'err':
      if (node.cause) collectIds(node.cause, table)
      for (const item of Object.values(node.extra ?? {})) collectIds(item, table)
      break
    default:
      break
  }
}

/** 建立 id → 节点 索引，供 `→#id` 引用跳转使用 */
export function buildIdTable(node: SerializedValue): Map<number, SerializedValue> {
  const table = new Map<number, SerializedValue>()
  collectIds(node, table)
  return table
}

/** 把信封树还原成真实 JS 值，循环引用也会还原成真正的环 */
export function decodeValue(node: SerializedValue): unknown {
  const table = buildIdTable(node)
  const built = new Map<number, unknown>()

  const build = (current: SerializedValue): unknown => {
    switch (current.t) {
      case 'undef':
        return undefined
      case 'null':
        return null
      case 'bool':
      case 'str':
      case 'sym':
        return current.v
      case 'num':
        return typeof current.v === 'number' ? current.v : Number(current.v)
      case 'bigint':
        return BigInt(current.v)
      case 'fn':
        return `[Function${current.name ? `: ${current.name}` : ''}]`
      case 'date':
        return current.v === 'Invalid Date' ? new Date(Number.NaN) : new Date(current.v)
      case 'regexp': {
        const matched = /^\/(.*)\/([a-z]*)$/s.exec(current.v)
        return new RegExp(matched?.[1] ?? current.v, matched?.[2] ?? '')
      }
      case 'err': {
        const err = new Error(current.message)
        err.name = current.name
        if (current.stack) err.stack = current.stack

        // 自定义字段（err.code / err.status）和 cause 一并还原，排查时才不用手抄
        for (const [key, value] of Object.entries(current.extra ?? {})) {
          ;(err as unknown as Record<string, unknown>)[key] = build(value)
        }
        if (current.cause) (err as { cause?: unknown }).cause = build(current.cause)

        return err
      }
      case 'weak':
        return `[${current.ctor}]`
      case 'promise':
        return '[Promise]'
      case 'bin': {
        if (!current.b64) return `[${current.ctor} ${current.byteLength}B]`
        const binary = atob(current.b64)
        const bytes = new Uint8Array(binary.length)
        for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i)
        return bytes
      }
      case 'cut':
        return `[截断: ${current.v}]`
      case 'ref': {
        if (built.has(current.v)) return built.get(current.v)
        const target = table.get(current.v)
        return target ? build(target) : `[ref#${current.v}]`
      }
      case 'arr': {
        const arr: unknown[] = []
        if (current.id !== undefined) built.set(current.id, arr)
        for (const item of current.v) arr.push(build(item))
        return arr
      }
      case 'set': {
        const set = new Set<unknown>()
        if (current.id !== undefined) built.set(current.id, set)
        for (const item of current.v) set.add(build(item))
        return set
      }
      case 'map': {
        const map = new Map<unknown, unknown>()
        if (current.id !== undefined) built.set(current.id, map)
        for (const [k, v] of current.v) map.set(build(k), build(v))
        return map
      }
      case 'obj': {
        const obj: Record<string, unknown> = {}
        if (current.id !== undefined) built.set(current.id, obj)
        for (const [k, v] of Object.entries(current.v)) obj[k] = build(v)
        return obj
      }
      default:
        return undefined
    }
  }

  return build(node)
}

/* ------------------------------------------------------------------ */
/*                              文本化                                  */
/* ------------------------------------------------------------------ */

export interface ToTextOptions {
  /** 文本化最大深度，超出用占位字符串顶上 */
  maxDepth?: number
  /** 首行缩进 */
  indent?: string
}

/**
 * 信封树 → 合法的 JS 字面量。
 *
 * 输出要能直接粘进控制台、也能整段写进 `.js` 文件执行，所以每个分支都必须是合法语法。
 * 函数 / Promise / 二进制 / 循环引用 / 截断这些没法用字面量表达的东西，
 * 统一退化成带类型前缀的字符串，而不是 `[Function foo]`、`→ #1` 这类非法占位符。
 */
export function toText(node: SerializedValue, options: ToTextOptions = {}): string {
  const maxDepth = options.maxDepth ?? 8

  /** 合法标识符原样输出，其余 key 加引号 */
  const key = (name: string): string =>
    /^[A-Za-z_$][\w$]*$/.test(name) ? name : JSON.stringify(name)

  /** 无法用字面量表达的值，退化成字符串 */
  const label = (text: string): string => JSON.stringify(text)

  const walk = (n: SerializedValue, depth: number, indent: string): string => {
    const nextIndent = `${indent}  `

    // 深度闸门必须在所有分支之前：否则 30 层嵌套会整棵树铺出来
    if (depth > maxDepth) return label(`[… 嵌套超过 ${maxDepth} 层]`)

    switch (n.t) {
      case 'undef':
        return 'undefined'
      case 'null':
        return 'null'
      case 'bool':
        return String(n.v)
      case 'num':
        return `${n.v}`
      case 'bigint':
        return `${n.v}n`
      case 'str':
        return `${JSON.stringify(n.v)}${n.len !== undefined ? ` /* 共 ${n.len} 字符 */` : ''}`
      case 'sym': {
        // v 是 `Symbol(desc)` 这样的展示串，直接照抄会变成未定义标识符
        const desc = /^Symbol\((.*)\)$/s.exec(n.v)?.[1]?.trim() ?? ''
        return desc ? `Symbol(${JSON.stringify(desc)})` : 'Symbol()'
      }
      case 'fn':
        return label(`[Function${n.name ? `: ${n.name}` : ''}]`)
      case 'date':
        return n.v === 'Invalid Date' ? 'new Date(NaN)' : `new Date(${JSON.stringify(n.v)})`
      case 'regexp':
        return n.v
      case 'weak':
        return label(`[${n.ctor}]`)
      case 'promise':
        return label('[Promise]')
      case 'bin':
        return label(`[${n.ctor} ${n.byteLength}B${n.preview ? ` ${n.preview}` : ''}]`)
      case 'cut':
        return label(`[截断: ${n.v}]`)
      case 'ref':
        return label(`[→ #${n.v}${n.circ ? ' 循环引用' : ''}]`)
      case 'err': {
        // 保留 Error 身份，自定义字段和 cause 一并挂上去
        const props = [`name: ${JSON.stringify(n.name)}`]
        if (n.stack) props.push(`stack: ${JSON.stringify(n.stack)}`)
        for (const [k, v] of Object.entries(n.extra ?? {})) {
          props.push(`${key(k)}: ${walk(v, depth + 1, nextIndent)}`)
        }
        if (n.cause) props.push(`cause: ${walk(n.cause, depth + 1, nextIndent)}`)
        return `Object.assign(new Error(${JSON.stringify(n.message)}), {\n${nextIndent}${props.join(
          `,\n${nextIndent}`,
        )}\n${indent}})`
      }
      case 'arr': {
        if (n.v.length === 0) return '[]'
        const items = n.v.map((item) => walk(item, depth + 1, nextIndent))
        // 被截断的部分用字符串占位，数组语法依旧成立
        if (n.more) items.push(label(`[+${n.more} 项未返回]`))
        return `[\n${nextIndent}${items.join(`,\n${nextIndent}`)}\n${indent}]`
      }
      case 'set': {
        const ctor = n.ctor ?? 'Set'
        if (!n.v.length) return `new ${ctor}()`
        const items = n.v.map((item) => walk(item, depth + 1, nextIndent))
        if (n.more) items.push(label(`[+${n.more} 项未返回]`))
        return `new ${ctor}([\n${nextIndent}${items.join(`,\n${nextIndent}`)}\n${indent}])`
      }
      case 'map': {
        const ctor = n.ctor ?? 'Map'
        if (!n.v.length) return `new ${ctor}()`
        const pairs = n.v.map(
          ([k, v]) => `[${walk(k, depth + 1, nextIndent)}, ${walk(v, depth + 1, nextIndent)}]`,
        )
        if (n.more) pairs.push(`[${label(`[+${n.more} 项未返回]`)}, null]`)
        return `new ${ctor}([\n${nextIndent}${pairs.join(`,\n${nextIndent}`)}\n${indent}])`
      }
      case 'obj': {
        // 构造器名写进字面量就是非法语法（`Foo { ... }`），降级成尾部注释
        const notes = [
          n.ctor ? `构造器: ${n.ctor}` : '',
          n.fromProto?.length ? `含原型 getter: ${n.fromProto.join(', ')}` : '',
        ].filter(Boolean)
        const note = notes.length ? ` /* ${notes.join('; ')} */` : ''

        const entries = Object.entries(n.v)
        if (entries.length === 0) return `{}${note}`

        const lines = entries.map(([k, v]) => `${key(k)}: ${walk(v, depth + 1, nextIndent)}`)
        if (n.more) lines.push(`${key(`[+${n.more} 个字段未返回]`)}: ${n.more}`)
        return `{\n${nextIndent}${lines.join(`,\n${nextIndent}`)}\n${indent}}${note}`
      }
      default:
        return 'undefined'
    }
  }

  return walk(node, 0, options.indent ?? '')
}

/**
 * 一行摘要，给表格单元格 / 折叠状态用。
 */
export function summarize(node: SerializedValue, maxLength = 120): string {
  const one = (n: SerializedValue): string => {
    switch (n.t) {
      case 'undef':
        return 'undefined'
      case 'null':
        return 'null'
      case 'bool':
        return String(n.v)
      case 'num':
        return `${n.v}`
      case 'bigint':
        return `${n.v}n`
      case 'str':
        return JSON.stringify(n.v.length > 60 ? `${n.v.slice(0, 60)}…` : n.v)
      case 'sym':
        return n.v
      case 'fn':
        return `ƒ ${n.name ?? '(anonymous)'}()`
      case 'date':
        return n.v
      case 'regexp':
        return n.v
      case 'err':
        return `${n.name}: ${n.message}`
      case 'weak':
        return n.ctor
      case 'promise':
        return 'Promise'
      case 'bin':
        return `${n.ctor}(${n.byteLength}B)`
      case 'cut':
        return `截断: ${n.v}`
      case 'ref':
        return `→ #${n.v}${n.circ ? ' ↻' : ''}`
      case 'arr':
        return `Array(${n.v.length + (n.more ?? 0)})`
      case 'set':
        return `${n.ctor ?? 'Set'}(${n.v.length + (n.more ?? 0)})`
      case 'map':
        return `${n.ctor ?? 'Map'}(${n.v.length + (n.more ?? 0)})`
      case 'obj': {
        const keys = Object.keys(n.v)
        const size = keys.length + (n.more ?? 0)
        if (keys.length === 0) return `${n.ctor ?? 'Object'} {}`
        const head = keys.slice(0, 3).join(', ')
        return `${n.ctor ?? ''} { ${head}${size > 3 ? ' …' : ''} }`.trim()
      }
      default:
        return ''
    }
  }

  const text = one(node)
  return text.length > maxLength ? `${text.slice(0, maxLength)}…` : text
}

/**
 * 把整棵树拍平成纯文本，供搜索框做关键词匹配。
 * 带预算上限，避免一条超大树把输入框卡死。
 */
export function flattenText(node: SerializedValue, budget = 20000): string {
  const parts: string[] = []
  let size = 0

  const push = (text: string): boolean => {
    if (size + text.length > budget) return false
    size += text.length
    parts.push(text)
    return true
  }

  const walk = (n: SerializedValue): boolean => {
    switch (n.t) {
      case 'str':
        return push(n.v)
      case 'num':
      case 'bigint':
      case 'bool':
      case 'sym':
      case 'date':
      case 'regexp':
        return push(String(n.v))
      case 'null':
        return push('null')
      case 'undef':
        return push('undefined')
      case 'fn':
        return push(`${n.name ?? ''} ${n.v}`)
      case 'bin':
        // 二进制内容搜不到原文，但类型名和十六进制头部对排查足够有用
        return push(`${n.ctor} ${n.preview ?? ''}`)
      case 'err':
        if (!push(`${n.name} ${n.message} ${n.stack ?? ''}`)) return false
        for (const item of Object.values(n.extra ?? {})) if (!walk(item)) return false
        return n.cause ? walk(n.cause) : true
      case 'arr':
      case 'set':
        for (const item of n.v) if (!walk(item)) return false
        return true
      case 'map':
        for (const [k, v] of n.v) {
          if (!walk(k)) return false
          if (!walk(v)) return false
        }
        return true
      case 'obj':
        for (const [k, v] of Object.entries(n.v)) {
          if (!push(k)) return false
          if (!walk(v)) return false
        }
        return true
      default:
        return true
    }
  }

  walk(node)
  return parts.join(' ')
}

/** 叶子节点的展示文本（不含结构） */
export function leafText(node: SerializedValue): string {
  return summarize(node, 200)
}
