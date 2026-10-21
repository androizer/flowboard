import {
  Alert,
  Button,
  Checkbox,
  Divider,
  Input,
  Modal,
  Select,
  Space,
  Tabs,
  Tag,
  Typography,
} from 'antd';
import { useEffect, useState } from 'react';
import type { Container } from '@flowboard/contracts';
import {
  archiveContainer,
  createContainer,
  createField,
  deleteField,
  deleteGrant,
  getGrants,
  getLocalFields,
  getStatusSet,
  getWorkspace,
  putGrant,
  putStatusSet,
  renameWorkspace,
  reorderContainers,
  reorderFields,
  resetStatusSet,
  updateContainer,
  updateField,
} from '../identity/session-client';
import type { Grant, LocalField } from '../identity/session-client';

type Node = Container & { visibility?: 'public' | 'private' };
type StatusRow = { key: string; name: string; category: string; color: string };
type FieldDraft = {
  key: string;
  name: string;
  type: string;
  required: boolean;
  options: Array<{ id?: string; label: string; color: string }>;
};
const fieldTypes = ['text', 'number', 'single_select', 'multi_select', 'date', 'checkbox'];
const categories = ['not_started', 'active', 'done', 'closed'];
const errorText = (error: unknown) =>
  error instanceof Error ? error.message : 'Unable to save changes.';

