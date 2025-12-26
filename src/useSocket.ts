import { ref, onUnmounted, watch, type Ref } from 'vue'
import { io, Socket } from 'socket.io-client'
import type { FnTraceItem } from './types'

export function useSocket({ port }: { port: Ref<number> }) {
  const logs = ref<FnTraceItem[]>([])
  const isConnected = ref(false)
  const socket = ref<Socket>()

  // 初始化连接
  const connect = () => {
    // 1. 如果已有连接，先断开
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
    socket.value.on('fn-trace', (data?: FnTraceItem) => {
      if (!data) return

      logs.value.push({
        ...data,
        isFormatted: false,
      })
    })

    // 2. 监听远程控制台输出 (console-log)
    socket.value.on('console-log', (data: { type: string; content: string; time: number }) => {
      // 你可以在这里处理远程日志，例如存入专门的 consoleLogs 数组
      // 这里暂时演示直接打印到浏览器控制台
      console.log(`[Remote Node ${data.type.toUpperCase()}]`, data.content)
    })

    // 3. 监听执行结果
    socket.value.on('execute-result', (res: { success: boolean; result: string }) => {
      console.log('🚀 执行结果回传:', new Function(`return ${res.result}`)())
    })

    socket.value.on('disconnect', () => {
      isConnected.value = false
    })
  }

  const clearLogs = () => {
    logs.value = []
  }

  /**
   * 暴露给外部：远程执行代码
   */
  const executeRemoteCode = (codeString: string) => {
    if (socket.value && isConnected.value) {
      socket.value.emit('execute-code', codeString)
    } else {
      console.error('❌ 执行失败：Socket 未连接')
    }
  }

  // 自动断开连接，避免组件销毁后仍在后台监听
  onUnmounted(() => {
    if (socket.value) {
      socket.value.disconnect()
    }
  })

  watch(
    port,
    () => {
      console.log('🔄 端口变更，正在重连...')
      connect()
    },
    {
      immediate: true,
    }
  )

  return {
    logs,
    isConnected,
    clearLogs,
    socket: socket.value, // 暴露原始 socket 实例以备不时之需
    executeRemoteCode,
  }
}
