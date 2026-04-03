# 在聊天输入栏底部显示统计信息

## 上下文
当前PromptInputFooter组件已经显示了一些统计信息(如token使用情况),但用户希望在聊天输入栏底部添加更多统计信息:
1. 当前任务消息对话总数
2. 花费的token总量
3. 模型请求次数

## 当前实现分析

### 现有相关代码
- **src/components/PromptInput/PromptInputFooter.tsx**: 底部栏容器组件
- **src/components/PromptInput/Notifications.tsx**: 显示token使用警告等通知
- **src/utils/tokens.ts**: token计算工具函数
  - `tokenCountFromLastAPIResponse()`: 获取最后一次API响应的token数
  - `getCurrentUsage()`: 获取当前使用量
- **src/utils/stats.ts**: 会话统计功能
  - 可以计算总消息数、token数等
  - 但主要用于历史统计,不是当前会话实时统计

### 数据获取方式
- 消息列表通过props传递: `messages: Message[]`
- Token使用信息需要从消息中提取(assistant消息中的usage字段)
- 模型请求次数可以通过统计assistant消息数量来估算

## 实现方案

### 方案1: 扩展Notifications组件(推荐)
在Notifications组件中添加新的统计信息显示区域。

优点:
- 与现有token警告信息位置一致
- 组件已经接收messages prop
- 不需要大的架构改动

缺点:
- 可能会使底部栏信息过多

### 方案2: 创建新的统计组件
创建一个新的`PromptInputStats`组件,在PromptInputFooter中显示。

优点:
- 组件职责分离
- 可以独立控制显示/隐藏

缺点:
- 需要更多代码改动
- 需要传递更多props

## 推荐实现: 扩展Notifications组件(简化方案)

基于反馈,采用更简单的实现方案:直接在Notifications组件的右侧添加统计信息,与现有token警告等信息在同一行显示。

### 1. 实现方式
在Notifications组件中添加统计信息显示:
- 位置: 与token警告等信息在同一行(右侧)
- 格式: 紧凑单行 "12 msgs · 3.5k tokens · 6 reqs"
- 使用现有组件结构,不创建新组件

### 2. 添加配置选项
添加设置选项让用户可以:
- `showInputStats`: 开启/关闭统计信息显示(默认开启)

### 3. UI布局
在Notifications组件的右侧(与token警告等信息同一行)添加统计信息,格式为紧凑单行:
```
12 msgs · 3.5k tokens · 6 reqs
```

位置在底部栏右侧,与现有token警告、IDE状态等信息并排显示。

## 具体实现步骤

### 步骤1: 增强tokens.ts工具函数

添加新函数来计算累计统计:
```typescript
// src/utils/tokens.ts

export function calculateSessionStats(messages: Message[]) {
  let totalTokens = 0
  let totalRequests = 0
  
  for (const message of messages) {
    const usage = getTokenUsage(message)
    if (usage) {
      totalTokens += getTokenCountFromUsage(usage)
      totalRequests++
    }
  }
  
  return {
    messageCount: messages.length,
    totalTokens,
    totalRequests
  }
}
```

### 步骤2: 修改Notifications组件

1. 使用useMemo计算统计信息(消息数、总token数、请求次数)
2. 在UI右侧添加统计信息显示,与token警告等并排
3. 从设置中读取`showInputStats`控制是否显示
4. 紧凑格式显示: "12 msgs · 3.5k tokens · 6 reqs"

### 步骤3: 添加设置选项

在settings中添加新选项:
- `showInputStats`: 是否显示输入框统计(布尔值,默认true)

## 文件修改清单

1. **src/utils/tokens.ts** - 添加统计计算函数`calculateSessionStats`
2. **src/components/PromptInput/Notifications.tsx** - 在右侧添加统计信息显示
3. **src/utils/settings/types.ts** - 添加`showInputStats`设置类型
4. **src/utils/settings/settings.ts** - 添加`showInputStats`默认值为true

## 验证方式

1. 启动应用,发送几条消息
2. 检查底部栏是否显示统计信息
3. 验证消息数、token数、请求次数是否正确
4. 测试设置开关功能
5. 测试不同模型和消息长度下的准确性

## 未来扩展

- 可以添加点击统计信息展开详细视图
- 可以添加历史统计对比
- 可以添加token使用趋势图