import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import TestRenderer, { act, type ReactTestRenderer } from 'react-test-renderer';
import { OtpInput } from './OtpInput';

const HIDDEN_INPUT_LABEL = '6-digit verification code';

describe('OtpInput', () => {
  it('renders one hidden native input plus six visual slots', () => {
    let renderer: ReactTestRenderer | undefined;
    act(() => {
      renderer = TestRenderer.create(
        <OtpInput value="" onChange={() => {}} autoFocus={false} />
      );
    });
    const root = renderer!.root;
    expect(root.findByProps({ accessibilityLabel: HIDDEN_INPUT_LABEL })).toBeTruthy();
    // hidden input: opacity 0 in its style
    const input = root.findByProps({ accessibilityLabel: HIDDEN_INPUT_LABEL });
    expect(input.props.style.opacity).toBe(0);
    act(() => renderer!.unmount());
  });

  it('filters out non-digits and caps at 6 characters', () => {
    const onChange = vi.fn();
    let renderer: ReactTestRenderer | undefined;
    act(() => {
      renderer = TestRenderer.create(
        <OtpInput value="12" onChange={onChange} autoFocus={false} />
      );
    });
    const input = renderer!.root.findByProps({ accessibilityLabel: HIDDEN_INPUT_LABEL });
    act(() => {
      input.props.onChangeText('12a345678');
    });
    expect(onChange).toHaveBeenCalledWith('123456');
    act(() => renderer!.unmount());
  });

  it('fires onComplete when the 6th digit arrives (auto-submit path)', () => {
    const onChange = vi.fn();
    const onComplete = vi.fn();
    let renderer: ReactTestRenderer | undefined;
    act(() => {
      renderer = TestRenderer.create(
        <OtpInput value="12345" onChange={onChange} onComplete={onComplete} autoFocus={false} />
      );
    });
    const input = renderer!.root.findByProps({ accessibilityLabel: HIDDEN_INPUT_LABEL });
    act(() => {
      input.props.onChangeText('123456');
    });
    expect(onComplete).toHaveBeenCalledTimes(1);
    expect(onComplete).toHaveBeenCalledWith('123456');
    act(() => renderer!.unmount());
  });

  it('shows filled characters in the visual slots', () => {
    let renderer: ReactTestRenderer | undefined;
    act(() => {
      renderer = TestRenderer.create(
        <OtpInput value="42" onChange={() => {}} autoFocus={false} />
      );
    });
    // count only host text nodes (the mock Text component would match twice)
    const texts = renderer!
      .root.findAll(
        (n) => n.type === 'text' && (n.props.children === '4' || n.props.children === '2')
      )
      .length;
    expect(texts).toBe(2);
    act(() => renderer!.unmount());
  });
});
