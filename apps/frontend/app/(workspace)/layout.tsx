import '@fontsource/ibm-plex-sans/400.css';
import '@fontsource/ibm-plex-sans/500.css';
import '@fontsource/ibm-plex-sans/600.css';
import '@fontsource/ibm-plex-sans/700.css';

import type { Metadata } from 'next';
import { connection } from 'next/server';

import { WorkspaceShell } from '@/components/workspace/shell';
import { getAuthConfig } from '@/lib/auth/config';

export const metadata: Metadata = {
  title: { default: 'BenchPilot', template: '%s | BenchPilot' },
};

export default async function WorkspaceLayout({ children }: { children: React.ReactNode }) {
  // Sign-in is a runtime setting, so read it per request (not at build time).
  await connection();
  return <WorkspaceShell authEnabled={getAuthConfig().enabled}>{children}</WorkspaceShell>;
}
