import React from 'react';

/**
 * Minimal react-native stand-in for vitest (node environment).
 *
 * The real RN entrypoint is Flow-annotated and cannot be parsed by Vite, so
 * component tests run against this mock: every primitive is a host element
 * that renders its props, which react-test-renderer can inspect.
 */

type HostProps = Record<string, unknown>;

const host =
  (name: string) =>
  (props: HostProps) =>
    React.createElement(name, props);

export const View = host('view');
export const Text = host('text');
export const TextInput = host('textinput');
export const TouchableOpacity = host('touchable');
export const Modal = host('modal');
export const ActivityIndicator = host('spinner');

export const Platform = {
  OS: 'ios' as 'ios' | 'android' | 'web',
  select: <T,>(spec: Record<string, T>): T => spec[Platform.OS] ?? spec.default,
};
