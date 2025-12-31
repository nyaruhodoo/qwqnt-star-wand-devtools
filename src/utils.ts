import { js_beautify, html_beautify, css_beautify } from 'js-beautify'

export const formatCodeLight = (code: string, lang: string) => {
  if (!code) return ''

  const options = {
    indent_size: 2,
    indent_char: ' ',
    preserve_newlines: true,
    max_preserve_newlines: 2,
  }

  try {
    switch (lang) {
      case 'javascript':
      case 'js':
        return js_beautify(code, options)
      case 'html':
        return html_beautify(code, options)
      case 'css':
        return css_beautify(code, options)
      default:
        return code
    }
  } catch (error) {
    console.error('格式化失败：', error)
    return code
  }
}
/**
 * 核心匹配函数
 * @param {string} targetValue - 被搜索的原始文本 (item.callPath 等)
 * @param {string} filterValue - 用户的输入 (可能是 'abc' 或 '/abc/i')
 * @returns {boolean} - 是否匹配成功
 */
export const matchValue = (targetValue?: string, filterValue?: string) => {
  // 1. 基础边界检查：如果搜索词为空，默认认为匹配成功（显示所有数据）
  if (!filterValue) return true
  if (!targetValue) return false

  const targetStr = String(targetValue)
  const filterStr = String(filterValue)

  // 2. 正则表达式检测：识别 /^/(.*)/([gimyus]*)$/ 格式
  const regexMatch = filterStr.match(/^\/(.*?)\/([gimyus]*)$/)

  if (regexMatch) {
    try {
      // 提取正则内容和修饰符
      const [, pattern, flags] = regexMatch
      if (!pattern) throw new Error('pattern error')
      const regex = new RegExp(pattern, flags)
      return regex.test(targetStr)
    } catch (e) {
      // 如果正则语法有误（如未闭合的括号），回退到普通字符串匹配
      console.warn('Invalid RegExp, falling back to string match:', e)
    }
  }

  // 3. 普通字符串匹配：默认不区分大小写
  return targetStr.toLowerCase().includes(filterStr.toLowerCase())
}
