import { Alert, Button, Input, Select, Space, Typography } from 'antd';
import { useEffect, useState } from 'react';
import { getStatusSet, putStatusSet, resetStatusSet } from '../../identity/session-client';

type StatusRow = { key: string; name: string; category: string; color: string };
const categories = ['not_started', 'active', 'done', 'closed'];
const errorText = (error: unknown) =>
  error instanceof Error ? error.message : 'Unable to save changes.';

export function StatusEditor({
  accessToken,
  workspaceId,
  ownerId,
  onChanged,
}: {
  accessToken: string;
  workspaceId: string;
  ownerId: string | null;
  onChanged: () => void;
}) {
  const [local, setLocal] = useState(false);
  const [source, setSource] = useState('workspace');
  const [rows, setRows] = useState<StatusRow[]>([]);
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    let active = true;
    setError(undefined);
    void getStatusSet(accessToken, workspaceId, ownerId)
      .then((result) => {
        if (!active) return;
        setLocal(Boolean(result.local));
        setSource(result.inherited?.statusSource.type ?? 'workspace');
        setRows(
          (result.local?.statuses ?? result.inherited?.statuses ?? []).map(
            ({ key, name, category, color }) => ({ key, name, category, color }),
          ),
        );
      })
      .catch((cause) => active && setError(errorText(cause)));
    return () => {
      active = false;
    };
  }, [accessToken, workspaceId, ownerId]);
  const edit = (index: number, patch: Partial<StatusRow>) =>
    setRows((old) => old.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  async function save() {
    setBusy(true);
    setError(undefined);
    try {
      await putStatusSet(accessToken, workspaceId, ownerId, rows);
      setLocal(true);
      onChanged();
    } catch (cause) {
      setError(errorText(cause));
    } finally {
      setBusy(false);
    }
  }
  async function reset() {
    if (!ownerId) return;
    setBusy(true);
    setError(undefined);
    try {
      await resetStatusSet(accessToken, ownerId);
      const result = await getStatusSet(accessToken, workspaceId, ownerId);
      setRows(
        (result.inherited?.statuses ?? []).map(({ key, name, category, color }) => ({
          key,
          name,
          category,
          color,
        })),
      );
      setLocal(false);
      onChanged();
    } catch (cause) {
      setError(errorText(cause));
    } finally {
      setBusy(false);
    }
  }
  return (
    <Space direction="vertical" style={{ width: '100%' }}>
      <Typography.Text>
        {local ? 'Local status set' : `Inherited from ${source}. Saving creates a local copy.`}
      </Typography.Text>
      {error && (
        <Alert
          type="error"
          showIcon
          message={error}
          description="Your draft is preserved. Correct the blocker and save again."
        />
      )}
      {rows.map((row, index) => (
        <Space key={index} wrap>
          <Input
            aria-label="Status key"
            placeholder="key"
            value={row.key}
            disabled={local && Boolean(row.key)}
            onChange={(event) => edit(index, { key: event.target.value })}
            style={{ width: 125 }}
          />
          <Input
            aria-label="Status name"
            placeholder="Name"
            value={row.name}
            onChange={(event) => edit(index, { name: event.target.value })}
            style={{ width: 160 }}
          />
          <Select
            aria-label="Status category"
            value={row.category}
            options={categories.map((value) => ({ value, label: value }))}
            onChange={(category) => edit(index, { category })}
            style={{ width: 145 }}
          />
          <Input
            aria-label="Status color"
            type="color"
            value={row.color}
            onChange={(event) => edit(index, { color: event.target.value })}
            style={{ width: 70 }}
          />
          <Button
            disabled={index === 0}
            onClick={() =>
              setRows((old) => {
                const next = [...old];
                [next[index - 1], next[index]] = [next[index], next[index - 1]];
                return next;
              })
            }
          >
            ↑
          </Button>
          <Button
            disabled={index === rows.length - 1}
            onClick={() =>
              setRows((old) => {
                const next = [...old];
                [next[index], next[index + 1]] = [next[index + 1], next[index]];
                return next;
              })
            }
          >
            ↓
          </Button>
          <Button danger onClick={() => setRows((old) => old.filter((_, i) => i !== index))}>
            Remove
          </Button>
        </Space>
      ))}
      <Space>
        <Button
          onClick={() =>
            setRows((old) => [...old, { key: '', name: '', category: 'active', color: '#1677ff' }])
          }
        >
          Add status
        </Button>
        <Button type="primary" loading={busy} onClick={() => void save()}>
          Save full set
        </Button>
        {ownerId && local && (
          <Button loading={busy} onClick={() => void reset()}>
            Reset to inheritance
          </Button>
        )}
      </Space>
    </Space>
  );
}
