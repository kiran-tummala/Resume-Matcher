'use client';

import React, { useMemo, useState } from 'react';
import { createBrowserClient } from '@supabase/ssr';
import { Button, Field, Notice, TextInput } from '@/components/workspace/ui';

interface Props {
  supabaseUrl: string;
  supabaseKey: string;
  nextPath: string;
  /** The gate sent us back: signed in with an address that is not allowed. */
  denied?: boolean;
  labels: {
    email: string;
    password: string;
    submit: string;
    submitting: string;
    failed: string;
    notAllowed: string;
    invite: string;
  };
}

/** Email + password sign-in. Accounts are invited by an admin in Supabase. */
export function LoginForm({ supabaseUrl, supabaseKey, nextPath, denied = false, labels }: Props) {
  const supabase = useMemo(
    () => createBrowserClient(supabaseUrl, supabaseKey),
    [supabaseUrl, supabaseKey]
  );
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(denied ? labels.notAllowed : null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const { error: signInError } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });
    if (signInError) {
      setError(labels.failed);
      setBusy(false);
      return;
    }
    // A full navigation lets the server gate see the new session cookie. If the
    // address isn't on the allow-list, the gate sends us straight back here.
    window.location.assign(nextPath);
  };

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <Field label={labels.email} htmlFor="login-email">
        <TextInput
          id="login-email"
          type="email"
          autoComplete="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
      </Field>
      <Field label={labels.password} htmlFor="login-password">
        <TextInput
          id="login-password"
          type="password"
          autoComplete="current-password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
      </Field>
      {error && <Notice tone="error">{error}</Notice>}
      <Button type="submit" disabled={busy} className="w-full">
        {busy ? labels.submitting : labels.submit}
      </Button>
      <p className="text-sm text-bp-muted">{labels.invite}</p>
    </form>
  );
}
