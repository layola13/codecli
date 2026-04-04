import * as React from 'react'
import type { Command } from '../commands.js'
import { Box, Text } from '../ink.js'
import { stringWidth } from '../ink/stringWidth.js'
import type { Screen } from '../screens/REPL.js'
import type { Tools } from '../Tool.js'
import type { RenderableMessage } from '../types/message.js'
import {
  getDisplayMessageFromCollapsed,
  getToolSearchOrReadInfo,
  getToolUseIdsFromCollapsedGroup,
  hasAnyToolInProgress,
} from '../utils/collapseReadSearch.js'
import {
  type buildMessageLookups,
  EMPTY_STRING_SET,
  getProgressMessagesFromLookup,
  getSiblingToolUseIDsFromLookup,
  getToolUseID,
} from '../utils/messages.js'
import { hasThinkingContent, Message } from './Message.js'
import { MessageModel } from './MessageModel.js'
import { shouldRenderStatically } from './Messages.js'
import { OffscreenFreeze } from './OffscreenFreeze.js'

export type Props = {
  message: RenderableMessage
  /** Whether the previous message in renderableMessages is also a user message. */
  isUserContinuation: boolean
  /**
   * Whether there is non-skippable content after this message in renderableMessages.
   * Only needs to be accurate for `collapsed_read_search` messages — used to decide
   * if the collapsed group spinner should stay active. Pass `false` otherwise.
   */
  hasContentAfter: boolean
  tools: Tools
  commands: Command[]
  verbose: boolean
  inProgressToolUseIDs: Set<string>
  streamingToolUseIDs: Set<string>
  screen: Screen
  canAnimate: boolean
  onOpenRateLimitOptions?: () => void
  lastThinkingBlockId: string | null
  latestBashOutputUUID: string | null
  columns: number
  isLoading: boolean
  lookups: ReturnType<typeof buildMessageLookups>
  showMessageTimestamps?: boolean
  showTimestampUuids?: Set<string>
}

export function hasContentAfterIndex(
  messages: RenderableMessage[],
  index: number,
  tools: Tools,
  streamingToolUseIDs: Set<string>,
): boolean {
  for (let i = index + 1; i < messages.length; i++) {
    const msg = messages[i]

    if (msg?.type === 'assistant') {
      const content = msg.message.content[0]

      if (
        content?.type === 'thinking' ||
        content?.type === 'redacted_thinking'
      ) {
        continue
      }

      if (content?.type === 'tool_use') {
        if (
          getToolSearchOrReadInfo(content.name, content.input, tools)
            .isCollapsible
        ) {
          continue
        }

        // Non-collapsible tool uses appear in syntheticStreamingToolUseMessages
        // before their ID is added to inProgressToolUseIDs. Skip while streaming
        // to avoid briefly finalizing the read group.
        if (streamingToolUseIDs.has(content.id)) {
          continue
        }
      }

      return true
    }

    if (msg?.type === 'system' || msg?.type === 'attachment') {
      continue
    }

    // Tool results arrive while the collapsed group is still being built
    if (msg?.type === 'user') {
      const content = msg.message.content[0]
      if (content?.type === 'tool_result') {
        continue
      }
    }

    // Collapsible grouped_tool_use messages arrive transiently before being
    // merged into the current collapsed group on the next render cycle
    if (msg?.type === 'grouped_tool_use') {
      const firstInput = msg.messages[0]?.message.content[0]?.input
      if (
        getToolSearchOrReadInfo(msg.toolName, firstInput, tools).isCollapsible
      ) {
        continue
      }
    }

    return true
  }

  return false
}

function formatTimestampLabel(timestamp: string): string | null {
  const date = new Date(timestamp)
  if (Number.isNaN(date.getTime())) {
    return null
  }

  const hours = date.getHours().toString().padStart(2, '0')
  const minutes = date.getMinutes().toString().padStart(2, '0')
  return `[${hours}:${minutes}]`
}

function isTranscriptAssistantWithMetadata(
  message: RenderableMessage,
  isTranscriptMode: boolean,
): boolean {
  return (
    isTranscriptMode &&
    message.type === 'assistant' &&
    message.message.content.some(isTextBlock) &&
    Boolean(message.timestamp || message.message.model)
  )
}

