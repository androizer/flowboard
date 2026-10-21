import { HolderOutlined } from '@ant-design/icons';
import { Alert, Button, Checkbox, Divider, Input, Select, Space, Tag, Typography } from 'antd';
import { useEffect, useState } from 'react';
import type { Container } from '@flowboard/contracts';
import {
  createField,
  deleteField,
  getLocalFields,
  reorderFields,
  updateField,
} from '../../identity/session-client';
import type { LocalField } from '../../identity/session-client';

type Node = Container & { visibility?: 'public' | 'private' };
type FieldDraft = {
  key: string;
  name: string;
  type: string;
  required: boolean;
  options: Array<{ id?: string; label: string; color: string }>;
};
const fieldTypes = ['text', 'number', 'single_select', 'multi_select', 'date', 'checkbox'];
const errorText = (error: unknown) =>
  error instanceof Error ? error.message : 'Unable to save changes.';

export function FieldsEditor({
  accessToken,
  ownerId,
  containers,
  onChanged,
}: {
  accessToken: string;
  ownerId: string;
  containers: Node[];
  onChanged: () => void;
}) {
  const [items, setItems] = useState<LocalField[]>([]);
  const [inherited, setInherited] = useState<Array<{ field: LocalField; owner: string }>>([]);
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState<FieldDraft>({
    key: '',
    name: '',
    type: 'text',
    required: false,
    options: [],
  });
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);
  const [draggedId, setDraggedId] = useState<string>();
  const [dropId, setDropId] = useState<string>();
  useEffect(() => {
    let active = true;
    setEditing(null);
    setError(undefined);
    void getLocalFields(accessToken, ownerId)
      .then((rows) => {
        if (active) setItems(rows);
      })
      .catch((cause) => active && setError(errorText(cause)));
    return () => {
      active = false;
    };
  }, [accessToken, ownerId]);
  useEffect(() => {
    let active = true;
    const ancestors: Node[] = [];
    let current = containers.find((node) => node.id === ownerId);
    while (current?.parentContainerId) {
      const parent = containers.find((node) => node.id === current?.parentContainerId);
      if (!parent) break;
      ancestors.unshift(parent);
      current = parent;
    }
    void Promise.all(
      ancestors.map(async (owner) =>
        (await getLocalFields(accessToken, owner.id)).map((field) => ({
          field,
          owner: owner.name,
        })),
      ),
    )
      .then((groups) => {
        if (active) setInherited(groups.flat());
      })
      .catch((cause) => active && setError(errorText(cause)));
    return () => {
      active = false;
    };
  }, [accessToken, ownerId, containers]);
  function select(field?: LocalField) {
    setEditing(field?.id ?? 'new');
    setError(undefined);
    setDraft(
      field
        ? {
            key: field.key,
            name: field.name,
            type: field.type,
            required: field.required,
            options: field.options.map((option) => ({ ...option })),
          }
        : { key: '', name: '', type: 'text', required: false, options: [] },
    );
  }
  async function refresh() {
    try {
      setItems(await getLocalFields(accessToken, ownerId));
      onChanged();
    } catch {
      setError('Change saved, but the field list could not refresh. Reopen this container.');
    }
  }
  async function save() {
    setBusy(true);
    setError(undefined);
    try {
      if (editing === 'new') await createField(accessToken, ownerId, draft);
      else if (editing) await updateField(accessToken, editing, draft);
      await refresh();
      setEditing(null);
    } catch (cause) {
      setError(errorText(cause));
    } finally {
      setBusy(false);
    }
  }
  async function remove(id: string) {
    setBusy(true);
    setError(undefined);
    try {
      await deleteField(accessToken, id);
      await refresh();
      if (editing === id) setEditing(null);
    } catch (cause) {
      setError(errorText(cause));
    } finally {
      setBusy(false);
    }
  }
  async function move(sourceId: string, targetId: string) {
    const ids = items.map((item) => item.id);
    const from = ids.indexOf(sourceId);
    const to = ids.indexOf(targetId);
    if (from < 0 || to < 0 || from === to || busy) return;
    ids.splice(from, 1);
    ids.splice(to, 0, sourceId);
    setBusy(true);
    setError(undefined);
    try {
      await reorderFields(accessToken, ownerId, ids);
      await refresh();
    } catch (cause) {
      setError(errorText(cause));
    } finally {
      setBusy(false);
    }
  }
  return (
    <Space direction="vertical" style={{ width: '100%' }}>
      <Typography.Text>
        Local fields only. Inherited fields are edited at their owning container.
      </Typography.Text>
      {inherited.length > 0 && (
        <Space wrap>
          {inherited.map(({ field, owner }) => (
            <Tag key={field.id}>
              {field.name} · from {owner}
            </Tag>
          ))}
        </Space>
      )}
      {error && (
        <Alert
          type="error"
          showIcon
          message={error}
          description="Your draft is preserved. Correct the blocker and save again."
        />
      )}
      <Typography.Text type="secondary">
        Drag a field by its handle to change its order. The new order saves when dropped.
      </Typography.Text>
      <div className="field-order-list" role="list" aria-label="Local fields in display order">
        {items.map((field, index) => (
          <div
            className={`field-order-row${dropId === field.id ? ' drop-target' : ''}`}
            key={field.id}
            role="listitem"
            onDragOver={(event) => {
              if (!draggedId || busy) return;
              event.preventDefault();
              event.dataTransfer.dropEffect = 'move';
              setDropId(field.id);
            }}
            onDragLeave={() => setDropId((old) => (old === field.id ? undefined : old))}
            onDrop={(event) => {
              event.preventDefault();
              const sourceId = event.dataTransfer.getData('text/plain') || draggedId;
              setDraggedId(undefined);
              setDropId(undefined);
              if (sourceId) void move(sourceId, field.id);
            }}
          >
            <span
              className="field-drag-handle"
              draggable={!busy}
              role="button"
              tabIndex={0}
              aria-label={`Drag ${field.name} to reorder; use arrow keys for keyboard`}
              onDragStart={(event) => {
                setDraggedId(field.id);
                event.dataTransfer.effectAllowed = 'move';
                event.dataTransfer.setData('text/plain', field.id);
              }}
              onDragEnd={() => {
                setDraggedId(undefined);
                setDropId(undefined);
              }}
              onKeyDown={(event) => {
                if (event.key === 'ArrowUp' && index > 0) {
                  event.preventDefault();
                  void move(field.id, items[index - 1].id);
                }
                if (event.key === 'ArrowDown' && index < items.length - 1) {
                  event.preventDefault();
                  void move(field.id, items[index + 1].id);
                }
              }}
            >
              <HolderOutlined />
            </span>
            <Button type="link" className="field-order-name" onClick={() => select(field)}>
              {field.name}
            </Button>
            <Tag>{field.key}</Tag>
            <Tag>{field.type.replaceAll('_', ' ')}</Tag>
            {field.required && <Tag color="red">Required</Tag>}
            <Button danger disabled={busy} onClick={() => void remove(field.id)}>
              Delete
            </Button>
          </div>
        ))}
      </div>
      <Button onClick={() => select()}>Add field</Button>
      {editing && (
        <>
          <Divider />
          <Typography.Title level={5}>
            {editing === 'new' ? 'New field' : 'Edit field'}
          </Typography.Title>
          <Space wrap>
            <Input
              placeholder="Immutable key"
              value={draft.key}
              disabled={editing !== 'new'}
              onChange={(event) => setDraft({ ...draft, key: event.target.value })}
            />
            <Input
              placeholder="Display name"
              value={draft.name}
              onChange={(event) => setDraft({ ...draft, name: event.target.value })}
            />
            <Select
              value={draft.type}
              options={fieldTypes.map((value) => ({ value, label: value }))}
              onChange={(type) =>
                setDraft({ ...draft, type, options: type.includes('select') ? draft.options : [] })
              }
              style={{ width: 160 }}
            />
            <Checkbox
              checked={draft.required}
              onChange={(event) => setDraft({ ...draft, required: event.target.checked })}
            >
              Required
            </Checkbox>
          </Space>
          {draft.type.includes('select') && (
            <Space direction="vertical">
              {draft.options.map((option, index) => (
                <Space key={option.id ?? index}>
                  <Input
                    placeholder="Option label"
                    value={option.label}
                    onChange={(event) =>
                      setDraft({
                        ...draft,
                        options: draft.options.map((row, i) =>
                          i === index ? { ...row, label: event.target.value } : row,
                        ),
                      })
                    }
                  />
                  <Input
                    type="color"
                    value={option.color}
                    onChange={(event) =>
                      setDraft({
                        ...draft,
                        options: draft.options.map((row, i) =>
                          i === index ? { ...row, color: event.target.value } : row,
                        ),
                      })
                    }
                    style={{ width: 70 }}
                  />
                  <Button
                    onClick={() =>
                      setDraft({ ...draft, options: draft.options.filter((_, i) => i !== index) })
                    }
                  >
                    Remove
                  </Button>
                </Space>
              ))}
              <Button
                onClick={() =>
                  setDraft({
                    ...draft,
                    options: [...draft.options, { label: '', color: '#1677ff' }],
                  })
                }
              >
                Add option
              </Button>
            </Space>
          )}
          <Space>
            <Button type="primary" loading={busy} onClick={() => void save()}>
              Save field
            </Button>
            <Button onClick={() => setEditing(null)}>Cancel</Button>
          </Space>
        </>
      )}
    </Space>
  );
}
