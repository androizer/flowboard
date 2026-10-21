import { Alert, Button, Card, Form, Input, Typography } from 'antd';
import { useState } from 'react';

type LoginValues = { loginIdentifier: string; password: string };

export function LoginScreen({
  onSignIn,
}: {
  onSignIn: (loginIdentifier: string, password: string) => Promise<void>;
}) {
  const [error, setError] = useState<string>();
  const [submitting, setSubmitting] = useState(false);

  async function submit(values: LoginValues) {
    setError(undefined);
    setSubmitting(true);
    try {
      await onSignIn(values.loginIdentifier, values.password);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to sign in.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="login-page">
      <Card className="login-card">
        <div className="login-brand">Flowboard</div>
        <Typography.Title level={2}>Welcome back</Typography.Title>
        <p className="login-hint">Sign in to continue to your workspace.</p>
        {error && (
          <Alert
            closable
            showIcon
            type="error"
            message={error}
            onClose={() => setError(undefined)}
            style={{ marginBottom: 16 }}
          />
        )}
        <Form layout="vertical" requiredMark={false} onFinish={submit} autoComplete="on">
          <Form.Item
            label="Email"
            name="loginIdentifier"
            rules={[{ required: true, message: 'Enter your email address.' }]}
          >
            <Input autoComplete="username" placeholder="you@flowboard.com" size="large" />
          </Form.Item>
          <Form.Item
            label="Password"
            name="password"
            rules={[{ required: true, message: 'Enter your password.' }]}
          >
            <Input.Password
              autoComplete="current-password"
              placeholder="Your password"
              size="large"
            />
          </Form.Item>
          <Button block htmlType="submit" loading={submitting} size="large" type="primary">
            Sign in
          </Button>
        </Form>
      </Card>
    </main>
  );
}