function StatusEditor({
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

function FieldsEditor({
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

function GrantsEditor({
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

function HierarchyEditor({
  accessToken,
  workspaceId,
  selected,
  containers,
  onChanged,
}: {
  accessToken: string;
  workspaceId: string;
  selected: Node | undefined;
  containers: Node[];
  onChanged: () => Promise<void>;
}) {
  const [workspaceName, setWorkspaceName] = useState('');
  const [name, setName] = useState('');
  const [visibility, setVisibility] = useState<'public' | 'private'>('public');
  const [childName, setChildName] = useState('');
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    void getWorkspace(accessToken, workspaceId)
      .then((row) => setWorkspaceName(row.name))
      .catch((cause) => setError(errorText(cause)));
  }, [accessToken, workspaceId]);
  useEffect(() => {
    setName(selected?.name ?? '');
    setVisibility(selected?.visibility ?? 'public');
    setError(undefined);
  }, [selected?.id, selected?.name, selected?.visibility]);
  async function run(action: () => Promise<unknown>) {
    setBusy(true);
    setError(undefined);
    try {
      await action();
      await onChanged();
    } catch (cause) {
      setError(errorText(cause));
    } finally {
      setBusy(false);
    }
  }
  const childType = !selected
    ? 'space'
    : selected.type === 'space'
      ? 'folder'
      : selected.type === 'folder'
        ? 'list'
        : undefined;
  const siblings = selected
    ? containers.filter((item) => item.parentContainerId === selected.parentContainerId)
    : [];
  const index = siblings.findIndex((item) => item.id === selected?.id);
  async function move(delta: number) {
    const ids = siblings.map((item) => item.id);
    [ids[index], ids[index + delta]] = [ids[index + delta], ids[index]];
    await run(() => reorderContainers(accessToken, selected!.parentContainerId, ids));
  }
  return (
    <Space direction="vertical" style={{ width: '100%' }}>
      {error && (
        <Alert type="error" showIcon message={error} description="Your input is preserved." />
      )}
      <Typography.Title level={5}>Workspace</Typography.Title>
      <Space>
        <Input
          aria-label="Workspace name"
          value={workspaceName}
          onChange={(event) => setWorkspaceName(event.target.value)}
        />
        <Button
          loading={busy}
          onClick={() => void run(() => renameWorkspace(accessToken, workspaceId, workspaceName))}
        >
          Rename
        </Button>
      </Space>
      {selected && (
        <>
          <Divider />
          <Typography.Title level={5}>
            {selected.type}: {selected.name}
          </Typography.Title>
          <Space wrap>
            <Input
              aria-label="Container name"
              value={name}
              onChange={(event) => setName(event.target.value)}
            />
            <Select
              value={visibility}
              options={['public', 'private'].map((value) => ({ value, label: value }))}
              onChange={setVisibility}
              style={{ width: 110 }}
            />
            <Button
              loading={busy}
              onClick={() =>
                void run(() => updateContainer(accessToken, selected.id, { name, visibility }))
              }
            >
              Save
            </Button>
            <Button disabled={index === 0 || busy} onClick={() => void move(-1)}>
              Move up
            </Button>
            <Button disabled={index === siblings.length - 1 || busy} onClick={() => void move(1)}>
              Move down
            </Button>
            <Button
              danger
              loading={busy}
              onClick={() =>
                Modal.confirm({
                  title: `Archive ${selected.name} and its branch?`,
                  onOk: () => run(() => archiveContainer(accessToken, selected.id)),
                })
              }
            >
              Archive
            </Button>
          </Space>
        </>
      )}
      {childType && (
        <>
          <Divider />
          <Typography.Title level={5}>Create {childType}</Typography.Title>
          <Space>
            <Input
              aria-label="New container name"
              placeholder="Name"
              value={childName}
              onChange={(event) => setChildName(event.target.value)}
            />
            <Button
              type="primary"
              disabled={!childName.trim()}
              loading={busy}
              onClick={() =>
                void run(async () => {
                  await createContainer(accessToken, {
                    parentId: selected?.id ?? null,
                    type: childType,
                    name: childName,
                    visibility: 'public',
                  });
                  setChildName('');
                })
              }
            >
              Create
            </Button>
          </Space>
        </>
      )}
    </Space>
  );
}

export function AdminPanel({
  accessToken,
  workspaceId,
  containers,
  members,
  onHierarchyChange,
  onConfigChange,
}: {
  accessToken: string;
  workspaceId: string;
  containers: Node[];
  members: Array<{ id: string; name: string }>;
  onHierarchyChange: () => Promise<void>;
  onConfigChange: () => void;
}) {
  const [ownerId, setOwnerId] = useState<string | null>(null);
  const selected = containers.find((node) => node.id === ownerId);
  return (
    <Space direction="vertical" style={{ width: '100%' }}>
      <Typography.Title level={2}>Workspace administration</Typography.Title>
      <Select
        showSearch
        optionFilterProp="label"
        value={ownerId ?? 'workspace'}
        onChange={(value) => setOwnerId(value === 'workspace' ? null : value)}
        options={[
          { value: 'workspace', label: 'Workspace root' },
          ...containers.map((node) => ({ value: node.id, label: `${node.type}: ${node.name}` })),
        ]}
        style={{ minWidth: 300 }}
      />
      <Tabs
        items={[
          {
            key: 'hierarchy',
            label: 'Hierarchy',
            children: (
              <HierarchyEditor
                accessToken={accessToken}
                workspaceId={workspaceId}
                selected={selected}
                containers={containers}
                onChanged={onHierarchyChange}
              />
            ),
          },
          {
            key: 'statuses',
            label: 'Statuses',
            children: (
              <StatusEditor
                accessToken={accessToken}
                workspaceId={workspaceId}
                ownerId={ownerId}
                onChanged={onConfigChange}
              />
            ),
          },
          {
            key: 'fields',
            label: 'Fields',
            children: selected ? (
              <FieldsEditor
                accessToken={accessToken}
                ownerId={selected.id}
                containers={containers}
                onChanged={onConfigChange}
              />
            ) : (
              <Typography.Text>Select a container to edit its local fields.</Typography.Text>
            ),
          },
          {
            key: 'grants',
            label: 'Grants',
            children: selected ? (
              <GrantsEditor accessToken={accessToken} ownerId={selected.id} members={members} />
            ) : (
              <Typography.Text>Select a container to edit its grants.</Typography.Text>
            ),
          },
        ]}
      />
    </Space>
  );
}
