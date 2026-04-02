export type ConnectorTextBlock = {
  type: 'connector_text'
  connector_text: string
  [key: string]: unknown
}

export type ConnectorTextDelta = {
  type?: 'connector_text_delta'
  connector_text?: string
  text?: string
  delta?: string
  [key: string]: unknown
}

export function isConnectorTextBlock(
  block: unknown,
): block is ConnectorTextBlock {
  return (
    typeof block === 'object' &&
    block !== null &&
    'type' in block &&
    (block as { type?: unknown }).type === 'connector_text' &&
    'connector_text' in block &&
    typeof (block as { connector_text?: unknown }).connector_text === 'string'
  )
}
