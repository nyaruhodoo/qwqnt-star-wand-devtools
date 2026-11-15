<template>
  <div class="flex flex-col h-full gap-4">
    <div class="flex items-center gap-4">
      <el-input v-model="filterPath" placeholder="匹配函数路径" clearable style="width: 300px" />
      <el-input
        v-model="filterRes"
        placeholder="匹配参数/响应结果"
        clearable
        style="width: 300px"
      />
    </div>

    <div class="flex items-center gap-4">
      <el-checkbox-group v-model="filterTypes">
        <el-checkbox-button label="Function" value="Function" />
        <el-checkbox-button label="AsyncFunction" value="AsyncFunction" />
        <el-checkbox-button label="Service" value="Service" />
        <el-checkbox-button label="Listener" value="Listener" />
      </el-checkbox-group>

      <el-checkbox-group v-model="filterStatus">
        <el-checkbox-button label="ok" value="ok" />
        <el-checkbox-button label="error" value="error" />
        <el-checkbox-button label="cancel" value="cancel" />
      </el-checkbox-group>
    </div>

    <div>
      <el-button type="primary" @click="clearLogs"
        >清空 ({{ filteredLogs.length }}/{{ logs.length }})</el-button
      >

      <el-button @click="autoScroll = !autoScroll" class="ml-auto mr-4">
        {{ autoScroll ? '自动滚动中' : '已暂停滚动' }}
      </el-button>
    </div>

    <el-auto-resizer class="flex-1">
      <template #default="{ height, width }">
        <el-table-v2
          v-model:expanded-row-keys="expandedRowKeys"
          :columns="columns"
          :data="filteredLogs"
          :width="width"
          :height="height"
          fixed
          row-key="id"
          :expand-column-key="columns[0]?.key"
          :estimated-row-height="50"
          ref="tableRef"
          @row-expand="onRowExpand"
        >
          <template #row="props">
            <Row v-bind="props" />
          </template>
        </el-table-v2>
      </template>
    </el-auto-resizer>
  </div>
</template>

<script lang="tsx" setup>
import { dayjs, ElMessage, type TableV2Instance } from 'element-plus'
import { computed, nextTick, ref, watch, type VNodeChild } from 'vue'
import type { DetailRow, FnTraceItem } from './types'
import 'element-plus/es/components/message/style/css'
import { matchValue } from './utils'
import { flattenText, toText } from './serialize'
import ValueTree from './ValueTree.vue'

const tableRef = ref<TableV2Instance>()
const { logs } = defineProps<{
  logs: FnTraceItem[]
  clearLogs: () => void
}>()

const autoScroll = ref(true)
const expandedRowKeys = ref<string[]>([])
const filterPath = ref('')
const filterRes = ref('')
const filterTypes = ref<string[]>(['Function', 'AsyncFunction', 'Listener', 'Service'])
const filterStatus = ref<string[]>(['ok', 'error', 'cancel'])

/**
 * 搜索结果文本是整棵信封树拍平后的内容，代价比字符串大，
 * 因此按记录对象缓存一次：只有输入了关键词才会真正计算。
 */
const haystackCache = new WeakMap<FnTraceItem, string>()
const haystackOf = (item: FnTraceItem) => {
  const cached = haystackCache.get(item)
  if (cached !== undefined) return cached

  const text = [
    item.callPath ?? '',
    flattenText(item.requestParams),
    flattenText(item.responseParams),
  ].join('\n')

  haystackCache.set(item, text)
  return text
}

const filteredLogs = computed(() => {
  return logs
    .filter((item) => {
      // 1. 路径匹配
      const matchPath = matchValue(item.callPath, filterPath.value)

      // 2. 类型匹配
      const matchType = filterTypes.value.includes(item.type ?? '')

      // 3. 状态匹配
      const matchStatus = filterStatus.value.includes(item.status ?? '')

      // 4. 结果匹配：在整棵信封树里搜，而不是只看顶层的那个字符串
      const matchRes = !filterRes.value || matchValue(haystackOf(item), filterRes.value)

      return matchPath && matchType && matchStatus && matchRes
    })
    .map<FnTraceItem>((item) => {
      item.children = [
        {
          id: `${item.id}-detail-content`,
          isDetail: true,
          requestParams: item.requestParams,
          responseParams: item.responseParams,
          truncated: item.truncated,
          callPath: item.callPath,
        },
      ]
      return item
    })
})

