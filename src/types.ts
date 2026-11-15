import type { SerializedValue } from './serialize'

export type FnTraceType = 'Function' | 'AsyncFunction' | 'Service' | 'Listener'
export type FnTraceStatus = 'ok' | 'error' | 'cancel'

/** 详情展开行，挂在 FnTraceItem.children 上，仅用于表格虚拟化 */
export interface DetailRow {
  id: string
  isDetail: true
  requestParams: SerializedValue
  responseParams: SerializedValue
  truncated?: boolean
  /** 该条记录的路径，方便详情里复制 */
  callPath?: string
}

export interface FnTraceItem {
  /** 线上格式版本，服务端升级后可用于兼容分支 */
  v?: number
  /** 毫秒时间戳 */
  callTime: number
  callPath?: string
  type?: FnTraceType
  status?: FnTraceStatus
  /** 已编码的请求参数信封树 */
  requestParams: SerializedValue
  /** 已编码的响应结果信封树 */
  responseParams: SerializedValue
  /** 编码时是否发生过截断（超深 / 超量 / 节点预算） */
  truncated?: boolean
  id: string
  /** 由前端在 computed 里填充，仅供 el-table-v2 展开行使用 */
  children?: DetailRow[]
}

/** 远程执行代码的回传结果 */
export interface ExecuteResultItem {
  id: string
  ok: boolean
  result: SerializedValue
  durationMs: number
  /** 前端收到的时间戳 */
  receivedAt: number
}
