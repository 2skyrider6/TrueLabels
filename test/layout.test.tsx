/**
 * The navigator configuration.
 *
 * A route missing from the `Stack` still renders, but with the default header,
 * which would silently drop a screen's title. And an entry with no route file
 * behind it is a screen nothing can navigate to. These tests keep the two lists in
 * agreement.
 */
import React from 'react';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { registeredScreens } from '@test/fakes/environment';
import { renderWithResult } from '@test/render';
import RootLayout from '../app/_layout';

/** Every route file Expo Router would turn into a screen. */
function routeFiles(): string[] {
  const appDir = path.join(__dirname, '..', 'app');
  // Colocated test files are not routes: their `.test` suffix excludes them.
  return fs
    .readdirSync(appDir)
    .filter((name: string) => !/\.test\.tsx?$/.test(name) && name !== '_layout.tsx')
    .filter((name: string) => /\.(tsx|ts)$/.test(name))
    .map((name: string) => name.replace(/\.(tsx|ts)$/, ''));
}

describe('route registration', () => {
  it('registers every route file that exists', async () => {
    await renderWithResult(<RootLayout />);

    routeFiles().forEach(route => {
      expect(registeredScreens.has(route)).toBe(true);
    });
  });

  it('registers no screen that has no route file', async () => {
    await renderWithResult(<RootLayout />);
    const files = routeFiles();

    Array.from(registeredScreens.keys()).forEach(name => {
      expect(files).toContain(name);
    });
  });

  it('hides the native header on the home screen, which draws its own', async () => {
    await renderWithResult(<RootLayout />);

    expect(registeredScreens.get('index')).toMatchObject({ headerShown: false });
  });

  it('gives every other screen a header, so it is never untitled', async () => {
    await renderWithResult(<RootLayout />);

    registeredScreens.forEach((options, name) => {
      if (name === 'index') return;
      expect(options.headerShown).not.toBe(false);
      expect(options.title).toBeTruthy();
    });
  });

  it('titles each screen for the navigation bar', async () => {
    await renderWithResult(<RootLayout />);

    expect(registeredScreens.get('label-scan')).toMatchObject({ title: 'Scan label' });
    expect(registeredScreens.get('paste')).toMatchObject({ title: 'Type ingredients' });
    expect(registeredScreens.get('result')).toMatchObject({ title: 'Result' });
    expect(registeredScreens.get('not-found')).toMatchObject({ title: 'Product not found' });
    expect(registeredScreens.get('history')).toMatchObject({ title: 'History' });
  });
});