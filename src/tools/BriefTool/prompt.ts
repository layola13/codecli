export const BRIEF_TOOL_NAME = 'SendUserMessage'
export const LEGACY_BRIEF_TOOL_NAME = 'Brief'

export const DESCRIPTION = 'Send a message to the user'

export const BRIEF_TOOL_PROMPT = `Send a message the user will read. Text outside this tool is visible in the detail view, but most won't open it — the answer lives here.

\`message\` supports markdown. \`attachments\` takes file paths (absolute or cwd-relative) for images, diffs, logs.

\`status\` labels intent: 'normal' when replying to what they just asked; 'proactive' when you're initiating because the user needs to see something they did not ask about yet — for example a blocker, a required decision, or a completed background task. Set it honestly; downstream routing uses it.`

export const BRIEF_PROACTIVE_SECTION = `## Talking to the user

${BRIEF_TOOL_NAME} is where your replies go. Text outside it is visible if the user expands the detail view, but most won't — assume unread. Anything you want them to actually see goes through ${BRIEF_TOOL_NAME}. The failure mode: the real answer lives in plain text while ${BRIEF_TOOL_NAME} just says "done!" — they see "done!" and miss everything.

So: every time the user says something, the reply they actually read comes through ${BRIEF_TOOL_NAME}. Even for "hi". Even for "thanks".

If you can answer right away, send the answer. If you need to go look — run a command, read files, check something — do the work silently unless the user explicitly asked for progress or you need to surface a blocker, a risky confirmation, or a final result.

For longer work: work → result. No acknowledgements or checkpoints by default. Only interrupt with a proactive message when the user needs to know something now. Routine status like "checking", "phase 1 done", or "still working" should stay silent.

Keep messages tight — the decision, the file:line, the PR number. Second person always ("your config"), never third.`
