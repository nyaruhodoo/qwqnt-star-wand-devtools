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
  clearLogs: () => void
}>()

const autoScroll = ref(true)
const expandedRowKeys = ref<string[]>([])
const filterPath = ref('')
const filterRes = ref('')
const filterTypes = ref<string[]>(['Function', 'AsyncFunction', 'Listener', 'Service'])
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

      // 4. 结果匹配
      const matchRes =
        item?.requestParams?.includes(filterRes.value) ||
        item?.responseParams?.includes(filterRes.value)

      return matchPath && matchType && matchStatus && matchRes
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
    // sortable: true,
  },
  {
    key: 'callPath',
    dataKey: 'callPath',
    title: '调用路径',
    width: 350,
    cellRenderer: ({ rowData }: { rowData: FnTraceItem }) => {
      return (
        <el-tooltip effect="dark" content={rowData.callPath} placement="top">
          <span
            class="cursor-pointer"
            onClick={() => {
              copyToClipboard(rowData.callPath)
            }}
          >
            {rowData?.callPath?.split('/').pop()}
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
      <div class="flex flex-wrap w-full p-4 gap-3 relative">
        <div>
          <span
            class="cursor-pointer transition-colors hover:text-blue-500"
            onClick={(e) => {
              copyToClipboard(rowData.requestParams)
              e.stopPropagation()
            }}
          >
            请求参数：
          </span>
          <pre>
            <code v-html={codeHighlight(rowData.requestParams)} />
          </pre>
        </div>

        <div>
          <span class="cursor-pointer transition-colors hover:text-blue-500">响应结果：</span>
          <pre>
            <code v-html={codeHighlight(rowData.responseParams)} />
          </pre>
        </div>
      </div>
    )

  return cells
}
Row.inheritAttrs = false

let timerId: number | undefined

const onRowExpand = ({ expanded }: { expanded: boolean }) => {
  if (expanded) {
    autoScroll.value = false
    clearTimeout(timerId)
  } else {
    // timerId = setTimeout(() => {
    //   autoScroll.value = true
    // }, 5000)
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
