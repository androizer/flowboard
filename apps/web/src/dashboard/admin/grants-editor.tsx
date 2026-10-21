import { Alert, Button, Select, Space, Tag, Typography } from 'antd';
import { useEffect, useState } from 'react';
import { deleteGrant, getGrants, putGrant } from '../../identity/session-client';
import type { Grant } from '../../identity/session-client';

const errorText = (error: unknown) =>
  error instanceof Error ? error.message : 'Unable to save changes.';

export function GrantsEditor({
  accessToken,
  ownerId,
  members,
}: {
  accessToken: string;
  ownerId: string;
  members: Array<{ id: string; name: string }>;
}) {
  const [items, setItems] = useState<Grant[]>([]);
  const [userId, setUserId] = useState<string>();
  const [mode, setMode] = useState<Grant['mode']>('allow');
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    let active = true;
    setError(undefined);
    void getGrants(accessToken, ownerId)
      .then((result) => {
        if (active) setItems(result.items);
      })
      .catch((cause) => active && setError(errorText(cause)));
    return () => {
      active = false;
    };
  }, [accessToken, ownerId]);
  async function change(target: string, next?: Grant['mode']) {
    setBusy(true);
    setError(undefined);
    try {
      if (next) await putGrant(accessToken, ownerId, target, next);
      else await deleteGrant(accessToken, ownerId, target);
      setItems((await getGrants(accessToken, ownerId)).items);
    } catch (cause) {
      setError(errorText(cause));
    } finally {
      setBusy(false);
    }
  }
  return (
    <Space direction="vertical" style={{ width: '100%' }}>
      <Typography.Text>
        Deny on any ancestor blocks a member. A child allow cannot reopen a blocked parent.
      </Typography.Text>
      {error && <Alert type="error" showIcon message={error} />}
      {items.map((grant) => (
        <Space key={grant.userId}>
          <span>{members.find((user) => user.id === grant.userId)?.name ?? grant.userId}</span>
          <Tag color={grant.mode === 'deny' ? 'red' : 'green'}>{grant.mode}</Tag>
          <Button
            disabled={busy}
            onClick={() => void change(grant.userId, grant.mode === 'allow' ? 'deny' : 'allow')}
          >
            Switch
          </Button>
          <Button disabled={busy} onClick={() => void change(grant.userId)}>
            Remove
          </Button>
        </Space>
      ))}
      <Space wrap>
        <Select
          showSearch
          optionFilterProp="label"
          placeholder="Member"
          value={userId}
          options={members.map((user) => ({ value: user.id, label: user.name }))}
          onChange={setUserId}
          style={{ width: 200 }}
        />
        <Select
          value={mode}
          options={['allow', 'deny'].map((value) => ({ value, label: value }))}
          onChange={setMode}
          style={{ width: 110 }}
        />
        <Button
          type="primary"
          disabled={!userId}
          loading={busy}
          onClick={() => userId && void change(userId, mode)}
        >
          Set grant
        </Button>
      </Space>
    </Space>
  );
}
