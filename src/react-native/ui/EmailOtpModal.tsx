import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  type TextInputInstance,
  type ViewStyle,
} from 'react-native';
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';
import { CODE_LENGTH, RESEND_COOLDOWN_MS, isValidEmail } from '../../shared';
import { OtpInput } from './OtpInput';
import { requestEmailOtp, signInWithEmailOtp } from '../api';

export interface EmailOtpModalProps {
  visible: boolean;
  onClose: () => void;
  /** Pre-fill the email step (e.g. from the email already typed on the auth screen). */
  initialEmail?: string;
  /** Brand name shown in the header. Default: 'Sign in with email code'. */
  appName?: string;
  /**
   * Resend cooldown in seconds shown in the UI. Keep in sync with the
   * backend's `cooldownMs` option. Default 60.
   */
  cooldownSeconds?: number;
}

/**
 * Two-step email → code modal. Handles the full OTP flow:
 * email validation, send, 60s resend cooldown, auto-submit on the last
 * digit, backend error surfacing, and sign-in via custom token.
 *
 * On success the modal closes and the app's global `onAuthStateChanged`
 * listener takes over — no navigation code needed.
 */
export function EmailOtpModal({
  visible,
  onClose,
  initialEmail = '',
  appName,
  cooldownSeconds = Math.round(RESEND_COOLDOWN_MS / 1000),
}: EmailOtpModalProps) {
  const [step, setStep] = useState<'email' | 'otp'>('email');
  const [email, setEmail] = useState(initialEmail);
  const [otp, setOtp] = useState('');
  const [loading, setLoading] = useState(false);
  const [resending, setResending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cooldown, setCooldown] = useState(0);

  const [prevVisible, setPrevVisible] = useState(false);
  const isVerifyingRef = useRef(false);
  const emailRef = useRef<TextInputInstance>(null);

  // Reset state each time the modal opens
  if (visible !== prevVisible) {
    setPrevVisible(visible);
    if (visible) {
      setStep('email');
      setEmail(initialEmail);
      setOtp('');
      setError(null);
      setLoading(false);
      setResending(false);
      setCooldown(0);
      isVerifyingRef.current = false;
    }
  }

  // Resend cooldown timer
  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = setInterval(() => {
      setCooldown((prev) => (prev > 0 ? prev - 1 : 0));
    }, 1000);
    return () => clearInterval(timer);
  }, [cooldown]);

  // Strip Firebase's "[functions/xyz] " prefix from backend error messages
  const cleanErrorMessage = (err: unknown, fallback: string): string => {
    const raw =
      err instanceof Error ? err.message : typeof err === 'string' ? err : '';
    if (raw.length > 0) {
      return raw.replace(/^\[.*?\]\s*/, '').trim();
    }
    return fallback;
  };

  const handleSendCode = async () => {
    const trimmedEmail = email.trim().toLowerCase();
    if (!trimmedEmail) {
      setError('Please enter your email address.');
      return;
    }
    if (!isValidEmail(trimmedEmail)) {
      setError('Please enter a valid email address.');
      return;
    }

    setLoading(true);
    setError(null);
    emailRef.current?.blur();

    try {
      await requestEmailOtp(trimmedEmail);
      setStep('otp');
      setCooldown(cooldownSeconds);
      setOtp('');
    } catch (err) {
      console.error('[passwordless-auth] requestEmailOtp failed:', err);
      setError(cleanErrorMessage(err, 'Failed to send verification code. Please try again.'));
    } finally {
      setLoading(false);
    }
  };

  const handleResendCode = async () => {
    if (cooldown > 0 || resending || loading) return;

    setResending(true);
    setError(null);

    try {
      await requestEmailOtp(email.trim().toLowerCase());
      setCooldown(cooldownSeconds);
      setOtp('');
    } catch (err) {
      console.error('[passwordless-auth] resend failed:', err);
      setError(cleanErrorMessage(err, 'Failed to resend verification code.'));
    } finally {
      setResending(false);
    }
  };

  const handleClose = () => {
    setError(null);
    setLoading(false);
    setResending(false);
    onClose();
  };

  const handleVerifyOtp = async (codeToVerify?: string) => {
    const code = (codeToVerify ?? otp).trim();
    if (code.length < CODE_LENGTH || isVerifyingRef.current) return;

    isVerifyingRef.current = true;
    setLoading(true);
    setError(null);

    try {
      await signInWithEmailOtp(email.trim().toLowerCase(), code);
      handleClose();
    } catch (err) {
      console.error('[passwordless-auth] verifyEmailOtp failed:', err);
      setError(
        cleanErrorMessage(err, 'Invalid or expired verification code. Please try again.')
      );
      setOtp('');
    } finally {
      setLoading(false);
      isVerifyingRef.current = false;
    }
  };

  const handleBackToEmail = () => {
    if (loading) return;
    setStep('email');
    setOtp('');
    setError(null);
  };

  const buttonBase: ViewStyle = {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 8,
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={handleClose}>
      <KeyboardAwareScrollView
        contentContainerStyle={{ flexGrow: 1 }}
        keyboardShouldPersistTaps="handled"
        bottomOffset={24}
        showsVerticalScrollIndicator={false}>
        <TouchableOpacity
          style={{
            flex: 1,
            backgroundColor: 'rgba(0,0,0,0.5)',
            justifyContent: 'center',
            alignItems: 'center',
            padding: 16,
          }}
          activeOpacity={1}
          onPress={handleClose}>
          <TouchableOpacity
            activeOpacity={1}
            style={{
              backgroundColor: '#fff',
              width: '100%',
              maxWidth: 420,
              borderRadius: 16,
              overflow: 'hidden',
              shadowColor: '#000',
              shadowOpacity: 0.2,
              shadowRadius: 12,
              elevation: 10,
            }}>
            {/* Header */}
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'space-between',
                paddingHorizontal: 24,
                paddingVertical: 16,
                borderBottomWidth: 1,
                borderBottomColor: '#f3f4f6',
              }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                {step === 'otp' && (
                  <TouchableOpacity
                    onPress={handleBackToEmail}
                    disabled={loading}
                    activeOpacity={0.7}
                    accessibilityLabel="Back">
                    <Text style={{ fontSize: 18, color: '#64748b', fontWeight: '600' }}>←</Text>
                  </TouchableOpacity>
                )}
                <View>
                  <Text style={{ fontSize: 12, color: '#94a3b8', marginBottom: 2 }}>
                    {step === 'email' ? 'Instant Sign In' : 'Verification'}
                  </Text>
                  <Text style={{ fontSize: 18, fontWeight: '700', color: '#1e293b' }}>
                    {step === 'email'
                      ? appName
                        ? `${appName} — email code`
                        : 'Sign in with email code'
                      : 'Enter verification code'}
                  </Text>
                </View>
              </View>
              <TouchableOpacity onPress={handleClose} activeOpacity={0.7} accessibilityLabel="Close">
                <Text style={{ fontSize: 20, color: '#94a3b8', fontWeight: '600' }}>×</Text>
              </TouchableOpacity>
            </View>

            {/* Content */}
            <View style={{ padding: 24 }}>
              {error ? (
                <View
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    padding: 12,
                    marginBottom: 16,
                    borderRadius: 12,
                    backgroundColor: '#fef2f2',
                    borderWidth: 1,
                    borderColor: '#fecaca',
                  }}>
                  <Text style={{ fontSize: 12, color: '#dc2626', flex: 1, fontWeight: '500' }}>
                    {error}
                  </Text>
                </View>
              ) : null}

              {step === 'email' ? (
                /* ---------- Step 1: Email ---------- */
                <View>
                  <Text style={{ fontSize: 13, color: '#64748b', marginBottom: 16, lineHeight: 18 }}>
                    We'll send a 6-digit verification code to your email. No password needed.
                  </Text>

                  <View style={{ marginBottom: 24 }}>
                    <Text style={{ fontSize: 12, fontWeight: '600', color: '#334155', marginBottom: 8 }}>
                      Email
                    </Text>
                    <View
                      style={{
                        flexDirection: 'row',
                        alignItems: 'center',
                        paddingHorizontal: 16,
                        backgroundColor: '#f8fafc',
                        borderRadius: 12,
                        borderWidth: 1,
                        borderColor: '#e5e7eb',
                        height: 56,
                      }}>
                      <TextInput
                        ref={emailRef}
                        style={{ flex: 1, fontSize: 14, fontWeight: '600', color: '#1e293b' }}
                        placeholder="name@email.com"
                        placeholderTextColor="#94a3b8"
                        value={email}
                        onChangeText={(val) => {
                          setEmail(val);
                          if (error) setError(null);
                        }}
                        keyboardType="email-address"
                        autoCapitalize="none"
                        autoCorrect={false}
                        returnKeyType="send"
                        onSubmitEditing={handleSendCode}
                        autoFocus
                        editable={!loading}
                      />
                    </View>
                  </View>

                  <View style={{ flexDirection: 'row', gap: 12 }}>
                    <TouchableOpacity
                      onPress={handleClose}
                      style={{ ...buttonBase, borderWidth: 1, borderColor: '#e5e7eb', backgroundColor: 'transparent' }}
                      activeOpacity={0.7}>
                      <Text style={{ color: '#64748b', fontWeight: '600', fontSize: 12, textTransform: 'uppercase', letterSpacing: 1 }}>
                        Cancel
                      </Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      onPress={handleSendCode}
                      disabled={loading}
                      style={{ ...buttonBase, backgroundColor: loading ? '#93c5fd' : '#3b82f6' }}
                      activeOpacity={0.7}>
                      {loading ? <ActivityIndicator size="small" color="#fff" /> : null}
                      <Text style={{ color: '#fff', fontWeight: '600', fontSize: 12, textTransform: 'uppercase', letterSpacing: 1 }}>
                        {loading ? 'Sending…' : 'Send Code'}
                      </Text>
                    </TouchableOpacity>
                  </View>
                </View>
              ) : (
                /* ---------- Step 2: Code ---------- */
                <View>
                  <Text style={{ fontSize: 13, color: '#64748b', marginBottom: 16, lineHeight: 18 }}>
                    We sent a 6-digit code to{' '}
                    <Text style={{ fontWeight: '600', color: '#1e293b' }}>{email.trim()}</Text>
                    {' '}
                    . Enter it below to sign in.
                  </Text>

                  <View style={{ alignItems: 'center', marginBottom: 16 }}>
                    <OtpInput
                      value={otp}
                      onChange={(val) => {
                        setOtp(val);
                        if (error) setError(null);
                      }}
                      onComplete={(code) => handleVerifyOtp(code)}
                      disabled={loading}
                      error={!!error}
                      autoFocus
                    />
                  </View>

                  <View
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      marginBottom: 24,
                      paddingHorizontal: 4,
                    }}>
                    <TouchableOpacity onPress={handleBackToEmail} disabled={loading} activeOpacity={0.7}>
                      <Text style={{ fontSize: 12, fontWeight: '600', color: '#64748b' }}>
                        Change email
                      </Text>
                    </TouchableOpacity>

                    {cooldown > 0 ? (
                      <Text style={{ fontSize: 12, color: '#94a3b8', fontWeight: '500' }}>
                        Resend in {cooldown}s
                      </Text>
                    ) : (
                      <TouchableOpacity
                        onPress={handleResendCode}
                        disabled={resending || loading}
                        style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}
                        activeOpacity={0.7}>
                        {resending ? <ActivityIndicator size="small" color="#2563eb" /> : null}
                        <Text style={{ fontSize: 12, fontWeight: '600', color: '#2563eb' }}>
                          Resend Code
                        </Text>
                      </TouchableOpacity>
                    )}
                  </View>

                  <View style={{ flexDirection: 'row', gap: 12 }}>
                    <TouchableOpacity
                      onPress={handleClose}
                      style={{ ...buttonBase, borderWidth: 1, borderColor: '#e5e7eb', backgroundColor: 'transparent' }}
                      activeOpacity={0.7}>
                      <Text style={{ color: '#64748b', fontWeight: '600', fontSize: 12, textTransform: 'uppercase', letterSpacing: 1 }}>
                        Cancel
                      </Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      onPress={() => handleVerifyOtp()}
                      disabled={loading || otp.length < CODE_LENGTH}
                      style={{
                        ...buttonBase,
                        backgroundColor: loading || otp.length < CODE_LENGTH ? '#93c5fd' : '#3b82f6',
                      }}
                      activeOpacity={0.7}>
                      {loading ? <ActivityIndicator size="small" color="#fff" /> : null}
                      <Text style={{ color: '#fff', fontWeight: '600', fontSize: 12, textTransform: 'uppercase', letterSpacing: 1 }}>
                        {loading ? 'Verifying…' : 'Verify & Sign In'}
                      </Text>
                    </TouchableOpacity>
                  </View>
                </View>
              )}
            </View>
          </TouchableOpacity>
        </TouchableOpacity>
      </KeyboardAwareScrollView>
    </Modal>
  );
}
