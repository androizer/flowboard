import { Button, Empty } from 'antd';
import type { WorkspaceOverview } from '@flowboard/contracts';

function dueLabel(value: string) {
  return new Date(value).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

export function WorkspaceHome({
  overview,
  onOpenList,
  onOpenTask,
}: {
  overview: WorkspaceOverview;
  onOpenList: (listId: string) => void;
  onOpenTask: (taskId: string, listId: string) => void;
}) {
  const primary = overview.lists.find((list) => list.name === 'Backlog') ?? overview.lists[0];
  const names = new Map(overview.lists.map((list) => [list.id, list.name]));
  return (
    <div className="home-page">
      <div className="home-eyebrow">Workspace overview</div>
      <div className="home-heading">
        <div>
          <h1>Flowboard home</h1>
          <p>A snapshot of work you can access, across lists.</p>
        </div>
        {primary && (
          <Button type="primary" onClick={() => onOpenList(primary.id)}>
            Open {primary.name} →
          </Button>
        )}
      </div>
      <div className="home-stats">
        <div className="home-stat">
          <span>Visible tasks</span>
          <strong>{overview.totals.visibleTasks}</strong>
        </div>
        <div className="home-stat">
          <span>Accessible lists</span>
          <strong>{overview.totals.accessibleLists}</strong>
        </div>
        <div className="home-stat">
          <span>
            Due soon <small>(next 7 days)</small>
          </span>
          <strong>{overview.totals.dueSoon}</strong>
        </div>
      </div>
      <div className="home-sections">
        <section className="home-section">
          <h2>Where work lives</h2>
          {overview.lists.length ? (
            <div className="home-rows">
              {overview.lists.map((list) => (
                <button
                  className="home-row"
                  type="button"
                  key={list.id}
                  onClick={() => onOpenList(list.id)}
                >
                  <span>
                    <strong>{list.name}</strong>
                    <small>
                      {list.path
                        .slice(0, -1)
                        .map((part) => part.name)
                        .join(' / ')}
                    </small>
                  </span>
                  <span className="home-count">
                    {list.taskCount} {list.taskCount === 1 ? 'task' : 'tasks'}
                  </span>
                </button>
              ))}
            </div>
          ) : (
            <Empty description="No accessible lists yet" />
          )}
        </section>
        <section className="home-section">
          <h2>Upcoming due dates</h2>
          {overview.upcoming.length ? (
            <div className="home-rows">
              {overview.upcoming.map((task) => (
                <button
                  className="home-row"
                  type="button"
                  key={task.id}
                  onClick={() => onOpenTask(task.id, task.primaryListId)}
                >
                  <span>
                    <strong>{task.title}</strong>
                    <small>
                      {names.get(task.primaryListId)} · {dueLabel(task.dueDate)}
                    </small>
                  </span>
                  <span className="home-open">Open →</span>
                </button>
              ))}
            </div>
          ) : (
            <Empty description="No upcoming due dates" />
          )}
        </section>
      </div>
    </div>
  );
}
