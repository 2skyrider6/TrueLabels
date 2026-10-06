import React from 'react';
import { Text } from 'react-native';
import { render, screen } from '@testing-library/react-native';

it('renders', async () => {
  await render(<Text>hello</Text>);
  expect(screen.getByText('hello')).toBeOnTheScreen();
});
