import { Alert, Button, Select, Space, Tag, Typography } from 'antd';
import { useEffect, useState } from 'react';
import type { WorkspaceMember } from '@flowboard/contracts';
import { deleteGrant, getGrants, putGrant } from '../../identity/session-client';
import type { Grant } from '../../identity/session-client';

const errorText = (error: unknown) =>
  error instanceof Error ? error.message : 'Unable to save changes.';

export function GrantsEditor({
  accessToken,
  ownerId,
  members,
  currentUserId,
}: {
  accessToken: string;
  ownerId: string;
  members: WorkspaceMember[];
  currentUserId?: string;
}) {
  const [items, setItems] = useState<Grant[]>([]);
  const [userId, setUserId] = useState<string>();
  const [mode, setMode] = useState<Grant['mode']>('allow');
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);
  const grantableMembers = members.filter(
    (member) => member.role === 'member' && member.id !== currentUserId,
  );
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
        Share this container with workspace members. Private parents must be shared first; sharing a
        parent also opens its descendants unless a deny blocks them. Admins already have access.
      </Typography.Text>
      {error && <Alert type="error" showIcon message={error} />}
      {items
        .filter((grant) => grantableMembers.some((member) => member.id === grant.userId))
        .map((grant) => (
          <Space key={grant.userId}>
            <span>{members.find((user) => user.id === grant.userId)?.name ?? grant.userId}</span>
            <Tag color={grant.mode === 'deny' ? 'red' : 'green'}>
              {grant.mode === 'deny' ? 'Blocked' : 'Can access'}
            </Tag>
            <Button
              disabled={busy}
              onClick={() => void change(grant.userId, grant.mode === 'allow' ? 'deny' : 'allow')}
            >
              {grant.mode === 'allow' ? 'Block' : 'Allow'}
            </Button>
            <Button disabled={busy} onClick={() => void change(grant.userId)}>
              Remove rule
            </Button>
          </Space>
        ))}
      <Space wrap>
        <Select
          showSearch
          optionFilterProp="label"
          placeholder="Member"
          value={userId}
          options={grantableMembers.map((user) => ({ value: user.id, label: user.name }))}
          onChange={setUserId}
          style={{ width: 200 }}
        />
        <Select
          value={mode}
          options={[
            { value: 'allow', label: 'Can access' },
            { value: 'deny', label: 'Blocked' },
          ]}
          onChange={setMode}
          style={{ width: 125 }}
        />
        <Button
          type="primary"
          disabled={!userId}
          loading={busy}
          onClick={() => userId && void change(userId, mode)}
        >
          Save access
        </Button>
      </Space>
    </Space>
  );
}