function isTextBlock(
  block: { type: string },
): boolean {
  return block.type === 'text'
}

function MessageRowImpl({
  message: msg,
  isUserContinuation,
  hasContentAfter,
  tools,
  commands,
  verbose,
  inProgressToolUseIDs,
  streamingToolUseIDs,
  screen,
  canAnimate,
  onOpenRateLimitOptions,
  lastThinkingBlockId,
  latestBashOutputUUID,
  columns,
  isLoading,
  lookups,
  showMessageTimestamps,
  showTimestampUuids,
}: Props): React.ReactNode {
  const isTranscriptMode = screen === 'transcript'
  const isGrouped = msg.type === 'grouped_tool_use'
  const isCollapsed = msg.type === 'collapsed_read_search'

  // A collapsed group is "active" (grey dot, present tense "Reading…") when its tools
  // are still executing OR when the overall query is still running with nothing after it.
  const isActiveCollapsedGroup =
    isCollapsed &&
    (hasAnyToolInProgress(msg, inProgressToolUseIDs) ||
      (isLoading && !hasContentAfter))

  const displayMsg = isGrouped
    ? msg.displayMessage
    : isCollapsed
      ? getDisplayMessageFromCollapsed(msg)
      : msg

  const progressMessagesForMessage =
    isGrouped || isCollapsed ? [] : getProgressMessagesFromLookup(msg, lookups)

  const siblingToolUseIDs =
    isGrouped || isCollapsed
      ? EMPTY_STRING_SET
      : getSiblingToolUseIDsFromLookup(msg, lookups)

  const isStatic = shouldRenderStatically(
    msg,
    streamingToolUseIDs,
    inProgressToolUseIDs,
    siblingToolUseIDs,
    screen,
    lookups,
  )

  let shouldAnimate = false
  if (canAnimate) {
    if (isGrouped) {
      shouldAnimate = msg.messages.some(m => {
        const content = m.message.content[0]
        return (
          content?.type === 'tool_use' &&
          inProgressToolUseIDs.has(content.id)
        )
      })
    } else if (isCollapsed) {
      shouldAnimate = hasAnyToolInProgress(msg, inProgressToolUseIDs)
    } else {
      const toolUseID = getToolUseID(msg)
      shouldAnimate = !toolUseID || inProgressToolUseIDs.has(toolUseID)
    }
  }

  const hasMetadata = isTranscriptAssistantWithMetadata(
    displayMsg,
    isTranscriptMode,
  )
  const shouldShowTimestamp = Boolean(
    showMessageTimestamps &&
      msg.timestamp &&
      showTimestampUuids?.has(msg.uuid),
  )
  const timestampLabel =
    shouldShowTimestamp && msg.timestamp
      ? formatTimestampLabel(msg.timestamp)
      : null
  const timestampWidth = timestampLabel
    ? stringWidth(`${timestampLabel} `)
    : 0
  const contentWidth = Math.max(1, columns - timestampWidth)
  const inlineTimestampMarginTop =
    shouldShowTimestamp && !hasMetadata ? 1 : 0
  const containerWidth = shouldShowTimestamp
    ? contentWidth
    : hasMetadata
      ? undefined
      : columns

  const messageEl = (
    <Message
      message={msg}
      lookups={lookups}
      addMargin={!hasMetadata && !shouldShowTimestamp}
      containerWidth={containerWidth}
      tools={tools}
      commands={commands}
      verbose={verbose}
      inProgressToolUseIDs={inProgressToolUseIDs}
      progressMessagesForMessage={progressMessagesForMessage}
      shouldAnimate={shouldAnimate}
      shouldShowDot
      isTranscriptMode={isTranscriptMode}
      isStatic={isStatic}
      onOpenRateLimitOptions={onOpenRateLimitOptions}
      isActiveCollapsedGroup={isActiveCollapsedGroup}
      isUserContinuation={isUserContinuation}
      lastThinkingBlockId={lastThinkingBlockId}
      latestBashOutputUUID={latestBashOutputUUID}
    />
  )

  const timestampEl = timestampLabel ? (
    <Box minWidth={timestampWidth}>
      <Text dimColor>{`${timestampLabel} `}</Text>
    </Box>
  ) : null

  if (!hasMetadata) {
    return (
      <OffscreenFreeze>
        <Box
          flexDirection="row"
          alignItems="flex-start"
          marginTop={inlineTimestampMarginTop}
        >
          {timestampEl}
          {messageEl}
        </Box>
      </OffscreenFreeze>
    )
  }

  return (
    <OffscreenFreeze>
      <Box width={columns} flexDirection="column">
        <Box
          flexDirection="row"
          justifyContent="flex-end"
          gap={1}
          marginTop={1}
        >
          <MessageModel
            message={displayMsg}
            isTranscriptMode={isTranscriptMode}
          />
        </Box>
        <Box flexDirection="row" alignItems="flex-start">
          {timestampEl}
          {messageEl}
        </Box>
      </Box>
    </OffscreenFreeze>
  )
}

