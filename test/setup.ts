/**
 * Jest setup for the `ui` project.
 *
 * The native and routing modules are replaced here rather than in each test file,
 * because a test file's own imports are evaluated before any `beforeEach` runs:
 * importing a screen pulls in the result context, which pulls in SQLite and the
 * filesystem. Installing the fakes in setup means they are in place before any
 * application module is loaded.
 *
 * Two rules hold everywhere in this suite:
 *
 * 1. No wall-clock waiting. Every async dependency resolves immediately or on a
 *    fake timer. A test that only passes because the machine was fast is not a test.
 * 2. No real network, camera, database or filesystem.
 */

// Reanimated 4 installs worklet unpackers on the native runtime. Under Jest
// there is no runtime, and reanimated's real initialiser serialises a worklet
// while the module is still being imported, which throws before any test body
// runs.
//
// Worklets is stubbed first, because reanimated's own Jest mock still imports
// the real reanimated — and the real reanimated is what loads worklets. Only
// the identifiers listed in `./fakes/worklets` are read during that evaluation,
// so the stub is the whole surface needed. Reanimated is then swapped for its
// published mock, which replaces the animation layer with plain JS objects;
// `useAnimatedStyle` still invokes the callback it is given, so hooks written
// for it are exercised rather than skipped.
jest.mock('react-native-worklets', () => require('./fakes/worklets'));

jest.mock('react-native-reanimated', () =>
  require('react-native-reanimated/mock')
);

// @expo-google-fonts/inter would try to load real fonts, which fails in Jest.
// Mock it so useFonts immediately resolves with fonts loaded.
jest.mock('@expo-google-fonts/inter', () => ({
  useFonts: () => [true, null],
}));

import { installFakeCamera, installFakeOcr, resetCamera, resetOcr } from './fakes/camera';
import {
  installAlertRecorder,
  installFakeFileSystem,
  installFakeRouter,
  installFakeSqlite,
  resetRegisteredScreens,
  resetRouter,
} from './fakes/environment';

/** A fixed instant so `createdAt` and every rendered date is reproducible. */
export const FIXED_NOW = '2026-01-15T09:30:00.000Z';

// Fakes must be registered before the first application module is imported.
installFakeRouter();
installFakeCamera();
installFakeOcr();
installFakeSqlite();
installFakeFileSystem();
installAlertRecorder();

beforeEach(() => {
  jest.spyOn(Date, 'now').mockReturnValue(new Date(FIXED_NOW).getTime());
  resetRouter();
  resetRegisteredScreens();
  resetCamera();
  resetOcr();
  // The app keeps its database connection in a module-level variable, so a fresh
  // mock would reuse the same connection. Clearing the rows is what gives each
  // test an empty history.
  installFakeSqlite().clearRows();
  installFakeFileSystem();
  installAlertRecorder();
});

afterEach(() => {
  jest.restoreAllMocks();
});
