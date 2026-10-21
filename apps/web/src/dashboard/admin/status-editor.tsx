import { Alert, Button, Input, Modal, Select, Space, Typography } from 'antd';
import { useEffect, useState } from 'react';
import { getStatusSet, putStatusSet, resetStatusSet } from '../../identity/session-client';

type StatusRow = { key: string; name: string; category: string; color: string };
const categories = [
  { value: 'not_started', label: 'Not started' },
  { value: 'active', label: 'In progress' },
  { value: 'done', label: 'Done' },
  { value: 'closed', label: 'Closed' },
];
const categoryLabel = (value: string) =>
  categories.find((item) => item.value === value)?.label ?? value;
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
  const [previewOpen, setPreviewOpen] = useState(false);
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
      <Typography.Text type="secondary">
        A status is a board column. “Todo” means work that has not started. The key (for example,
        todo) is its stable stored ID; the display name is what people see. Stage describes
        progress, and color marks the column. Rows are shown in board order.
      </Typography.Text>
      {error && (
        <Alert
          type="error"
          showIcon
          message={error}
          description="Your draft is preserved. Correct the blocker and save again."
        />
      )}
      <div className="status-editor-table">
        <div className="status-editor-head" aria-hidden="true">
          <span>Key · stored ID</span>
          <span>Display name</span>
          <span>Stage</span>
          <span>Color</span>
          <span>Order</span>
          <span />
        </div>
        {rows.map((row, index) => (
          <div className="status-editor-row" key={index}>
            <Input
              aria-label={`Stored key for status ${index + 1}`}
              placeholder="key"
              value={row.key}
              readOnly={local && Boolean(row.key)}
              onChange={(event) => edit(index, { key: event.target.value })}
            />
            <Input
              aria-label={`Display name for status ${index + 1}`}
              placeholder="Name"
              value={row.name}
              onChange={(event) => edit(index, { name: event.target.value })}
            />
            <Select
              aria-label={`Stage for status ${index + 1}`}
              value={row.category}
              options={categories}
              onChange={(category) => edit(index, { category })}
            />
            <Input
              aria-label={`Color for status ${index + 1}`}
              type="color"
              value={row.color}
              onChange={(event) => edit(index, { color: event.target.value })}
            />
            <Space size={4}>
              <Button
                aria-label={`Move ${row.name || 'status'} up`}
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
                aria-label={`Move ${row.name || 'status'} down`}
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
            </Space>
            <Button danger onClick={() => setRows((old) => old.filter((_, i) => i !== index))}>
              Remove
            </Button>
          </div>
        ))}
      </div>
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
        <Button onClick={() => setPreviewOpen(true)}>Preview status flow</Button>
        {ownerId && local && (
          <Button loading={busy} onClick={() => void reset()}>
            Reset to inheritance
          </Button>
        )}
      </Space>
      <Modal
        title="Status flow preview"
        open={previewOpen}
        onCancel={() => setPreviewOpen(false)}
        footer={null}
        width={720}
      >
        <Typography.Paragraph type="secondary">
          This previews board order from your current draft. Arrows show sequence, not required
          transitions: tasks may move to any status.
        </Typography.Paragraph>
        <div className="status-preview-flow">
          {rows.map((row, index) => (
            <div className="status-preview-step" key={`${row.key}-${index}`}>
              <div className="status-preview-card" style={{ borderColor: row.color }}>
                <span className="status-preview-dot" style={{ backgroundColor: row.color }} />
                <strong>{row.name || 'Unnamed status'}</strong>
                <span className="status-preview-stage">{categoryLabel(row.category)}</span>
              </div>
              {index < rows.length - 1 && <span className="status-preview-arrow">→</span>}
            </div>
          ))}
        </div>
      </Modal>
    </Space>
  );
}
