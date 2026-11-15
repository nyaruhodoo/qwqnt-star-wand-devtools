<template>
  <!-- 可展开节点 -->
  <div v-if="isExpandable" class="vt-node">
    <div class="vt-row" @click="toggle">
      <span class="vt-caret">{{ expanded ? '▾' : '▸' }}</span>
      <span v-if="label !== undefined" class="vt-key" :class="{ 'vt-dim': dim }">{{ label }}:</span>
      <span class="vt-type">{{ typeLabel }}</span>
      <span class="vt-summary">{{ summary }}</span>
    </div>

    <div v-if="expanded" class="vt-children">
      <div v-for="(child, index) in children" :key="index" class="vt-child">
        <ValueTree
          v-if="child.prefixNode"
          :node="child.prefixNode"
          :depth="depth + 1"
          :path-ids="nextPathIds"
        />
        <span v-if="child.prefixNode" class="vt-arrow">=&gt;</span>
        <ValueTree
          :node="child.node"
          :label="child.key || undefined"
          :depth="depth + 1"
          :path-ids="nextPathIds"
          :dim="child.fromProto"
        />
      </div>

      <div v-if="moreText" class="vt-more">{{ moreText }}</div>
      <div v-if="stackText" class="vt-stack">{{ stackText }}</div>
    </div>
  </div>

  <!-- 引用节点 -->
  <div v-else-if="node.t === 'ref'" class="vt-node vt-inline">
    <span v-if="label !== undefined" class="vt-key">{{ label }}:</span>
    <span
      class="vt-val vt-ref"
      :class="{ 'vt-cycle': isCycle }"
      :title="isCycle ? '循环引用，不再展开' : '点击展开被引用的节点'"
      @click="!isCycle && (expanded = !expanded)"
    >
      {{ isCycle ? `↻ #${node.v} 循环` : `→ #${node.v}` }}
    </span>
    <div v-if="expanded && target && !isCycle" class="vt-children">
      <ValueTree :node="target" :depth="depth + 1" :path-ids="nextPathIds" />
    </div>
  </div>

  <!-- 叶子节点 -->
  <div v-else class="vt-node vt-inline">
    <span v-if="label !== undefined" class="vt-key" :class="{ 'vt-dim': dim }">{{ label }}:</span>
    <span class="vt-val" :class="toneClass" :title="titleText">{{ text }}</span>
    <span v-if="moreText" class="vt-more">{{ moreText }}</span>
    <span v-if="node.t === 'bin' && node.preview" class="vt-bin-preview">{{ node.preview }}</span>
  </div>
</template>

<script lang="ts" setup>
import { computed, inject, provide, ref } from 'vue'
import type { SerializedValue } from './serialize'
import { buildIdTable, isContainer, leafText, summarize } from './serialize'

const ID_TABLE = Symbol('value-tree-id-table')

const props = withDefaults(
  defineProps<{
    node: SerializedValue
    /** 字段名 / 数组下标 */
    label?: string
    depth?: number
    /** 当前渲染路径上的 id，用于识别循环引用 */
    pathIds?: number[]
    /** 值来自原型 getter 时淡色显示 */
    dim?: boolean
  }>(),
  { depth: 0, pathIds: () => [], dim: false, label: undefined },
)

// 根节点负责建立 id 索引，子孙节点直接复用
const injectedTable = inject<Map<number, SerializedValue> | null>(ID_TABLE, null)
if (!injectedTable) provide(ID_TABLE, buildIdTable(props.node))

const expanded = ref(props.depth < 1)

const node = computed(() => props.node)

const nextPathIds = computed(() => {
  const id = (props.node as { id?: number }).id
  return typeof id === 'number' ? [...props.pathIds, id] : props.pathIds
})

const isCycle = computed(() => props.node.t === 'ref' && props.pathIds.includes(props.node.v))

const target = computed(() => {
  if (props.node.t !== 'ref') return undefined
  return injectedTable?.get(props.node.v)
})

const isExpandable = computed(() => {
  if (props.node.t === 'ref') return Boolean(target.value) && !isCycle.value
  if (isContainer(props.node)) return true
  if (props.node.t === 'err') {
    return Boolean(props.node.cause) || Object.keys(props.node.extra ?? {}).length > 0
  }

  return false
})

