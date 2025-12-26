<template>
  <div class="flex flex-col h-full">
    <div class="flex items-center gap-4">
      <el-input v-model="filterPath" placeholder="函数路径" clearable style="width: 300px" />

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

      <el-button @click="autoScroll = !autoScroll" class="ml-auto mr-4">
        {{ autoScroll ? '自动滚动中' : '已暂停滚动' }}
      </el-button>
    </div>

    <el-auto-resizer class="flex-1">
      <template #default="{ height, width }">
        <el-table-v2
          :columns="columns"
          :data="filteredLogs"
          :width="width"
          :height="height"
          fixed
          row-key="id"
          :expand-column-key="columns[0]?.key"
          :estimated-row-height="50"
          ref="tableRef"
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
import type { FnTraceItem } from './types'
import { computed, nextTick, ref, watch } from 'vue'
import hljs from 'highlight.js/lib/core'
import javascript from 'highlight.js/lib/languages/javascript'
import 'highlight.js/styles/atom-one-dark.css'
import 'element-plus/es/components/message/style/css'
import { formatCodeLight } from './utils'
hljs.registerLanguage('javascript', javascript)

const codeHighlight = (code?: string) => {
  if (!code) return ''
  const formattedCode = formatCodeLight(code, 'javascript')
  if (hljs.getLanguage('javascript')) {
    return hljs.highlight(formattedCode, { language: 'javascript' }).value
  }
  return formattedCode
}

const tableRef = ref<TableV2Instance>()
const { logs } = defineProps<{
  logs: FnTraceItem[]
}>()

const autoScroll = ref(true)

const filterPath = ref('')
const filterTypes = ref<string[]>(['Function', 'AsyncFunction', 'Listener'])
const filterStatus = ref<string[]>(['ok', 'error', 'cancel'])

const filteredLogs = computed(() => {
  return logs
    .filter((item) => {
      // 1. 路径匹配
      const matchPath = item?.callPath?.toLowerCase().includes(filterPath.value.toLowerCase())

      // 2. 类型匹配
      const matchType = filterTypes.value.includes(item?.type ?? '')

      // 3. 状态匹配
      const matchStatus = filterStatus.value.includes(item?.status ?? '')

      return matchPath && matchType && matchStatus
    })
    .map((i) => {
      // @ts-expect-error  忽略错误
      i.children = [
        {
          id: `${i.id}-detail-content`,
          // 标记这是一个详情行，方便 Row 组件判断
          isDetail: true,
          requestParams: i.requestParams,
          responseParams: i.responseParams,
        },
      ]
      return i
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
          {rowData?.callPath?.split('/').pop()}
        </el-tooltip>
      )
    },
  },
  {
    key: 'type',
    dataKey: 'type',
    title: '函数类型',
    width: 200,
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
      }[rowData?.status || 'ok']

      return <el-tag type={type}>{rowData?.status}</el-tag>
    },
  },
]

const copyToClipboard = async (text?: string) => {
  if (!text) return
  try {
    await navigator.clipboard.writeText(text)
    ElMessage.success('已复制到剪切板')
  } catch {
    ElMessage.error('复制失败')
  }
}

const Row = ({ cells, rowData }: { cells: unknown; rowData: FnTraceItem }) => {
  // @ts-expect-error  忽略错误
  if (rowData.isDetail)
    return (
      <div class="flex flex-wrap w-full p-4 gap-3">
        <div>
          <span
            onClick={() => {
              copyToClipboard(rowData.requestParams)
            }}
          >
            请求参数：
          </span>
          <pre>
            <code v-html={codeHighlight(rowData.requestParams)} />
          </pre>
        </div>

        <div>
          <span
            onClick={() => {
              copyToClipboard(rowData.responseParams)
            }}
          >
            响应结果：
          </span>
          <pre>
            <code v-html={codeHighlight(rowData.responseParams)} />
          </pre>
        </div>
      </div>
    )

  return cells
}
Row.inheritAttrs = false

// 核心逻辑：监听数据变化，自动滚动到底部
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
  }
)
</script>

<style>
.el-table-v2__row-depth-0 {
  height: 50px;
}
.el-table-v2__expand-icon {
  margin-inline-start: 0 !important;
}
pre {
  white-space: pre-wrap !important; /* 保留空格但允许换行 */
  word-break: break-all !important; /* 强制在单词内换行，防止长字符串撑破容器 */
  margin: 4px 0;
  overflow: hidden; /* 防止内部出现滚动条，让高度由内容决定 */
}
</style>
