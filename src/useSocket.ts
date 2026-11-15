import { ref, markRaw, onUnmounted, watch, type Ref } from 'vue'
import { io, Socket } from 'socket.io-client'
import { ElMessage } from 'element-plus'
import { normalizeNode } from './serialize'
import type { ExecuteResultItem, FnTraceItem } from './types'

/** 本地最多保留多少条记录，防止长时间挂机把内存吃满 */
const MAX_LOGS = 5000

export function useSocket({ port }: { port: Ref<number> }) {
  const logs = ref<FnTraceItem[]>([])
  const isConnected = ref(false)
  const socket = ref<Socket>()
  /** 最近一次远程执行的结果 */
  const lastResult = ref<ExecuteResultItem>()
  const executing = ref(false)

  // 初始化连接
  const connect = () => {
    if (socket.value) {
      socket.value.close()
      isConnected.value = false
    }

    socket.value = io(`http://localhost:${port.value}`, {
      transports: ['websocket'],
    })

    socket.value.on('connect', () => {
      isConnected.value = true
      console.log('✅ 已连接到 Node 调试服务端', port.value)
    })

    // 核心：监听函数追踪数据
    socket.value.on('fn-trace', (data?: Partial<FnTraceItem>) => {
      if (!data) return

      // 避免service刷屏
      if (
        data.type === 'Service' &&
        logs.value.some((i) => i.callPath === data.callPath)
      ) {
        return
      }

      logs.value.push({
        v: data.v,
        id: data.id ?? crypto.randomUUID(),
        callTime: data.callTime ?? Date.now(),
        callPath: data.callPath,
        type: data.type,
        status: data.status,
        truncated: data.truncated,
        // 旧版服务端会发字符串，normalizeNode 会自动包成字符串节点。
        // markRaw：信封树是只读快照，没必要让 Vue 深度代理几千个节点
        requestParams: markRaw(normalizeNode(data.requestParams)),
        responseParams: markRaw(normalizeNode(data.responseParams)),
      })

      if (logs.value.length > MAX_LOGS) {
        logs.value.splice(0, logs.value.length - MAX_LOGS)
      }
    })

    // 服务端队列溢出时的提示（改动前是静默丢弃）
    socket.value.on('fn-trace-dropped', ({ count }: { count?: number }) => {
      if (!count) return
      ElMessage.warning(`调试服务端队列溢出，已丢弃最早的 ${count} 条记录`)
    })

    socket.value.on('execute-result', (res?: ExecuteResultItem) => {
      if (!res) return

      executing.value = false
      lastResult.value = {
        ...res,
        result: markRaw(normalizeNode(res.result)),
        receivedAt: Date.now(),
      }

      if (res.ok) {
        ElMessage.success(`执行成功（${res.durationMs} ms）`)
      } else {
        ElMessage.error(`执行失败（${res.durationMs} ms）`)
      }
    })

    socket.value.on('disconnect', () => {
      isConnected.value = false
      executing.value = false
    })
  }

  const clearLogs = () => {
    logs.value.length = 0
  }

  /**
   * 暴露给外部：远程执行代码
   * 带上 requestId 便于把回包和这次请求对上（支持并发执行）
   */
  const executeRemoteCode = (codeString: string) => {
    if (!socket.value || !isConnected.value) {
      ElMessage.error('执行失败：Socket 未连接')
      return
    }

    executing.value = true
    socket.value.emit('execute-code', {
      code: codeString,
      id: crypto.randomUUID(),
    })
  }

  // 自动断开连接，避免组件销毁后仍在后台监听
  onUnmounted(() => {
    socket.value?.disconnect()
  })

  watch(
    port,
    () => {
      console.log('🔄 端口变更，正在重连...')
      connect()
    },
    {
      immediate: true,
    },
  )

  return {
    logs,
    isConnected,
    clearLogs,
    lastResult,
    executing,
    /** 暴露 socket 实例（ref 形式，setup 阶段还没赋值）以备不时之需 */
    socket,
    executeRemoteCode,
  }
}
