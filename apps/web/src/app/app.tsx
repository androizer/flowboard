import { ConfigProvider, Spin } from 'antd';
import { useEffect, useState } from 'react';
import { Dashboard } from '../dashboard/dashboard';
import { LoginScreen } from '../identity/login-screen';
import { Actor, getCurrentActor, login, logout, refresh } from '../identity/session-client';

type SessionState =
  | { status: 'loading' }
  | { status: 'signed-out' }
  | { status: 'signed-in'; actor: Actor; accessToken: string };

export function App() {
  const [session, setSession] = useState<SessionState>({ status: 'loading' });

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const { accessToken } = await refresh();
        const actor = await getCurrentActor(accessToken);
        if (active) setSession({ status: 'signed-in', actor, accessToken });
      } catch {
        if (active) setSession({ status: 'signed-out' });
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  async function signIn(loginIdentifier: string, password: string) {
    const { accessToken } = await login(loginIdentifier, password);
    const actor = await getCurrentActor(accessToken);
    setSession({ status: 'signed-in', actor, accessToken });
  }

  async function signOut() {
    if (session.status === 'signed-in') await logout(session.accessToken);
    setSession({ status: 'signed-out' });
  }

  return (
    <ConfigProvider theme={{ token: { colorPrimary: '#1677ff', borderRadius: 10 } }}>
      {session.status === 'loading' && (
        <main className="app-loading">
          <Spin size="large" tip="Restoring your session…" />
        </main>
      )}
      {session.status === 'signed-out' && <LoginScreen onSignIn={signIn} />}
      {session.status === 'signed-in' && (
        <Dashboard actor={session.actor} accessToken={session.accessToken} onSignOut={signOut} />
      )}
    </ConfigProvider>
  );
}
