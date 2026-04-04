import type { QuerySource } from '../constants/querySource.js'

// Auto-judge must invoke the verifier on its own source so main-thread-only
// gates keep treating judge execution as a distinct verification phase.
export const AUTO_JUDGE_QUERY_SOURCE: QuerySource = 'verification_agent'
