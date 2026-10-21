import {
  AppstoreOutlined,
  HomeOutlined,
  LogoutOutlined,
  PlusOutlined,
  SettingOutlined,
  UnorderedListOutlined,
} from '@ant-design/icons';
import {
  Alert,
  Breadcrumb,
  Button,
  Empty,
  Segmented,
  Skeleton,
  Table,
  Tag,
  Tree,
  Typography,
  message,
} from 'antd';
import type { DataNode } from 'antd/es/tree';
import { useEffect, useMemo, useState } from 'react';
import type {
  BoardResponse,
  Container,
  FieldDefinition,
  TaskProjection,
  WorkspaceOverview,
} from '@flowboard/contracts';
import {
  Actor,
  createTask,
  getAllBoardPages,
  getMembers,
  getTask,
  getTree,
  getWorkspaceOverview,
  placeTask,
  updateTask,
} from '../identity/session-client';
import { TaskEditor } from './tasks/task-editor';
import { AdminPanel } from './admin/admin-panel';
import { TaskMove } from './tasks/task-move';
import { WorkspaceHome } from './home/workspace-home';

type EditorState = { task: TaskProjection | null; presentation: 'modal' | 'drawer' };

function treeNodes(containers: Container[], parentId: string | null = null): DataNode[] {
  return containers
    .filter((node) => node.parentContainerId === parentId)
    .map((node) => ({
      key: node.id,
      title: node.name,
      icon: node.type === 'list' ? <UnorderedListOutlined /> : <AppstoreOutlined />,
      children: treeNodes(containers, node.id),
      selectable: node.type === 'list',
    }));
}

function displayField(task: TaskProjection, field: FieldDefinition) {
  const value = task.customFields[field.key];
  if (value === undefined || value === null || value === '') return '—';
  if (field.type === 'checkbox') return value === true ? 'Yes' : 'No';
  if (field.type === 'single_select')
    return field.options.find((option) => option.id === value)?.label ?? '—';
  if (field.type === 'multi_select' && Array.isArray(value))
    return (
      value
        .map((id) => field.options.find((option) => option.id === id)?.label ?? '')
        .filter(Boolean)
        .join(', ') || '—'
    );
  return String(value);
}

function dateLabel(value: string | null) {
  return value ? new Date(value).toLocaleDateString() : '—';
}

