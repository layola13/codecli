import * as React from 'react';
import { Box, Text } from 'src/ink.js';
import { isJudgeModeEnabled } from 'src/utils/judgeMode.js';
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

export function StartupModeNotice({
  align = 'flex-start',
  marginTop = 1,
  paddingLeft
}: StartupModeNoticeProps): React.ReactNode {
  const quietModeEnabled = isQuietModeEnabled();
  const judgeModeEnabled = isJudgeModeEnabled();
  if (!quietModeEnabled && !judgeModeEnabled) {
    return null;
  }
  return <Box marginTop={marginTop} paddingLeft={paddingLeft} flexDirection="column" alignItems={align}>
      <Box flexDirection="row" gap={1}>
        {quietModeEnabled ? <ModeBadge backgroundColor="ansi:cyan" label="QUIET" /> : null}
        {judgeModeEnabled ? <ModeBadge backgroundColor="ansi:yellow" label="JUDGE" /> : null}
      </Box>
      {quietModeEnabled ? <Text dimColor={true}>--quiet: no interim updates</Text> : null}
      {judgeModeEnabled ? <Text dimColor={true}>--judge: verify before complete</Text> : null}
    </Box>;
}
