import React, { useEffect, useRef, useState } from 'react';
import {
  Platform,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  type TextInputInstance,
} from 'react-native';
import { CODE_LENGTH } from '../../shared';

export interface OtpInputProps {
  /** Number of digits. Default 6 (matches the backend). */
  length?: number;
  value: string;
  onChange: (value: string) => void;
  /** Fired when the last digit arrives. */
  onComplete?: (code: string) => void;
  disabled?: boolean;
  /** Red error styling for the whole row. */
  error?: boolean;
  autoFocus?: boolean;
}

/**
 * Six-slot code input backed by ONE hidden native TextInput.
 *
 * A single input is what makes paste and native one-tap auto-fill work
 * reliably: `textContentType="oneTimeCode"` (iOS) and
 * `autoComplete="one-time-code"` (Android) let the OS inject the code
 * from the email in one tap.
 */
export function OtpInput({
  length = CODE_LENGTH,
  value,
  onChange,
  onComplete,
  disabled = false,
  error = false,
  autoFocus = true,
}: OtpInputProps) {
  const inputRef = useRef<TextInputInstance>(null);
  const [isFocused, setIsFocused] = useState(false);
  const [cursorVisible, setCursorVisible] = useState(true);

  // Blinking cursor for the active slot
  useEffect(() => {
    if (!isFocused) return;
    const interval = setInterval(() => {
      setCursorVisible((prev) => !prev);
    }, 550);
    return () => clearInterval(interval);
  }, [isFocused]);

  const handleChangeText = (text: string) => {
    const cleaned = text.replace(/[^0-9]/g, '').slice(0, length);
    onChange(cleaned);

    if (cleaned.length === length) {
      onComplete?.(cleaned);
    }
  };

  const slots = Array.from({ length }, (_, i) => i);

  return (
    <TouchableOpacity
      style={{ width: '100%' }}
      activeOpacity={1}
      onPress={() => {
        if (!disabled) inputRef.current?.focus();
      }}>
      <View
        style={{
          flexDirection: 'row',
          width: '100%',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginVertical: 12,
        }}>
        {slots.map((index) => {
          const char = value[index] ?? '';
          const isSlotActive = isFocused && index === value.length && !disabled;
          const isFilled = char !== '';

          let borderColor = '#e5e7eb';
          let backgroundColor = '#f8fafc';
          if (error) {
            borderColor = '#f43f5e';
            backgroundColor = '#fff1f2';
          } else if (isSlotActive) {
            borderColor = '#3b82f6';
            backgroundColor = '#ffffff';
          } else if (isFilled) {
            borderColor = '#94a3b8';
            backgroundColor = '#ffffff';
          }

          return (
            <View
              key={index}
              style={{
                flex: 1,
                maxWidth: 48,
                height: 56,
                borderRadius: 8,
                alignItems: 'center',
                justifyContent: 'center',
                marginHorizontal: 4,
                borderWidth: isSlotActive ? 2 : 1,
                borderColor,
                backgroundColor,
              }}>
              {char ? (
                <Text
                  style={{
                    fontSize: 24,
                    fontWeight: '700',
                    color: error ? '#e11d48' : '#1e293b',
                  }}>
                  {char}
                </Text>
              ) : isSlotActive && cursorVisible ? (
                <View
                  style={{
                    width: 2,
                    height: 24,
                    backgroundColor: '#3b82f6',
                    borderRadius: 2,
                  }}
                />
              ) : null}
            </View>
          );
        })}
      </View>

      <TextInput
        ref={inputRef}
        value={value}
        onChangeText={handleChangeText}
        keyboardType="number-pad"
        textContentType="oneTimeCode"
        autoComplete={Platform.OS === 'android' ? 'one-time-code' : undefined}
        maxLength={length}
        editable={!disabled}
        autoFocus={autoFocus}
        onFocus={() => setIsFocused(true)}
        onBlur={() => setIsFocused(false)}
        caretHidden
        style={{
          position: 'absolute',
          top: 0,
          bottom: 0,
          left: 0,
          right: 0,
          opacity: 0,
        }}
        accessibilityLabel={`${length}-digit verification code`}
      />
    </TouchableOpacity>
  );
}
