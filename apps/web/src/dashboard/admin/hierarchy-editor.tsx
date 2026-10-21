import { Alert, Button, Divider, Input, Modal, Segmented, Select, Space, Typography } from 'antd';
import { useEffect, useState } from 'react';
import type { Container } from '@flowboard/contracts';
import {
  archiveContainer,
  createContainer,
  getWorkspace,
  renameWorkspace,
  reorderContainers,
  updateContainer,
} from '../../identity/session-client';

type Node = Container & { visibility?: 'public' | 'private' };
type CreateType = 'space' | 'folder' | 'list';
const errorText = (error: unknown) =>
  error instanceof Error ? error.message : 'Unable to save changes.';

export function HierarchyEditor({
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
  onChanged: (createdId?: string) => Promise<void>;
}) {
  const [workspaceName, setWorkspaceName] = useState('');
  const [name, setName] = useState('');
  const [visibility, setVisibility] = useState<'public' | 'private'>('public');
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
      <Divider />
      <ContainerCreator
        accessToken={accessToken}
        selected={selected}
        containers={containers}
        onChanged={onChanged}
      />
    </Space>
  );
}

/** Shared creation form; the API decides which parents the current member may use. */
export function ContainerCreator({
  accessToken,
  selected,
  containers,
  onChanged,
}: {
  accessToken: string;
  selected: Node | undefined;
  containers: Node[];
  onChanged: (createdId?: string) => Promise<void>;
}) {
  const [childName, setChildName] = useState('');
  const [createType, setCreateType] = useState<CreateType>('space');
  const [parentId, setParentId] = useState<string | null>(null);
  const [visibility, setVisibility] = useState<'public' | 'private'>('public');
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!selected) {
      setCreateType('space');
      setParentId(null);
    } else if (selected.type === 'space') {
      setCreateType('folder');
      setParentId(selected.id);
    } else if (selected.type === 'folder') {
      setCreateType('list');
      setParentId(selected.id);
    } else {
      setCreateType('list');
      setParentId(selected.parentContainerId);
    }
  }, [selected?.id]);

  const parentOptions = containers
    .filter((item) => item.type === (createType === 'folder' ? 'space' : 'folder'))
    .map((item) => ({ value: item.id, label: item.name }));
  function chooseCreateType(type: CreateType) {
    setCreateType(type);
    if (type === 'space') setParentId(null);
    else if (selected?.type === (type === 'folder' ? 'space' : 'folder')) setParentId(selected.id);
    else if (type === 'list' && selected?.type === 'list') setParentId(selected.parentContainerId);
    else
      setParentId(
        containers.find((item) => item.type === (type === 'folder' ? 'space' : 'folder'))?.id ??
          null,
      );
  }
  async function create() {
    setBusy(true);
    setError(undefined);
    try {
      const created = await createContainer(accessToken, {
        parentId: createType === 'space' ? null : parentId,
        type: createType,
        name: childName,
        visibility,
      });
      setChildName('');
      await onChanged(created.id);
    } catch (cause) {
      setError(errorText(cause));
    } finally {
      setBusy(false);
    }
  }
  return (
    <Space direction="vertical" style={{ width: '100%' }}>
      <Typography.Title level={5}>Create a space, folder, or list</Typography.Title>
      <Typography.Text type="secondary">
        Flowboard contains spaces. Spaces contain folders, folders contain lists, and lists hold
        tasks. A folder groups related lists; it does not hold tasks directly. You can create under
        any parent you can access.
      </Typography.Text>
      {error && (
        <Alert type="error" showIcon message={error} description="Your input is preserved." />
      )}
      <Segmented
        value={createType}
        options={[
          { value: 'space', label: 'New space' },
          { value: 'folder', label: 'New folder' },
          { value: 'list', label: 'New list' },
        ]}
        onChange={(value) => chooseCreateType(value as CreateType)}
      />
      <Space wrap>
        <Input
          aria-label={`New ${createType} name`}
          placeholder={`${createType[0].toUpperCase()}${createType.slice(1)} name`}
          value={childName}
          onChange={(event) => setChildName(event.target.value)}
          style={{ width: 220 }}
        />
        {createType === 'space' ? (
          <Typography.Text>Inside Flowboard workspace</Typography.Text>
        ) : (
          <Select
            aria-label={`Parent ${createType === 'folder' ? 'space' : 'folder'}`}
            placeholder={`Choose a ${createType === 'folder' ? 'space' : 'folder'}`}
            value={parentId ?? undefined}
            options={parentOptions}
            onChange={setParentId}
            style={{ width: 210 }}
          />
        )}
        <Select
          aria-label={`New ${createType} visibility`}
          value={visibility}
          options={[
            {
              value: 'public',
              label: createType === 'space' ? 'All workspace members' : 'Anyone with parent access',
            },
            { value: 'private', label: 'Private' },
          ]}
          onChange={setVisibility}
          style={{ width: createType === 'space' ? 190 : 210 }}
        />
        <Button
          type="primary"
          disabled={!childName.trim() || (createType !== 'space' && !parentId)}
          loading={busy}
          onClick={() => void create()}
        >
          Create {createType}
        </Button>
      </Space>
      <Typography.Text type="secondary">
        Access always requires every parent. A public folder or list inside a private parent is
        visible only to members who can access that parent. Share a private parent first if needed.
      </Typography.Text>
    </Space>
  );
}
