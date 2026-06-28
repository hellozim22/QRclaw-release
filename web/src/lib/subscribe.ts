/**
 * Newsletter subscription API client.
 * Validates email client-side, then POSTs to Gateway /api/subscribe.
 */

import { SUBSCRIBE_EMAIL_MAX_LENGTH } from '@shared/contracts/http/subscribers/types';

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const GATEWAY_URL = process.env.NEXT_PUBLIC_GATEWAY_URL ?? 'https://gateway-test.qrclaw.ai';

export interface SubscribeResult {
  success: boolean;
  message?: string;
  error?: string;
}

/**
 * Submit email subscription to Gateway API.
 * Returns { success: true } on success (including duplicate emails).
 * Returns { success: false, error } on validation or network failure.
 */
export const submitSubscription = async (rawEmail: string): Promise<SubscribeResult> => {
  const email = rawEmail.trim().toLowerCase();

  // Client-side validation
  if (!email) {
    return { success: false, error: 'Please enter your email address.' };
  }

  if (!EMAIL_REGEX.test(email) || email.length > SUBSCRIBE_EMAIL_MAX_LENGTH) {
    return { success: false, error: 'Please enter a valid email address.' };
  }

  try {
    const response = await fetch(`${GATEWAY_URL}/api/subscribe`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email }),
    });

    let data: { success?: boolean; message?: string; error?: string };
    try {
      data = await response.json();
    } catch {
      return {
        success: false,
        error: 'Unexpected server response. Please try again.',
      };
    }

    if (response.ok) {
      return { success: true, message: data.message ?? 'Subscribed successfully' };
    }

    return {
      success: false,
      error: data.error ?? 'Subscription failed. Please try again.',
    };
  } catch {
    return {
      success: false,
      error: 'Network error. Please check your connection and try again.',
    };
  }
};
