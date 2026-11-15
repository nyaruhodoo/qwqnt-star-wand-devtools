import { ref, markRaw, onUnmounted, watch, type Ref } from 'vue'
import { io, Socket } from 'socket.io-client'
import { ElMessage } from 'element-plus'
import { normalizeNode, decodeValue } from './serialize'
import type { ExecuteResultItem, FnTraceItem } from './types'

/** 本地最多保留多少条记录，防止长时间挂机把内存吃满 */
const MAX_LOGS = 5000

export function useSocket({ port, token }: { port: Ref<number>; token: string }) {
  const logs = ref<FnTraceItem[]>([])
  const isConnected = ref(false)
  const socket = ref<Socket>()
  /** 鉴权失败 / 缺少令牌时的提示文案，非空即代表连不上是有原因的 */
  const authError = ref('')
  const executing = ref(false)

  // 初始化连接
  const connect = () => {
    if (socket.value) {
      socket.value.close()
      isConnected.value = false
    }

    // 没有令牌连上去也只会被服务端踢掉，不如直接把原因说清楚
    if (!token) {
      authError.value = '缺少访问令牌：请从 QQ 设置面板点击「DevTools」重新打开本页面'
      return
    }

    authError.value = ''

    socket.value = io(`http://localhost:${port.value}`, {
      transports: ['websocket'],
      // 令牌走 CONNECT 包体，不会出现在 URL 里
      auth: { token },
      // 端口变了 / 令牌过期时不要无限重试
      reconnectionAttempts: 10,
    })

    socket.value.on('connect', () => {
      isConnected.value = true
      authError.value = ''
      console.log('✅ 已连接到 Node 调试服务端', port.value)
    })

    socket.value.on('connect_error', (err: Error) => {
      isConnected.value = false

      const message = err?.message ?? ''
      if (message.includes('invalid-token')) {
        authError.value = '访问令牌无效或已过期：QQ 重启后令牌会变，请重新点击「DevTools」打开本页面'
      } else if (message.includes('origin-not-allowed')) {
        authError.value = '当前页面来源不被允许，请从 QQ 设置面板打开 DevTools'
      } else {
        authError.value = `无法连接调试服务端（localhost:${port.value}）：${message || '未知错误'}`
      }
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

      // 结果只走浏览器控制台：面板里不再渲染一份，省掉一次额外的查看操作。
      // decodeValue 还原成真 JS 值，控制台里能直接展开/继续调用它的方法。
      const value = decodeValue(normalizeNode(res.result))
      const label = `${res.ok ? '✅ 执行成功' : '❌ 执行失败'}（${res.durationMs} ms）`
      if (res.ok) console.log(label, value)
      else console.error(label, value)
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
    authError,
    clearLogs,
    executing,
    /** 暴露 socket 实例（ref 形式，setup 阶段还没赋值）以备不时之需 */
    socket,
    executeRemoteCode,
  }
}
