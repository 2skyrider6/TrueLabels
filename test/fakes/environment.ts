/**
 * Router, database, filesystem and alert fakes for widget tests, plus a render
 * helper.
 *
 * A screen is tested on its own, not through the navigator: `useRouter` becomes a
 * recording stub so a test can assert that a result replaces the scan screen
 * rather than stacking on it. The result context is real, with the database and
 * the filesystem faked out, so a scan written by a test is visible to the history
 * screen exactly as it would be on a device.
 *
 * Nothing here imports an application module at load time. The fakes have to be
 * installed before SQLite or the filesystem is required, and a static import of
 * the result context would pull both in too early.
 */
// ---------------------------------------------------------------------------
// Router
// ---------------------------------------------------------------------------

export interface RouterCall {
  method: 'push' | 'replace' | 'back';
  href?: string;
  pathname?: string;
  params?: Record<string, string>;
}

export const router: { calls: RouterCall[]; backCount: number } = {
  calls: [],
  backCount: 0,
};

/** Search params the current route exposes, for `useLocalSearchParams`. */
export const routeParams: Record<string, string> = {};

export function resetRouter(params: Record<string, string> = {}): void {
  router.calls = [];
  router.backCount = 0;
  Object.keys(routeParams).forEach(key => delete routeParams[key]);
  Object.assign(routeParams, params);
}

/** Every path the screen navigated to, in order. */
export function navigatedTo(): string[] {
  return router.calls.map(call => call.href ?? call.pathname ?? '');
}

/**
 * The `Stack.Screen` elements the layout rendered, keyed by route name.
 *
 * `Stack` is faked away, so a screen that renders nothing would otherwise be
 * indistinguishable from one that was never registered. Recording the props on
 * render keeps the navigator's own configuration assertable.
 */
export const registeredScreens = new Map<string, Record<string, unknown>>();

export function resetRegisteredScreens(): void {
  registeredScreens.clear();
}

export function installFakeRouter(): void {
  jest.doMock('expo-router', () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const React = require('react') as typeof import('react');
    const createElement = (
      React as unknown as { createElement: typeof import('react').createElement }
    ).createElement;

    function StackScreen(props: { name?: string; options?: Record<string, unknown> }) {
      if (props.name) registeredScreens.set(props.name, props.options ?? {});
      return null;
    }
    StackScreen.displayName = 'Stack.Screen';

    return {
      __esModule: true,
      useRouter: () => ({
        push: (target: string | { pathname: string; params?: Record<string, string> }) =>
          router.calls.push(
            typeof target === 'string'
              ? { method: 'push', href: target }
              : { method: 'push', pathname: target.pathname, params: target.params }
          ),
        replace: (target: string | { pathname: string; params?: Record<string, string> }) =>
          router.calls.push(
            typeof target === 'string'
              ? { method: 'replace', href: target }
              : { method: 'replace', pathname: target.pathname, params: target.params }
          ),
        back: () => {
          router.backCount += 1;
          router.calls.push({ method: 'back' });
        },
      }),
      useLocalSearchParams: () => routeParams,
      usePathname: () => '/',
      useFocusEffect: () => undefined,
      Link: ({ children }: { children: import('react').ReactNode }) => children,
      Stack: Object.assign(
        ({ children }: { children: import('react').ReactNode }) =>
          createElement(React.Fragment, null, children),
        { Screen: StackScreen }
      ),
    };
  });
}

// ---------------------------------------------------------------------------
// SQLite
// ---------------------------------------------------------------------------

type SqliteFakes = typeof import('./sqlite');

let sqliteHandle: ReturnType<SqliteFakes['installFakeSqlite']> | null = null;

/**
 * Registers the fake database. Calling it again returns the same handle and does
 * not re-register, so setup can be idempotent.
 */
export function installFakeSqlite(): ReturnType<SqliteFakes['installFakeSqlite']> {
  if (sqliteHandle) return sqliteHandle;
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const fakes = require('./sqlite') as SqliteFakes;
  sqliteHandle = fakes.installFakeSqlite();
  return sqliteHandle;
}

/** The database the app opened, for asserting on stored rows. */
export function openedDatabase() {
  return installFakeSqlite().db();
}

type HistoryModule = typeof import('../../src/db/history');

/**
 * The history module the app is actually using.
 *
 * Required lazily and without isolation, so it resolves to the same instance the
 * mounted provider holds: a second copy would open a second database and read an
 * empty history.
 */
export function appHistoryModule(): HistoryModule {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return require('@/db/history') as HistoryModule;
}

// ---------------------------------------------------------------------------
// Filesystem
// ---------------------------------------------------------------------------

type FileSystemFakes = typeof import('./fakeFileSystem');

let fsFakes: FileSystemFakes | null = null;

export function installFakeFileSystem(): FileSystemFakes {
  if (fsFakes) {
    fsFakes.resetFakeFileSystem();
    return fsFakes;
  }
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  fsFakes = require('./fakeFileSystem') as FileSystemFakes;
  fsFakes.resetFakeFileSystem();
  jest.doMock('expo-file-system', () => fsFakes!.createFakeFileSystem());
  return fsFakes;
}

/** The fake filesystem, for seeding a capture or asserting on stored photos. */
export function fakeFileSystem(): FileSystemFakes {
  return fsFakes ?? installFakeFileSystem();
}

// ---------------------------------------------------------------------------
// Alerts
// ---------------------------------------------------------------------------

export interface RecordedAlert {
  title: string;
  message?: string;
  buttons?: { text: string; style?: string; onPress?: () => void }[];
}

export const alerts: RecordedAlert[] = [];

/**
 * Alert calls are recorded rather than mocked away, because several flows depend
 * on the user acknowledging a dialog before the screen continues.
 */
export function installAlertRecorder(): void {
  alerts.length = 0;
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { Alert } = require('react-native') as typeof import('react-native');
  jest.spyOn(Alert, 'alert').mockImplementation((title, message, buttons) => {
    alerts.push({ title, message, buttons: buttons as RecordedAlert['buttons'] });
  });
}

/** Acknowledges the most recent alert by pressing its last button. */
export function acknowledgeAlert(index = -1): void {
  const alert = alerts.at(index);
  const last = alert?.buttons?.at(-1);
  if (!last) return;
  pressAlertButton(last.text, index);
}

/**
 * Presses a specific button of the most recent alert.
 *
 * `Alert.alert` renders a native dialog, so its buttons never enter the React
 * tree. The recorder keeps them, which is what lets a destructive action be
 * driven the way a user drives it: press the trigger, then answer the prompt.
 *
 * Awaited because these callbacks are synchronous React state updates — a delete on
 * the screen, a refresh on the provider — and calling them bare would leave the
 * update unflushsed for the rest of the test.
 */
export async function pressAlertButton(label: string, index = -1): Promise<void> {
  const alert = alerts.at(index);
  const button = alert?.buttons?.find(candidate => candidate.text === label);
  if (!button) {
    throw new Error(
      `No "${label}" button on alert "${alert?.title ?? '<none>'}". ` +
        `Available: ${(alert?.buttons ?? []).map(b => b.text).join(', ') || '<none>'}`
    );
  }

  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { act } = require('@testing-library/react-native') as typeof import('@testing-library/react-native');
  await act(async () => {
    button.onPress?.();
  });
}