export function isMessageStreaming(
  msg: RenderableMessage,
  streamingToolUseIDs: Set<string>,
): boolean {
  if (msg.type === 'grouped_tool_use') {
    return msg.messages.some(m => {
      const content = m.message.content[0]
      return (
        content?.type === 'tool_use' &&
        streamingToolUseIDs.has(content.id)
      )
    })
  }

  if (msg.type === 'collapsed_read_search') {
    const toolIds = getToolUseIdsFromCollapsedGroup(msg)
    return toolIds.some(id => streamingToolUseIDs.has(id))
  }

  const toolUseID = getToolUseID(msg)
  return !!toolUseID && streamingToolUseIDs.has(toolUseID)
}

export function allToolsResolved(
  msg: RenderableMessage,
  resolvedToolUseIDs: Set<string>,
): boolean {
  if (msg.type === 'grouped_tool_use') {
    return msg.messages.every(m => {
      const content = m.message.content[0]
      return (
        content?.type === 'tool_use' &&
        resolvedToolUseIDs.has(content.id)
      )
    })
  }

  if (msg.type === 'collapsed_read_search') {
    const toolIds = getToolUseIdsFromCollapsedGroup(msg)
    return toolIds.every(id => resolvedToolUseIDs.has(id))
  }

  if (msg.type === 'assistant') {
    const block = msg.message.content[0]
    if (block?.type === 'server_tool_use') {
      return resolvedToolUseIDs.has(block.id)
    }
  }

  const toolUseID = getToolUseID(msg)
  return !toolUseID || resolvedToolUseIDs.has(toolUseID)
}

export function areMessageRowPropsEqual(prev: Props, next: Props): boolean {
  if (prev.message !== next.message) return false
  if (prev.screen !== next.screen) return false
  if (prev.verbose !== next.verbose) return false
  if (prev.columns !== next.columns) return false
  if (prev.isUserContinuation !== next.isUserContinuation) return false
  if (prev.hasContentAfter !== next.hasContentAfter) return false

  if (
    prev.message.type === 'collapsed_read_search' &&
    next.screen !== 'transcript'
  ) {
    return false
  }

  const prevShowsTimestamp = Boolean(
    prev.showMessageTimestamps &&
      prev.message.timestamp &&
      prev.showTimestampUuids?.has(prev.message.uuid),
  )
  const nextShowsTimestamp = Boolean(
    next.showMessageTimestamps &&
      next.message.timestamp &&
      next.showTimestampUuids?.has(next.message.uuid),
  )
  if (prevShowsTimestamp !== nextShowsTimestamp) return false

  const prevIsLatestBash =
    prev.latestBashOutputUUID === prev.message.uuid
  const nextIsLatestBash =
    next.latestBashOutputUUID === next.message.uuid
  if (prevIsLatestBash !== nextIsLatestBash) return false

  if (
    prev.lastThinkingBlockId !== next.lastThinkingBlockId &&
    hasThinkingContent(next.message)
  ) {
    return false
  }

  const isStreaming = isMessageStreaming(
    prev.message,
    prev.streamingToolUseIDs,
  )
  const isResolved = allToolsResolved(
    prev.message,
    prev.lookups.resolvedToolUseIDs,
  )

  if (isStreaming || !isResolved) return false

  return true
}

export const MessageRow = React.memo(MessageRowImpl, areMessageRowPropsEqual)
