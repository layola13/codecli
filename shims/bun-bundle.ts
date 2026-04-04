export function feature(_name: string): boolean {
  return false
}

declare global {
  var MACRO: {
    VERSION: string
    BUILD_TIME: string | undefined
    ISSUES_EXPLAINER: string
    FEEDBACK_CHANNEL: string
    NATIVE_PACKAGE_URL: string
    PACKAGE_URL: string
    VERSION_CHANGELOG: string
  }
}

globalThis.MACRO = {
  VERSION: '2.1.88+local.4',
  BUILD_TIME: undefined,
  ISSUES_EXPLAINER: 'https://github.com/anthropics/claude-code/issues',
  FEEDBACK_CHANNEL: '#claude-code-feedback',
  NATIVE_PACKAGE_URL: 'https://claude.ai/download',
  PACKAGE_URL: 'https://www.npmjs.com/package/@anthropic-ai/claude-code',
  VERSION_CHANGELOG: 'https://github.com/anthropics/claude-code/releases',
}
