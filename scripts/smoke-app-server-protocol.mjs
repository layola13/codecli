#!/usr/bin/env node

import { spawn } from 'node:child_process'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

const executable = resolve(process.argv[2] ?? 'dist/claude_app_server.exe')
const timeoutMs = Number.parseInt(process.env.APP_SERVER_SMOKE_TIMEOUT_MS ?? '10000', 10)
const home = await mkdtemp(join(tmpdir(), 'claude-app-server-smoke-'))
const env = {
  ...process.env,
  HOME: home,
  USERPROFILE: home,
  CLAUDE_CONFIG_DIR: join(home, 'config'),
  CLAUDE_CODE_SIMPLE: '1',
}

const child = spawn(
  executable,
  [
    '--print',
    '--verbose',
    '--input-format=stream-json',
    '--output-format=stream-json',
    '--include-partial-messages',
  ],
  { env, stdio: ['pipe', 'pipe', 'pipe'] },
)

const messages = []
let stdoutBuffer = ''
let stderr = ''
let settled = false
let timer
let userSent = false

const finish = error => {
  if (settled) return
  settled = true
  clearTimeout(timer)
  child.kill()
  void rm(home, { recursive: true, force: true })
  if (error) {
    console.error(error.message)
    if (stderr.trim()) console.error(stderr.trim())
    process.exitCode = 1
    return
  }
  const init = messages.find(
    message => message.type === 'system' && message.subtype === 'init',
  )
  const control = messages.find(
    message =>
      message.type === 'control_response' &&
      message.response?.request_id === 'smoke-1',
  )
  const commands = control?.response?.response?.commands ?? []
  if (
    !init ||
    !control ||
    commands.length === 0 ||
    commands.some(command => command.name === 'index')
  ) {
    console.error('App-server protocol smoke test failed.')
    process.exitCode = 1
    return
  }
  console.log(
    JSON.stringify({
      ok: true,
      init: true,
      controlResponse: true,
      commandCount: commands.length,
      hasIndexCommand: false,
    }),
  )
}

child.stdout.on('data', chunk => {
  stdoutBuffer += chunk.toString()
  const lines = stdoutBuffer.split(/\r?\n/)
  stdoutBuffer = lines.pop() ?? ''
  for (const line of lines) {
    if (!line.trim()) continue
    try {
      messages.push(JSON.parse(line))
    } catch {
      finish(new Error(`Invalid NDJSON from app-server: ${line}`))
      return
    }
    const init = messages.find(
      message => message.type === 'system' && message.subtype === 'init',
    )
    const control = messages.find(
      message =>
        message.type === 'control_response' &&
        message.response?.request_id === 'smoke-1',
    )
    if (control && !userSent) {
      userSent = true
      child.stdin.write(
        `${JSON.stringify({
          type: 'user',
          message: { role: 'user', content: 'protocol smoke test' },
          parent_tool_use_id: null,
        })}\n`,
      )
    }
    if (
      messages.some(message => message.type === 'system' && message.subtype === 'init') &&
      messages.some(
        message =>
          message.type === 'control_response' &&
          message.response?.request_id === 'smoke-1',
      )
    ) {
      finish()
      return
    }
  }
})
child.stderr.on('data', chunk => {
  stderr += chunk.toString()
})
child.on('error', finish)
child.on('close', code => {
  if (!settled && code !== null && code !== 0) {
    finish(new Error(`App-server exited with code ${code}.`))
  }
})

child.stdin.write(
  `${JSON.stringify({
    type: 'control_request',
    request_id: 'smoke-1',
    request: { subtype: 'initialize' },
  })}\n`,
)

timer = setTimeout(
  () => finish(new Error(`App-server protocol smoke test timed out after ${timeoutMs} ms.`)),
  timeoutMs,
)
