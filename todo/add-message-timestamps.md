# Plan: UI 每条消息前面添加时间日期

## Context
用户希望在 Claude Code 的 UI 中，每条消息前面添加时间日期，格式如 `[11:46]`。

## Current Implementation Analysis

### 已有代码
1. **MessageTimestamp.tsx** (`src/components/MessageTimestamp.tsx`)
   - 已存在时间戳组件
   - 当前只在 `isTranscriptMode` 为 true 时显示
   - 只显示在 assistant 消息上
   - 格式: `toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: true })`
   - 显示效果: "11:46 AM" (带 dimColor)

2. **MessageRow.tsx** (`src/components/MessageRow.tsx`)
   - 第267-286行: 在 `hasMetadata` 为 true 时，在消息上方显示时间戳和模型信息
   - 当前逻辑: 只在 transcript 模式下为 assistant 消息显示元数据

### 关键代码路径
- 消息渲染: `MessageRow.tsx` → `Message.tsx`
- 时间戳组件: `MessageTimestamp.tsx`
- 消息类型定义: `src/types/message.ts`

## Requirements (Confirmed)

1. **显示模式**: 所有模式下都显示
2. **消息类型**: 所有消息类型（assistant + user）
3. **时间格式**: `[HH:MM]`（24小时制，不要秒，不要日期）
4. **位置**: 选项A - 消息内容前同一行（如 `[11:46] 消息内容...`）
5. **可配置**: 需要设置选项来启用/禁用

## Implementation Approach

### 方案
1. 修改 `MessageTimestamp.tsx`：
   - 支持24小时制格式 `[HH:MM]`
   - 移除 `isTranscriptMode` 限制
   - 支持所有消息类型

2. 修改 `MessageRow.tsx`：
   - 将时间戳移到消息内容前（同一行）
   - 为所有消息显示时间戳

3. 添加设置选项：
   - `showMessageTimestamps`: boolean（默认 true）

## Implementation Details

### 1. 添加设置选项
在 `src/utils/settings/types.ts` 的 SettingsSchema 中添加：
```typescript
showMessageTimestamps: z
  .boolean()
  .optional()
  .describe('Whether to show timestamps before each message (format: [HH:MM])'),
```

### 2. 修改 MessageTimestamp.tsx
- 移除 `isTranscriptMode` 参数
- 修改格式化为 `[HH:MM]`（24小时制）
- 简化显示逻辑，为所有消息类型显示

### 3. 修改 MessageRow.tsx
- 将时间戳移到消息内容前（同一行）
- 为所有消息类型显示时间戳
- 根据设置控制是否显示

### 4. 添加默认设置
在 `src/utils/settings/settings.ts` 中添加默认值

## Files to Modify
- `src/utils/settings/types.ts` (line ~1067) - 添加 `showMessageTimestamps` 设置
- `src/components/MessageTimestamp.tsx` - 修改格式和显示条件
- `src/components/MessageRow.tsx` - 将时间戳移到消息前同一行
- `src/utils/settings/settings.ts` - 添加默认设置值

## Verification
- 启动 Claude Code
- 发送几条消息，验证 `[HH:MM]` 格式的时间戳显示在每条消息前
- 检查设置是否可以控制显示/隐藏
- 验证不同消息类型（assistant, user）都显示时间戳

## Verification
- 启动 Claude Code
- 发送消息，验证时间戳显示在每条消息前
- 检查不同模式下的显示效果
