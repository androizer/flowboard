import { Select, Space, Tabs, Typography } from 'antd';
import { useState } from 'react';
import type { Container } from '@flowboard/contracts';
import { StatusEditor } from './status-editor';
import { FieldsEditor } from './fields-editor';
import { GrantsEditor } from './grants-editor';
import { HierarchyEditor } from './hierarchy-editor';

type Node = Container & { visibility?: 'public' | 'private' };

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
