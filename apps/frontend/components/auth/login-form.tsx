'use client';

import React, { useMemo, useState } from 'react';
import { SpinnerGap } from '@phosphor-icons/react';
import { createBrowserClient } from '@supabase/ssr';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

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
    <form onSubmit={handleSubmit} className="max-w-md space-y-4">
      <div className="space-y-1">
        <Label htmlFor="login-email">{labels.email}</Label>
        <Input
          id="login-email"
          type="email"
          autoComplete="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
      </div>
      <div className="space-y-1">
        <Label htmlFor="login-password">{labels.password}</Label>
        <Input
          id="login-password"
          type="password"
          autoComplete="current-password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
      </div>
      {error && <Alert tone="error">{error}</Alert>}
      <Button type="submit" disabled={busy}>
        {busy ? (
          <>
            <SpinnerGap aria-hidden="true" className="animate-spin" />
            {labels.submitting}
          </>
        ) : (
          labels.submit
        )}
      </Button>
      <p className="text-sm text-ink-soft">{labels.invite}</p>
    </form>
  );
}
