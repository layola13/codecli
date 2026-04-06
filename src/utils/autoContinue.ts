import { feature } from 'bun:bundle'
import { getAutoContinueOptIn } from '../bootstrap/state.js'
import type { ToolPermissionContext } from '../Tool.js'
import {
  transitionPermissionMode,
  transitionPlanAutoMode,
} from './permissions/permissionSetup.js'

export function isAutoContinueEnabled(): boolean {
  return getAutoContinueOptIn()
}

export function enableAutoContinuePermissionContext(
  context: ToolPermissionContext,
): ToolPermissionContext {
  if (!feature('TRANSCRIPT_CLASSIFIER')) return context
  if (!context.isAutoModeAvailable) return context

  if (context.mode === 'plan') {
    return transitionPlanAutoMode({
      ...context,
      prePlanMode: 'auto',
      autoContinueRestoreMode:
        context.autoContinueRestoreMode ?? context.prePlanMode ?? 'default',
    })
  }

  if (context.mode === 'auto') return context

  const transitioned = transitionPermissionMode(context.mode, 'auto', context)
  return {
    ...transitioned,
    mode: 'auto',
    autoContinueRestoreMode: context.autoContinueRestoreMode ?? context.mode,
  }
}

export function disableAutoContinuePermissionContext(
  context: ToolPermissionContext,
): ToolPermissionContext {
  if (!feature('TRANSCRIPT_CLASSIFIER')) return context

  const restoreMode = context.autoContinueRestoreMode
  if (restoreMode === undefined) return context

  if (context.mode === 'plan') {
    return transitionPlanAutoMode({
      ...context,
      prePlanMode: restoreMode,
      autoContinueRestoreMode: undefined,
    })
  }

  if (context.mode !== 'auto') {
    return {
      ...context,
      autoContinueRestoreMode: undefined,
    }
  }

  const transitioned = transitionPermissionMode('auto', restoreMode, context)
  return {
    ...transitioned,
    mode: restoreMode,
    autoContinueRestoreMode: undefined,
  }
}
