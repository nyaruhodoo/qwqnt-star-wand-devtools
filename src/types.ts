export interface FnTraceItem {
  callTime?: string
  callPath?: string
  type?: 'Function' | 'AsyncFunction' | 'Service' | 'Listener'
  status?: 'ok' | 'error' | 'cancel'
  requestParams?: string
  responseParams?: string
  isFormatted?: boolean
  id?: string
}