const children = computed<Array<{ key: string; node: SerializedValue; fromProto?: boolean; prefixNode?: SerializedValue }>>(() => {
  const current = props.node

  if (current.t === 'arr' || current.t === 'set') {
    return current.v.map((item, index) => ({ key: `${index}`, node: item }))
  }

  if (current.t === 'map') {
    return current.v.map(([keyNode, valueNode]) => ({ key: '', node: valueNode, prefixNode: keyNode }))
  }

  if (current.t === 'obj') {
    const proto = new Set(current.fromProto ?? [])
    return Object.entries(current.v).map(([key, value]) => ({
      key,
      node: value,
      fromProto: proto.has(key),
    }))
  }

  if (current.t === 'err') {
    const entries = Object.entries(current.extra ?? {}).map(([key, value]) => ({ key, node: value }))
    if (current.cause) entries.push({ key: 'cause', node: current.cause })

    return entries
  }

  return []
})

const typeLabel = computed(() => {
  const current = props.node

  switch (current.t) {
    case 'arr':
      return 'Array'
    case 'set':
      return current.ctor ?? 'Set'
    case 'map':
      return current.ctor ?? 'Map'
    case 'obj':
      return current.ctor ?? 'Object'
    case 'err':
      return current.name
    default:
      return current.t
  }
})

const summary = computed(() => summarize(props.node))

const moreText = computed(() => {
  const current = props.node
  if (!('more' in current) || !current.more) return ''
  return current.t === 'obj' ? `…还有 ${current.more} 个字段` : `…还有 ${current.more} 项`
})

const stackText = computed(() => {
  if (props.node.t !== 'err' || !props.node.stack) return ''
  return props.node.stack.split('\n').slice(0, 4).join('\n')
})

const text = computed(() => {
  const current = props.node

  if (current.t === 'err') return `${current.name}: ${current.message}`
  if (current.t === 'cut') return `截断：${current.v}`
  if (current.t === 'bin') return `${current.ctor}(${current.byteLength}B)`

  return leafText(current)
})

const titleText = computed(() => {
  const current = props.node
  if (current.t === 'str') return current.len ? `共 ${current.len} 字符` : current.v
  if (current.t === 'fn') return current.v
  if (current.t === 'cut') return '该节点因超出预算被截断'

  return text.value
})

const toneClass = computed(() => {
  switch (props.node.t) {
    case 'str':
      return 'vt-str'
    case 'num':
    case 'bigint':
      return 'vt-num'
    case 'bool':
      return 'vt-bool'
    case 'null':
    case 'undef':
      return 'vt-empty'
    case 'date':
    case 'regexp':
      return 'vt-date'
    case 'fn':
      return 'vt-fn'
    case 'err':
      return 'vt-err'
    case 'cut':
      return 'vt-cut'
    case 'bin':
      return 'vt-bin'
    default:
      return ''
  }
})

const toggle = () => {
  expanded.value = !expanded.value
}
</script>

<style scoped>
.vt-node {
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-size: 12px;
  line-height: 1.6;
  color: #303133;
}

.vt-inline {
  display: flex;
  align-items: baseline;
  gap: 4px;
  flex-wrap: wrap;
}

.vt-row {
  display: flex;
  align-items: baseline;
  gap: 4px;
  cursor: pointer;
  user-select: none;
}

.vt-row:hover {
  background-color: #f5f7fa;
}

.vt-caret {
  width: 10px;
  color: #909399;
  flex-shrink: 0;
}

.vt-children {
  padding-left: 14px;
  border-left: 1px dashed #dcdfe6;
  margin-left: 4px;
}

.vt-child {
  display: flex;
  align-items: baseline;
  gap: 4px;
  flex-wrap: wrap;
}

.vt-key {
  color: #7b3fbf;
}

.vt-dim {
  color: #a8abb2;
}

.vt-type {
  color: #e6a23c;
}

.vt-summary {
  color: #909399;
}

.vt-arrow {
  color: #909399;
}

.vt-val {
  word-break: break-all;
}

.vt-str {
  color: #2f9e44;
}

.vt-num {
  color: #1668dc;
}

.vt-bool {
  color: #d48806;
}

.vt-empty {
  color: #a8abb2;
  font-style: italic;
}

.vt-date {
  color: #08979c;
}

.vt-fn {
  color: #722ed1;
}

.vt-err {
  color: #d03050;
}

.vt-cut {
  color: #d46b08;
  font-style: italic;
}

.vt-bin {
  color: #595959;
}

.vt-bin-preview {
  color: #a8abb2;
  font-size: 11px;
}

.vt-ref {
  color: #1668dc;
  cursor: pointer;
  text-decoration: underline dotted;
}

.vt-cycle {
  color: #a8abb2;
  cursor: default;
  text-decoration: none;
}

.vt-more {
  color: #a8abb2;
  font-style: italic;
}

.vt-stack {
  white-space: pre-wrap;
  color: #909399;
  font-size: 11px;
}
</style>
