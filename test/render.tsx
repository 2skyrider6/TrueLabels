/**
 * Render helpers for widget tests.
 *
 * `ResultProvider` is required at call time rather than imported at module load,
 * so the result context (and through it SQLite and the filesystem) is built after
 * `test/setup.ts` has installed the fakes.
 *
 * `render` is awaited everywhere: in React Native Testing Library 14 it is
 * asynchronous, and a synchronous call would leave `screen` detached.
 */
import React from 'react';
import { render, type RenderResult } from '@testing-library/react-native';
import { SafeAreaProvider, type Metrics } from 'react-native-safe-area-context';

type ResultProviderComponent = React.ComponentType<{ children: React.ReactNode }>;

/**
 * Fixed insets, so a header's padding is deterministic.
 *
 * `useSafeAreaInsets` throws without a `SafeAreaProvider`, and the real one has to
 * measure a native layout that does not exist here. `initialMetrics` is the
 * supported way to supply the values up front, which keeps the rendered padding
 * reproducible across runs.
 */
const SAFE_AREA_METRICS: Metrics = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 47, left: 0, right: 0, bottom: 34 },
};

/** Renders a screen inside the real result provider. */
export async function renderWithResult(ui: React.ReactElement): Promise<RenderResult> {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { ResultProvider } = require('@/context/ResultContext') as {
    ResultProvider: ResultProviderComponent;
  };

  return render(
    <SafeAreaProvider initialMetrics={SAFE_AREA_METRICS}>
      <ResultProvider>{ui}</ResultProvider>
    </SafeAreaProvider>
  );
}

/** Renders a screen with no provider, for screens that read globals only. */
export async function renderScreen(ui: React.ReactElement): Promise<RenderResult> {
  return render(ui);
}

/**
 * The result context the last render observed.
 *
 * Screens only ever write the result through the context, so asserting on it is
 * the only way to see what the next screen would be handed, and the only way to
 * confirm that a seed actually reached the screen under test.
 */
export interface ObservedContext {
  result: import('@/rules/types').ScanResult | null;
  scans: import('@/db/history').HistoryScan[];
  hasMore: boolean;
  /** Writes a result the way a preceding screen would. */
  setResult: (result: import('@/rules/types').ScanResult, save?: boolean) => void;
}

let observed: ObservedContext | null = null;

/** The context the last render observed, or null before the first one. */
export function lastSeenResult(): ObservedContext | null {
  return observed;
}

/**
 * Renders a screen inside the real provider and reports what the context held.
 *
 * When `seedResult` is given it is written after the mount, inside `act`, rather
 * than during render: writing during render would schedule a state update from
 * inside the render phase, which React treats as an error.
 */
export async function renderWithObservedResult(
  ui: React.ReactElement,
  seedResult?: import('@/rules/types').ScanResult
): Promise<RenderResult> {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { ResultProvider, useResult } = require('@/context/ResultContext') as typeof import('@/context/ResultContext');

  observed = null;

  function ContextProbe() {
    observed = useResult();
    return null;
  }

  const result = await render(
    <SafeAreaProvider initialMetrics={SAFE_AREA_METRICS}>
      <ResultProvider>
        {ui}
        <ContextProbe />
      </ResultProvider>
    </SafeAreaProvider>
  );

  if (seedResult) {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { act } = require('@testing-library/react-native') as typeof import('@testing-library/react-native');
    await act(async () => {
      observed?.setResult(seedResult, false);
    });
  }

  return result;
}
