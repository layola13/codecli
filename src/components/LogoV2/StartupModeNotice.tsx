import * as React from 'react';
import { Box, Text } from 'src/ink.js';
import { useAppState } from 'src/state/AppState.js';
import { isQuietModeEnabled } from 'src/utils/quietMode.js';

type StartupModeNoticeProps = {
  align?: 'flex-start' | 'center';
  marginTop?: number;
  paddingLeft?: number;
};

type ModeBadgeProps = {
  backgroundColor: string;
  label: string;
};

function ModeBadge({
  backgroundColor,
  label
}: ModeBadgeProps): React.ReactNode {
  return <Text backgroundColor={backgroundColor} color="ansi:black" bold={true}> {label} </Text>;
}

function JudgeStatus({
  isEnabled
}: {
  isEnabled: boolean;
}): React.ReactNode {
  return <Text color={isEnabled ? "ansi:green" : "ansi:red"} bold={true}>JUDGE {isEnabled ? 'on' : 'off'}</Text>;
}

function getModeDescription(isEnabled: boolean): string {
  return isEnabled ? '--judge: verify before complete' : '--judge: auto-verification off';
}

export function StartupModeNotice({
  align = 'flex-start',
  marginTop = 1,
  paddingLeft
}: StartupModeNoticeProps): React.ReactNode {
  const quietModeEnabled = isQuietModeEnabled();
  const judgeModeOptIn = useAppState(s => s.judgeModeOptIn);
  // Always show judge status so users can identify its state at a glance
  return <Box marginTop={marginTop} paddingLeft={paddingLeft} flexDirection="column" alignItems={align}>
      <Box flexDirection="row" gap={1}>
        {quietModeEnabled ? <ModeBadge backgroundColor="ansi:cyan" label="QUIET" /> : null}
        <JudgeStatus isEnabled={judgeModeOptIn} />
      </Box>
      {quietModeEnabled ? <Text dimColor={true}>--quiet: no interim updates</Text> : null}
      <Text dimColor={true}>{getModeDescription(judgeModeOptIn)}</Text>
    </Box>;
}
