declare const process: {
  env: Record<string, string | undefined>
  stderr: { write(message: string): void }
}

declare module 'bun:bundle' {
  export function feature(name: string): boolean
}

declare module '*state.js' {
  export function getMainLoopModelOverride(): any
  export function getInitialMainLoopModel(): any
}

declare module '*auth.js' {
  export function getSubscriptionType(): any
  export function isClaudeAISubscriber(): boolean
  export function isMaxSubscriber(): boolean
  export function isProSubscriber(): boolean
  export function isTeamPremiumSubscriber(): boolean
  export function isTeamSubscriber(): boolean
}

declare module '*context.js' {
  export function has1mContext(model: string): boolean
  export function is1mContextDisabled(): boolean
  export function modelSupports1M(model: string): boolean
}

declare module '*envUtils.js' {
  export function isEnvTruthy(value: any): boolean
}

declare module '*modelStrings.js' {
  export function getModelStrings(): any
  export function resolveOverriddenModel(...args: any[]): any
}

declare module '*modelCost.js' {
  export const COST_TIER_3_15: any
  export const COST_HAIKU_35: any
  export const COST_HAIKU_45: any
  export function formatModelPricing(...args: any[]): string
  export function getOpus46CostTier(...args: any[]): any
}

declare module '*settings.js' {
  export function getSettings_DEPRECATED(): any
  export function getInitialSettings(): any
  export function getSettingsWithErrors(): any
}

declare module '*PermissionMode.js' {
  export type PermissionMode = any
}

declare module '*providers.js' {
  export function getAPIProvider(): any
}

declare module '*figures.js' {
  export const LIGHTNING_BOLT: any
}

declare module '*modelAllowlist.js' {
  export function isModelAllowed(model: any): boolean
}

declare module '*aliases.js' {
  export type ModelAlias = string
  export function isModelAlias(model: any): boolean
}

declare module '*stringUtils.js' {
  export function capitalize(value: string): string
}

declare module '*antModels.js' {
  export type AntModel = any
  export type AntModelOverrideConfig = any
  export function getAntModelOverrideConfig(): any
  export function getAntModels(): any[]
  export function resolveAntModel(model: any): any
}

declare module '*check1mAccess.js' {
  export function checkOpus1mAccess(): boolean
  export function checkSonnet1mAccess(): boolean
}

declare module '*model.js' {
  export type ModelSetting = any
  export function getCanonicalName(model: any): string
  export function getClaudeAiUserDefaultModelDescription(
    fastMode?: boolean,
  ): string
  export function getDefaultSonnetModel(): any
  export function getDefaultOpusModel(): any
  export function getDefaultHaikuModel(): any
  export function getDefaultMainLoopModelSetting(): any
  export function getMarketingNameForModel(model: any): string | null
  export function getUserSpecifiedModelSetting(): any
  export function isOpus1mMergeEnabled(): boolean
  export function getOpus46PricingSuffix(fastMode?: boolean): string
  export function renderDefaultModelSetting(model: any): string
}

declare module '*config.js' {
  export function getGlobalConfig(): any
}

declare module '*thinking.js' {
  export function isUltrathinkEnabled(): boolean
}

declare module '*growthbook.js' {
  export function getFeatureValue_CACHED_MAY_BE_STALE<T>(
    key: string,
    fallback: T,
  ): T
}

declare module '*modelSupportOverrides.js' {
  export function get3PModelCapabilityOverride(...args: any[]): any
}

declare module '*runtimeTypes.js' {
  export type EffortLevel = string
}

declare module '*theme.js' {
  export type Theme = Record<string, any>
}

declare module '*betas.js' {
  export const CONTEXT_1M_BETA_HEADER: string
}

declare module '*modelCapabilities.js' {
  export function getModelCapability(model: any): any
}

declare module '*effort.js' {
  export type EffortLevel = string
}
