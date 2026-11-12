import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import TestRenderer, {
  act,
  type ReactTestInstance,
  type ReactTestRenderer,
} from 'react-test-renderer';
import { TouchableOpacity, TextInput } from 'react-native';

vi.mock('../../src/react-native/api', () => ({
  requestEmailOtp: vi.fn(async () => ({ status: 'success', message: 'Verification code sent.' })),
  signInWithEmailOtp: vi.fn(async () => undefined),
  verifyEmailOtp: vi.fn(async () => 'tok'),
}));

vi.mock('react-native-keyboard-controller', () => ({
  KeyboardAwareScrollView: (props: { children: React.ReactNode }) => props.children,
}));

vi.mock('lucide-react-native', () => ({
  Mail: () => null,
  X: () => null,
  AlertCircle: () => null,
  ArrowLeft: () => null,
}));

import { EmailOtpModal } from '../../src/react-native/EmailOtpModal';
import { requestEmailOtp, signInWithEmailOtp } from '../../src/react-native/api';

let renderer: ReactTestRenderer | undefined;

afterEach(() => {
  act(() => renderer?.unmount());
  renderer = undefined;
  vi.clearAllMocks();
});

/** Joins a node's children into a single string (handles `['Resend in ', 60, 's']`). */
const nodeText = (node: ReactTestInstance): string | null => {
  const c = node.props.children;
  if (typeof c === 'string') return c;
  if (Array.isArray(c)) {
    return c
      .map((p) => (typeof p === 'string' ? p : typeof p === 'number' ? String(p) : ''))
      .join('');
  }
  return null;
};

const findAllText = (needle: string): boolean =>
  renderer!.root
    .findAll((n) => {
      const t = nodeText(n);
      return t !== null && t.includes(needle);
    })
    .length > 0;

/** Presses the INNERMOST TouchableOpacity whose text includes `needle`
 * (the modal backdrop contains everything, so "first match" would be wrong). */
const pressByText = async (needle: string) => {
  const buttons = renderer!.root.findAllByType(TouchableOpacity);
  const matches = buttons.filter(
    (b) =>
      b.findAll((node) => {
        const t = nodeText(node);
        return t !== null && t.includes(needle);
      }).length > 0
  );
  expect(matches.length, `button containing "${needle}"`).toBeGreaterThan(0);
  const innermost = [...matches].sort(
    (a, b) => a.findAllByType(TouchableOpacity).length - b.findAllByType(TouchableOpacity).length
  )[0]!;
  await act(async () => {
    innermost.props.onPress?.();
  });
};

const typeEmail = async (email: string) => {
  const input = renderer!.root
    .findAllByType(TextInput)
    .find((i) => i.props.placeholder === 'name@email.com');
  expect(input, 'email input').toBeTruthy();
  await act(async () => {
    input!.props.onChangeText(email);
  });
};

const openModal = () => {
  act(() => {
    renderer = TestRenderer.create(<EmailOtpModal visible onClose={() => {}} />);
  });
};

const findOtpInput = () => {
  const otpInput = renderer!.root.findAll(
    (node) => node.props.accessibilityLabel === '6-digit verification code'
  )[0];
  expect(otpInput, 'hidden OTP input').toBeTruthy();
  return otpInput!;
};

describe('EmailOtpModal', () => {
  it('starts on the email step and blocks empty/invalid emails client-side', async () => {
    openModal();
    expect(findAllText('Sign in with email code')).toBe(true);

    await pressByText('Send Code');
    expect(findAllText('Please enter your email address.')).toBe(true);
    expect(requestEmailOtp).not.toHaveBeenCalled();

    await typeEmail('not-an-email');
    await pressByText('Send Code');
    expect(findAllText('Please enter a valid email address.')).toBe(true);
    expect(requestEmailOtp).not.toHaveBeenCalled();
  });

  it('sends the code and advances to the OTP step', async () => {
    openModal();
    await typeEmail(' User@Example.com ');
    await pressByText('Send Code');

    // normalized for the API call, displayed as typed
    expect(requestEmailOtp).toHaveBeenCalledWith('user@example.com');
    expect(findAllText('Enter verification code')).toBe(true);
    expect(findAllText('User@Example.com')).toBe(true);
    expect(findAllText('Resend in 60s')).toBe(true);
  });

  it('surfaces backend errors with the functions prefix stripped', async () => {
    vi.mocked(requestEmailOtp).mockRejectedValueOnce(
      new Error(
        '[functions/requestEmailOtp] 8 RESOURCE_EXHAUSTED: Please wait 42 seconds before requesting a new code.'
      )
    );
    openModal();
    await typeEmail('a@b.com');
    await pressByText('Send Code');

    expect(findAllText('Please wait 42 seconds before requesting a new code.')).toBe(true);
    expect(findAllText('[functions/')).toBe(false);
  });

  it('auto-submits on the 6th digit, signs in, and closes the modal', async () => {
    const onClose = vi.fn();
    act(() => {
      renderer = TestRenderer.create(<EmailOtpModal visible onClose={onClose} />);
    });
    await typeEmail('a@b.com');
    await pressByText('Send Code');

    await act(async () => {
      findOtpInput().props.onChangeText('123456');
    });

    expect(signInWithEmailOtp).toHaveBeenCalledTimes(1);
    expect(signInWithEmailOtp).toHaveBeenCalledWith('a@b.com', '123456');
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('shows verification errors and resets the OTP input', async () => {
    vi.mocked(signInWithEmailOtp).mockRejectedValueOnce(
      new Error(
        '[functions/verifyEmailOtp] 16 INVALID_ARGUMENT: Invalid verification code. You have 4 attempts remaining.'
      )
    );
    const onClose = vi.fn();
    act(() => {
      renderer = TestRenderer.create(<EmailOtpModal visible onClose={onClose} />);
    });
    await typeEmail('a@b.com');
    await pressByText('Send Code');

    await act(async () => {
      findOtpInput().props.onChangeText('000000');
    });

    expect(findAllText('Invalid verification code. You have 4 attempts remaining.')).toBe(true);
    expect(onClose).not.toHaveBeenCalled();
    expect(findOtpInput().props.value).toBe(''); // input was reset
  });

  it('blocks double verification (auto-submit + button race)', async () => {
    openModal();
    await typeEmail('a@b.com');
    await pressByText('Send Code');

    const otpInput = findOtpInput();
    // make signIn slow so a second attempt lands while the first is in flight
    let resolveSignIn: () => void = () => {};
    vi.mocked(signInWithEmailOtp).mockImplementationOnce(
      () => new Promise<void>((r) => (resolveSignIn = r))
    );

    await act(async () => {
      otpInput.props.onChangeText('123456');
    });
    expect(signInWithEmailOtp).toHaveBeenCalledTimes(1);

    // a second verification while the first is pending is ignored
    await act(async () => {
      otpInput.props.onComplete?.('123456');
    });
    expect(signInWithEmailOtp).toHaveBeenCalledTimes(1);

    act(() => resolveSignIn());
    await act(async () => {});
  });
});
