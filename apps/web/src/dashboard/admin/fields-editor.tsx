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
  async function move(index: number, delta: number) {
    const ids = items.map((item) => item.id);
    [ids[index], ids[index + delta]] = [ids[index + delta], ids[index]];
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
      {items.map((field, index) => (
        <Space key={field.id} wrap>
          <Button type="link" onClick={() => select(field)}>
            {field.name} <Tag>{field.key}</Tag>
          </Button>
          <Tag>{field.type}</Tag>
          {field.required && <Tag color="red">required</Tag>}
          <Button disabled={busy || index === 0} onClick={() => void move(index, -1)}>
            ↑
          </Button>
          <Button disabled={busy || index === items.length - 1} onClick={() => void move(index, 1)}>
            ↓
          </Button>
          <Button danger disabled={busy} onClick={() => void remove(field.id)}>
            Delete
          </Button>
        </Space>
      ))}
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
