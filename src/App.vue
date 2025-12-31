<template>
  <div class="flex h-full p-5">
    <el-splitter lazy>
      <el-splitter-panel size="75%" class="flex flex-col gap-4">
        <header>
          <div class="flex items-center gap-4">
            <el-tag :type="isConnected ? 'success' : 'danger'" variant="light" class="status-tag">
              <span class="dot" :class="{ 'is-active': isConnected }"></span>
              {{ isConnected ? '已链接' : '未链接' }}
            </el-tag>

            <!-- <el-input-number
              v-model="port"
              :min="1024"
              :max="65535"
              controls-position="right"
              style="width: 130px"
            >
              <template #prefix>Port:</template>
            </el-input-number> -->
          </div>
        </header>

        <virtualized-table :logs="logs" :clearLogs="clearLogs" />
      </el-splitter-panel>

      <el-splitter-panel>
        <div class="flex flex-col h-full gap-4">
          <el-button type="primary" @click="executeRemoteCode(code)">执行代码</el-button>

          <CodeEditor
            v-model:value="code"
            language="javascript"
            theme="vs-dark"
            :options="{
              fontSize: 14,
              lineNumbers: 'on',
              tabSize: 2,
              autoIndent: true,
              minimap: { enabled: false },
              scrollBeyondLastLine: false,
              wordWrap: 'on',
              theme: 'vs-dark',
              // 启用代码补全提示（基础开关）
              quickSuggestions: {
                other: true,
                comments: true,
                strings: true,
              },
              // 启用参数提示（比如函数入参）
              parameterHints: { enabled: true },
              // 实时显示错误提示
              showErrorDecorations: true,
              automaticLayout: true,
            }"
          />
        </div>
      </el-splitter-panel>
    </el-splitter>
  </div>
</template>

<script lang="ts" setup>
import { ref } from 'vue'
import { CodeEditor } from 'monaco-editor-vue3'
import hljs from 'highlight.js/lib/core'
import javascript from 'highlight.js/lib/languages/javascript'
import 'highlight.js/styles/atom-one-dark.css'
import VirtualizedTable from './VirtualizedTable.vue'
import { useSocket } from './useSocket'

hljs.registerLanguage('javascript', javascript)

const port = ref(3666)
const { isConnected, executeRemoteCode, logs, clearLogs } = useSocket({
  port,
})
const code = ref(`// 代码包裹在 async 函数中执行，需要返回值记得 return
console.log('隐藏着黑暗力量的钥匙啊，在我面前显示你真正的力量，跟你定下约定的小樱命令你，封印解除！');
`)
</script>

<style>
.el-collapse {
  border: none;
}

.status-tag {
  display: flex;
  align-items: center;
  gap: 8px;
  font-weight: bold;
}

.dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background-color: #f56c6c;
  display: inline-block;

  &.is-active {
    background-color: #67c23a;
    box-shadow: 0 0 8px #67c23a;
    animation: pulse 2s infinite;
  }
}

@keyframes pulse {
  0% {
    opacity: 1;
  }
  50% {
    opacity: 0.5;
  }
  100% {
    opacity: 1;
  }
}
</style>
