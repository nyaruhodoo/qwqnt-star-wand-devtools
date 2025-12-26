import { js_beautify, html_beautify, css_beautify } from 'js-beautify'

export const formatCodeLight = (code:string, lang:string) => {
  if (!code) return ''

  const options = {
    indent_size: 2,
    indent_char: ' ',
    preserve_newlines: true,
    max_preserve_newlines: 2
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