<template>
  <div class="flex h-full p-5">
    <el-splitter lazy>
      <el-splitter-panel size="75%" class="flex flex-col gap-4">
        <header class="flex flex-col gap-3">
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

          <div v-if="authError" class="auth-error">
            <span class="auth-error-title">连接被拒绝</span>
            <span>{{ authError }}</span>
          </div>
        </header>

        <virtualized-table :logs="logs" :clearLogs="clearLogs" />
      </el-splitter-panel>

      <el-splitter-panel>
        <div class="flex flex-col h-full gap-4">
          <el-button
            type="primary"
            class="w-full"
            :loading="executing"
            :disabled="!isConnected"
            @click="executeRemoteCode(code)"
          >
            执行代码
          </el-button>

          <div class="flex-1 min-h-0">
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
        </div>
      </el-splitter-panel>
    </el-splitter>
  </div>
</template>

<script lang="ts" setup>
import { CodeEditor } from "monaco-editor-vue3";
import { ref } from "vue";
import { useSocket } from "./useSocket";
import VirtualizedTable from "./VirtualizedTable.vue";

// 获取 URL 查询参数的函数
const getQueryParam = () => {
  // 创建 URLSearchParams 对象来解析查询字符串
  const searchParams = new URLSearchParams(window.location.search);
  // 获取参数值
  const paramValue = searchParams.get("port");
  
  // 验证参数值是否为有效的数字端口号
  if (paramValue) {
    const num = parseInt(paramValue, 10);
    // 检查是否是有效数字且在端口号范围内 (0-65535)
    if (!isNaN(num) && num >= 0 && num <= 65535) {
      return num;
    }
  }
  return 3666;
};

/**
 * 对话密钥：QQ 每次启动时生成，由设置面板拼进 URL 带过来。
 * 没有它服务端会拒绝连接，页面也无法执行任何代码。
 */
const getTokenParam = () => {
  const searchParams = new URLSearchParams(window.location.search);
  return searchParams.get("token")?.trim() ?? "";
};

const port = ref(getQueryParam());
const token = getTokenParam();
const { isConnected, authError, executeRemoteCode, logs, clearLogs, executing } =
	useSocket({
		port,
		token,
	});
const code = ref(`// 代码包裹在 async 函数中执行，需要返回值记得 return
console.log('隐藏着黑暗力量的钥匙啊，在我面前显示你真正的力量，跟你定下约定的小樱命令你，封印解除！');
`);
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

.auth-error {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  font-size: 13px;
  color: #b42318;
  background: #fef3f2;
  border: 1px solid #fecdca;
  border-radius: 6px;
}

.auth-error-title {
  flex-shrink: 0;
  font-weight: 600;
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
