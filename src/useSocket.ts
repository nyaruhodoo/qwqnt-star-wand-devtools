import { ref, onUnmounted, watch, type Ref } from 'vue'
import { io, Socket } from 'socket.io-client'
import type { FnTraceItem } from './types'

export function useSocket({ port }: { port: Ref<number> }) {
  const logs = ref<FnTraceItem[]>([])
  const isConnected = ref(false)
  const socket = ref<Socket>()

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
    socket.value.on('fn-trace', (data?: FnTraceItem) => {
      if (!data) return

      // 避免service刷屏
      if (
        data.type === 'Service' &&
        logs.value.find((i) => {
          return i.callPath === data.callPath
        })
      ) {
        return
      }

      logs.value.push({
        ...data,
        isFormatted: false,
      })
    })

    socket.value.on('execute-result', (res: { success: boolean; res: unknown }) => {
      console.log('🚀 执行结果回传:', res)
    })

    socket.value.on('disconnect', () => {
      isConnected.value = false
    })
  }

  const clearLogs = () => {
    logs.value.length = 0
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
