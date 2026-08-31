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


export function StartupModeNotice({
  align = 'flex-start',
  marginTop = 1,
  paddingLeft
}: StartupModeNoticeProps): React.ReactNode {
  const quietModeEnabled = isQuietModeEnabled();
  return <Box marginTop={marginTop} paddingLeft={paddingLeft} flexDirection="column" alignItems={align}>
      <Box flexDirection="row" gap={1}>
        {quietModeEnabled ? <ModeBadge backgroundColor="ansi:cyan" label="QUIET" /> : null}
      </Box>
      {quietModeEnabled ? <Text dimColor={true}>--quiet: no interim updates</Text> : null}
    </Box>;
}