const columns = [
  {
    key: 'callTime',
    dataKey: 'callTime',
    title: '触发时间',
    width: 250,
    cellRenderer: ({ rowData }: { rowData: FnTraceItem }) => {
      return <span>{dayjs(rowData.callTime).format('HH:mm:ss.SSS')}</span>
    },
  },
  {
    key: 'callPath',
    dataKey: 'callPath',
    title: '调用路径',
    width: 350,
    cellRenderer: ({ rowData }: { rowData: FnTraceItem }) => {
      return (
        <el-tooltip effect="dark" content={rowData.callPath} placement="top">
          <span class="cursor-pointer" onClick={() => copyToClipboard(rowData.callPath)}>
            {rowData.callPath?.split('/').pop()}
          </span>
        </el-tooltip>
      )
    },
  },
  {
    key: 'type',
    dataKey: 'type',
    title: '函数类型',
    width: 200,
    cellRenderer: ({ rowData }: { rowData: FnTraceItem }) => {
      return (
        <span class="flex items-center gap-2">
          {rowData.type}
          {rowData.truncated && (
            <el-tag type="warning" size="small" disable-transitions>
              截断
            </el-tag>
          )}
        </span>
      )
    },
  },
  {
    key: 'status',
    dataKey: 'status',
    title: '状态',
    width: 150,
    cellRenderer: ({ rowData }: { rowData: FnTraceItem }) => {
      const type = {
        ok: 'success',
        error: 'danger',
        cancel: 'danger',
      }[rowData.status ?? 'ok']

      return (
        <el-tag type={type} disable-transitions>
          {rowData.status}
        </el-tag>
      )
    },
  },
  {
    key: 'action',
    dataKey: 'id',
    title: '操作',
    width: 100,
    align: 'center' as const,
    cellRenderer: ({ rowData }: { rowData: FnTraceItem }) => (
      <el-button link type="primary" onClick={() => downloadRecord(rowData)}>
        下载
      </el-button>
    ),
  },
]

/**
 * 一条记录导出成一个 `.js` 文件：请求参数与返回结果都写成真正的 JS 字面量
 * （Date 是 `new Date(...)`、Map/Set 是 `new Map([...])`、BigInt 保留 `n` 后缀），
 * 打开就能当脚本/模块跑，也可以直接粘进控制台。
 */
const downloadRecord = (item: FnTraceItem) => {
  const meta = [
    item.callPath ?? '(未知路径)',
    [
      dayjs(item.callTime).format('YYYY-MM-DD HH:mm:ss.SSS'),
      item.type,
      item.status,
      item.truncated ? '已截断' : '',
    ]
      .filter(Boolean)
      .join(' · '),
  ]

  const content = [
    '// 由 Star Wand DevTools 导出',
    ...meta.map((line) => `// ${line}`),
    '',
    `const requestParams = ${toText(item.requestParams)}`,
    '',
    `const responseParams = ${toText(item.responseParams)}`,
    '',
  ].join('\n')

  const leaf = item.callPath?.split('/').filter(Boolean).pop() ?? 'event'
  const safeLeaf = leaf.replace(/[\\/:*?"<>|\s]+/g, '_')
  const fileName = `${safeLeaf}-${dayjs(item.callTime).format('YYYYMMDD-HHmmss-SSS')}.js`

  const url = URL.createObjectURL(new Blob([content], { type: 'text/javascript' }))
  const link = document.createElement('a')
  link.href = url
  link.download = fileName
  document.body.appendChild(link)
  link.click()
  link.remove()
  // 立刻 revoke 会让部分浏览器拿不到数据，延后一拍再释放
  setTimeout(() => URL.revokeObjectURL(url), 0)

  ElMessage.success('已下载事件 JS 文件')
}

const copyToClipboard = async (text?: string) => {
  if (!text) return
  try {
    await navigator.clipboard.writeText(text)
    ElMessage.success('已复制到剪切板')
  } catch {
    ElMessage.error('复制失败')
  }
}

const Row = ({ cells, rowData }: { cells: VNodeChild; rowData: FnTraceItem | DetailRow }) => {
  if ('isDetail' in rowData && rowData.isDetail) {
    return (
      <div class="flex w-full h-[300px] p-4 gap-3 relative overflow-hidden">
        <div class="flex-1 flex flex-col min-w-0">
          <span class="flex items-center gap-2 mb-1">
            <span
              class="cursor-pointer transition-colors hover:text-blue-500"
              onClick={(e) => {
                copyToClipboard(toText(rowData.requestParams))
                e.stopPropagation()
              }}
            >
              请求参数：
            </span>
            <span class="text-xs text-gray-400">点击复制</span>
          </span>
          <div class="flex-1 overflow-auto pr-2">
            <ValueTree node={rowData.requestParams} />
          </div>
        </div>

        <div class="flex-1 flex flex-col min-w-0">
          <span class="flex items-center gap-2 mb-1">
            <span
              class="cursor-pointer transition-colors hover:text-blue-500"
              onClick={(e) => {
                copyToClipboard(toText(rowData.responseParams))
                e.stopPropagation()
              }}
            >
              响应结果：
            </span>
            <span class="text-xs text-gray-400">点击复制</span>
          </span>
          <div class="flex-1 overflow-auto pr-2">
            <ValueTree node={rowData.responseParams} />
          </div>
        </div>
      </div>
    )
  }

  return cells
}
Row.inheritAttrs = false

const onRowExpand = ({ expanded }: { expanded: boolean }) => {
  if (expanded) {
    autoScroll.value = false
  }
}

watch(
  () => filteredLogs.value.length,
  () => {
    if (autoScroll.value && tableRef.value) {
      nextTick(() => {
        const lastIndex = filteredLogs.value.length - 1
        if (lastIndex >= 0) {
          tableRef.value?.scrollToRow(lastIndex)
        }
      })
    }
  },
)
</script>

<style>
.el-table-v2__row-depth-0 {
  height: 50px;
}
.el-table-v2__expand-icon {
  margin-inline-start: 0 !important;
}
</style>