export function Dashboard({
  actor,
  accessToken,
  onSignOut,
}: {
  actor: Actor;
  accessToken: string;
  onSignOut: () => Promise<void>;
}) {
  const [containers, setContainers] = useState<Container[]>();
  const [selectedListId, setSelectedListId] = useState<string>();
  const [home, setHome] = useState<WorkspaceOverview>();
  const [homeRevision, setHomeRevision] = useState(0);
  const [pendingHomeTask, setPendingHomeTask] = useState<{ id: string; listId: string }>();
  const [board, setBoard] = useState<BoardResponse>();
  const [members, setMembers] = useState<Array<{ id: string; name: string }>>([]);
  const [view, setView] = useState<'Board' | 'Table'>('Board');
  const [editor, setEditor] = useState<EditorState>();
  const [movingTask, setMovingTask] = useState<TaskProjection>();
  const [adminOpen, setAdminOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>();
  const [workspaceError, setWorkspaceError] = useState<string>();
  const [messageApi, messageContext] = message.useMessage();

  useEffect(() => {
    let active = true;
    void Promise.all([getTree(accessToken), getMembers(accessToken)])
      .then(([tree, users]) => {
        if (!active) return;
        setContainers(tree.items);
        setMembers(users.items);
      })
      .catch((cause) => {
        if (active)
          setWorkspaceError(cause instanceof Error ? cause.message : 'Unable to load workspace.');
      });
    return () => {
      active = false;
    };
  }, [accessToken, actor.userId]);

  useEffect(() => {
    if (selectedListId) return;
    let active = true;
    setHome(undefined);
    setBoard(undefined);
    setError(undefined);
    setEditor(undefined);
    setLoading(true);
    void getWorkspaceOverview(accessToken, actor.workspaceId)
      .then((result) => {
        if (active) setHome(result);
      })
      .catch((cause) => {
        if (active) setError(cause instanceof Error ? cause.message : 'Unable to load overview.');
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [accessToken, actor.workspaceId, selectedListId, homeRevision]);

  useEffect(() => {
    if (!selectedListId) return;
    let active = true;
    setHome(undefined);
    setBoard(undefined);
    setError(undefined);
    setLoading(true);
    setEditor(undefined);
    void getAllBoardPages(accessToken, selectedListId)
      .then((result) => {
        if (active) setBoard(result);
      })
      .catch((cause) => {
        if (active) setError(cause instanceof Error ? cause.message : 'Unable to load list.');
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [accessToken, selectedListId]);

  useEffect(() => {
    if (!pendingHomeTask || !board || board.list.id !== pendingHomeTask.listId) return;
    let active = true;
    void getTask(accessToken, pendingHomeTask.id)
      .then((task) => {
        if (active) setEditor({ task, presentation: 'modal' });
      })
      .catch((cause) => {
        if (active)
          void messageApi.error(cause instanceof Error ? cause.message : 'Unable to open task.');
      })
      .finally(() => {
        if (active) setPendingHomeTask(undefined);
      });
    return () => {
      active = false;
    };
  }, [accessToken, board, messageApi, pendingHomeTask]);

  function openHome() {
    setAdminOpen(false);
    setPendingHomeTask(undefined);
    setSelectedListId(undefined);
    setHomeRevision((value) => value + 1);
  }

  function openListFromHome(listId: string) {
    setAdminOpen(false);
    setPendingHomeTask(undefined);
    setView('Board');
    setSelectedListId(listId);
  }

  function openTaskFromHome(id: string, listId: string) {
    setAdminOpen(false);
    setPendingHomeTask({ id, listId });
    setView('Board');
    setSelectedListId(listId);
  }

  async function reloadBoard() {
    if (!selectedListId) return;
    setBoard(await getAllBoardPages(accessToken, selectedListId));
  }

  async function reloadTree() {
    const tree = await getTree(accessToken);
    setContainers(tree.items);
    setHomeRevision((value) => value + 1);
  }

  async function openTask(id: string) {
    try {
      const task = await getTask(accessToken, id);
      setEditor({ task, presentation: view === 'Board' ? 'modal' : 'drawer' });
    } catch (cause) {
      void messageApi.error(cause instanceof Error ? cause.message : 'Unable to open task.');
    }
  }

  async function saveTask(body: Record<string, unknown>) {
    if (!selectedListId || !editor) return;
    if (editor.task) await updateTask(accessToken, editor.task.id, body);
    else await createTask(accessToken, selectedListId, body);
    await reloadBoard();
    void messageApi.success(editor.task ? 'Task saved.' : 'Task created.');
  }

  async function dropOn(statusKey: string, taskId: string, beforeTaskId?: string) {
    const task = board?.items.find((item) => item.id === taskId);
    if (!task || task.id === beforeTaskId) return;
    try {
      await placeTask(accessToken, task.id, {
        expectedVersion: task.version,
        statusKey,
        ...(beforeTaskId ? { beforeTaskId } : {}),
      });
      await reloadBoard();
    } catch (cause) {
      await reloadBoard().catch(() => undefined);
      void messageApi.error(cause instanceof Error ? cause.message : 'Unable to move task.');
    }
  }

  const nodes = useMemo(() => treeNodes(containers ?? []), [containers]);
  const selected = containers?.find((node) => node.id === selectedListId);
  const columns = board
    ? [
        {
          title: 'Task',
          dataIndex: 'title',
          key: 'title',
          render: (value: string) => <strong>{value}</strong>,
        },
        {
          title: 'Status',
          dataIndex: 'statusKey',
          key: 'status',
          render: (value: string) =>
            board.statuses.find((status) => status.key === value)?.name ?? value,
        },
        {
          title: 'Assignees',
          key: 'assignees',
          render: (_: unknown, task: TaskProjection) =>
            task.assignees.map((item) => item.name).join(', ') || '—',
        },
        {
          title: 'Priority',
          dataIndex: 'priority',
          key: 'priority',
          sorter: (a: TaskProjection, b: TaskProjection) =>
            ['urgent', 'high', 'normal', 'low', 'none'].indexOf(a.priority) -
            ['urgent', 'high', 'normal', 'low', 'none'].indexOf(b.priority),
          render: (value: string) => <Tag>{value}</Tag>,
        },
        {
          title: 'Due date',
          dataIndex: 'dueDate',
          key: 'due',
          sorter: (a: TaskProjection, b: TaskProjection) =>
            a.dueDate === null
              ? b.dueDate === null
                ? 0
                : 1
              : b.dueDate === null
                ? -1
                : a.dueDate.localeCompare(b.dueDate),
          render: dateLabel,
        },
        ...board.fields.map((field) => ({
          title: field.name,
          key: field.key,
          render: (_: unknown, task: TaskProjection) => displayField(task, field),
        })),
      ]
    : [];

  return (
    <div className="workspace-app">
      {messageContext}
      <header className="workspace-header">
        <div className="workspace-brand">
          <AppstoreOutlined /> Flowboard
        </div>
        <div className="workspace-account">
          <Tag color={actor.role === 'admin' ? 'blue' : 'default'}>{actor.role}</Tag>
          <Button icon={<LogoutOutlined />} onClick={() => void onSignOut()}>
            Sign out
          </Button>
        </div>
      </header>
      <div className="workspace-body">
        <aside className="workspace-sidebar">
          <div className="workspace-sidebar-label">WORKSPACE</div>
          <div className="workspace-sidebar-title">Flowboard</div>
          <button
            type="button"
            className={`workspace-home-link${selectedListId ? '' : ' active'}`}
            onClick={openHome}
          >
            <HomeOutlined /> Home
          </button>
          {actor.role === 'admin' && (
            <button
              type="button"
              className={`workspace-home-link${adminOpen ? ' active' : ''}`}
              onClick={() => {
                setAdminOpen(true);
                setSelectedListId(undefined);
                setEditor(undefined);
              }}
            >
              <SettingOutlined /> Admin
            </button>
          )}
          {!containers && !workspaceError && <Skeleton active paragraph={{ rows: 5 }} />}
          {containers && (
            <Tree
              showIcon
              blockNode
              defaultExpandAll
              selectedKeys={selectedListId ? [selectedListId] : []}
              treeData={nodes}
              onSelect={(keys) => {
                if (keys[0]) {
                  setAdminOpen(false);
                  setPendingHomeTask(undefined);
                  setSelectedListId(String(keys[0]));
                }
              }}
            />
          )}
          {containers?.length === 0 && <Empty description="No accessible lists" />}
        </aside>
        <main className="workspace-main">
          {workspaceError && (
            <Alert type="error" showIcon message={workspaceError} style={{ marginBottom: 16 }} />
          )}
          {error && <Alert type="error" showIcon message={error} style={{ marginBottom: 16 }} />}
          {adminOpen && actor.role === 'admin' && containers && (
            <AdminPanel
              accessToken={accessToken}
              workspaceId={actor.workspaceId}
              containers={containers}
              members={members}
              onHierarchyChange={reloadTree}
              onConfigChange={() => setHomeRevision((value) => value + 1)}
            />
          )}
          {!adminOpen && !selectedListId && home && (
            <WorkspaceHome
              overview={home}
              onOpenList={openListFromHome}
              onOpenTask={openTaskFromHome}
            />
          )}
          {!adminOpen && selectedListId && board && (
            <>
              <Breadcrumb items={board.list.path.map((item) => ({ title: item.name }))} />
              <div className="list-heading">
                <div>
                  <Typography.Title level={2} style={{ margin: '8px 0 0' }}>
                    {board.list.name}
                  </Typography.Title>
                  <span className="list-context">
                    {board.items.length} tasks · Statuses from{' '}
                    {board.statusSource.type === 'workspace'
                      ? 'workspace'
                      : (containers?.find((node) => node.id === board.statusSource.id)?.name ??
                        'ancestor')}
                  </span>
                </div>
                <Button
                  type="primary"
                  icon={<PlusOutlined />}
                  onClick={() =>
                    setEditor({ task: null, presentation: view === 'Board' ? 'modal' : 'drawer' })
                  }
                >
                  New task
                </Button>
              </div>
              <div className="view-toolbar">
                <Segmented
                  options={['Board', 'Table']}
                  value={view}
                  onChange={(value) => {
                    setView(value as 'Board' | 'Table');
                    setEditor(undefined);
                  }}
                />
              </div>
              {view === 'Board' ? (
                <div className="kanban-board">
                  {board.statuses.map((status) => (
                    <section
                      className="kanban-column"
                      key={status.key}
                      onDragOver={(event) => event.preventDefault()}
                      onDrop={(event) => {
                        event.preventDefault();
                        void dropOn(status.key, event.dataTransfer.getData('text/plain'));
                      }}
                    >
                      <div className="kanban-column-heading">
                        <span className="status-dot" style={{ background: status.color }} />
                        <strong>{status.name}</strong>
                        <span>
                          {board.items.filter((task) => task.statusKey === status.key).length}
                        </span>
                      </div>
                      <div className="kanban-cards">
                        {board.items
                          .filter((task) => task.statusKey === status.key)
                          .map((task) => (
                            <button
                              className="task-card"
                              key={task.id}
                              type="button"
                              draggable
                              onDragStart={(event) => {
                                event.dataTransfer.effectAllowed = 'move';
                                event.dataTransfer.setData('text/plain', task.id);
                              }}
                              onDragOver={(event) => event.preventDefault()}
                              onDrop={(event) => {
                                event.preventDefault();
                                event.stopPropagation();
                                void dropOn(
                                  status.key,
                                  event.dataTransfer.getData('text/plain'),
                                  task.id,
                                );
                              }}
                              onClick={() => void openTask(task.id)}
                            >
                              <strong>{task.title}</strong>
                              <div className="task-card-meta">
                                <Tag>{task.priority}</Tag>
                                <span>{dateLabel(task.dueDate)}</span>
                              </div>
                              <div className="task-card-assignees">
                                {task.assignees.map((item) => item.name).join(', ') || 'Unassigned'}
                              </div>
                            </button>
                          ))}
                      </div>
                    </section>
                  ))}
                </div>
              ) : (
                <Table<TaskProjection>
                  rowKey="id"
                  columns={columns}
                  dataSource={board.items}
                  pagination={false}
                  scroll={{ x: true }}
                  onRow={(task) => ({
                    onClick: () => void openTask(task.id),
                    className: 'task-table-row',
                  })}
                />
              )}
            </>
          )}
          {!adminOpen && !home && !board && loading && <Skeleton active paragraph={{ rows: 8 }} />}
          {selectedListId && !board && !loading && !error && selected && (
            <Empty description="Select a list to begin." />
          )}
        </main>
      </div>
      {editor && board && (
        <TaskEditor
          key={`${editor.task?.id ?? 'new'}-${editor.presentation}`}
          board={board}
          task={editor.task}
          presentation={editor.presentation}
          members={members}
          onClose={() => setEditor(undefined)}
          onSave={saveTask}
          onMove={
            editor.task
              ? () => {
                  setMovingTask(editor.task!);
                  setEditor(undefined);
                }
              : undefined
          }
        />
      )}
      {movingTask && board && (
        <TaskMove
          accessToken={accessToken}
          task={movingTask}
          lists={containers ?? []}
          sourceFields={board.fields}
          onClose={() => setMovingTask(undefined)}
          onMoved={async () => {
            try {
              await reloadBoard();
              void messageApi.success('Task moved.');
            } catch {
              void messageApi.warning(
                'Task moved, but the list could not refresh. Reopen it to reload.',
              );
            }
          }}
        />
      )}
    </div>
  );
}
