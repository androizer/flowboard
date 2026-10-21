import { Alert, Button, Divider, Input, Modal, Select, Space, Tag, Typography } from 'antd';
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
