import { AppstoreOutlined, LogoutOutlined, UserOutlined } from '@ant-design/icons';
import { Alert, Button, Card, Col, Descriptions, Empty, Layout, Row, Skeleton, Statistic, Tag, Typography } from 'antd';
import { useEffect, useState } from 'react';
import { Actor, Container, getTree } from '../identity/session-client';

export function Dashboard({ actor, accessToken, onSignOut }: { actor: Actor; accessToken: string; onSignOut: () => Promise<void> }) {
  const [containers, setContainers] = useState<Container[]>();
  const [error, setError] = useState<string>();

  useEffect(() => {
    let active = true;
    void getTree(accessToken)
      .then(({ items }) => { if (active) setContainers(items); })
      .catch((cause) => { if (active) setError(cause instanceof Error ? cause.message : 'Unable to load the workspace.'); });
    return () => { active = false; };
  }, [accessToken]);

  return <Layout className="dashboard-layout">
    <header className="dashboard-header">
      <span className="dashboard-brand">Flowboard</span>
      <Button icon={<LogoutOutlined />} onClick={() => void onSignOut()}>Sign out</Button>
    </header>
    <main className="dashboard-content">
      <div className="dashboard-kicker">Your workspace</div>
      <Typography.Title className="dashboard-title">Dashboard</Typography.Title>
      <p className="dashboard-subtitle">You’re signed in. Boards and tasks will appear here as those modules are implemented.</p>
      {error && <Alert showIcon type="warning" message="Workspace unavailable" description={error} style={{ marginBottom: 24 }} />}
      <Row gutter={[20, 20]}>
        <Col xs={24} md={8}><Card className="stat-card"><Statistic prefix={<AppstoreOutlined />} title="Available containers" value={containers?.length ?? 0} loading={!containers && !error} /></Card></Col>
        <Col xs={24} md={16}><Card className="stat-card" title={<><UserOutlined /> Signed-in identity</>} extra={<Tag color={actor.role === 'admin' ? 'blue' : 'default'}>{actor.role}</Tag>}><Descriptions column={1} size="small"><Descriptions.Item label="User ID">{actor.userId}</Descriptions.Item><Descriptions.Item label="Workspace ID">{actor.workspaceId}</Descriptions.Item></Descriptions></Card></Col>
        <Col span={24}><Card title="Accessible hierarchy" extra={<Tag>Server-filtered</Tag>}>
          {!containers && !error && <Skeleton active paragraph={{ rows: 4 }} />}
          {containers?.length === 0 && <Empty description="No accessible containers yet." />}
          {containers && containers.length > 0 && <ul className="tree-list">{containers.map((container) => <li className="tree-item" key={container.id}><AppstoreOutlined /><span>{container.name}</span><span className="tree-type">{container.type}</span></li>)}</ul>}
        </Card></Col>
      </Row>
    </main>
  </Layout>;
}
