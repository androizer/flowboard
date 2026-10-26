# Stretch goals

Navigation: [project README](../README.md), [documentation hub](README.md), [architecture](architecture.md), [ADR-0005](adr/0005-delivery-and-consistency.md).

After finishing the required features and checks, I’d like to take on a few stretch goals. I’ve already set up a short-lived Render/Neon deployment and an OpenAI Swagger client. The next features I’d consider are assignment notifications over SSE, an activity feed, and optimistic drag-and-drop with conflict handling. None of those three is implemented yet.

## 1. Assignment notifications over SSE

When I assign a task to someone, I’d send that person a notification through Server-Sent Events (SSE). The browser would still use the existing REST routes to make changes. Since updates only need to travel from the server to the browser, I don’t need a bidirectional WebSocket for this feature.

### How I’d build it

```mermaid
sequenceDiagram
    actor Assigner
    participant Browser
    participant API as Assignment workflow
    participant DB as PostgreSQL
    participant Dispatcher
    participant Stream as SSE connection
    participant Recipient
    Assigner->>Browser: Assign task to recipient
    Browser->>API: Assignment request
    API->>DB: Check access; update assignee; write outbox event
    DB-->>API: Commit assignment and event
    API-->>Browser: Assignment confirmed
    Dispatcher->>DB: Read committed event
    Dispatcher->>Stream: Publish recipient notification
    Stream-->>Recipient: SSE event
    Recipient->>API: Fetch task if current details are needed
    API-->>Recipient: Authorized task representation
```

1. I’d send the assignment through the existing workflow so it can authenticate the user and check task access and rules.
2. In the same database transaction as the assignment, I’d write an outbox event with an event ID, task ID, recipient ID, event type, and the display details the notification needs. I wouldn’t publish the event until the transaction commits.
3. A dispatcher would read committed outbox rows and deliver notifications. It may retry, so I’d use the event ID to ignore duplicates.
4. The browser would open an authenticated SSE stream. If I use the existing Bearer token, I’d stream with `fetch()` because native `EventSource` cannot set an Authorization header. Another option is a same-origin secure cookie for the stream. I wouldn’t put access tokens in the URL. The stream would include only notifications for the signed-in user; the browser can fetch the task through REST when it needs the latest authorized data.

SSE would deliver updates, but it wouldn’t be the source of truth. Connections can drop, and a sleeping hosted service can miss an event, so the browser should refresh notifications after reconnecting. If I want notification history, I’d store it in PostgreSQL and use SSE to tell the browser when to check for new rows. With multiple API replicas, I’d use a shared broker or database-backed delivery instead of keeping event state in one process. I’d apply current access rules and avoid sending private task details that might remain visible after access changes.

## 2. Activity feed through asynchronous processing

An activity feed such as “Alice moved Fix login to Done” would show committed changes. I don’t need a master/slave cluster or direct process-to-process calls to build it. The API and a worker can exchange work through PostgreSQL, whether they run as containers on one host or as separate services.

### How the data would move

```mermaid
sequenceDiagram
    participant Client as Browser
    participant API as API workflow
    participant DB as PostgreSQL
    participant Worker as Activity worker
    participant Feed as Activity table
    Client->>API: Move task with expectedVersion
    API->>DB: Validate and update task; insert outbox row
    DB-->>API: Commit both changes atomically
    API-->>Client: Confirmed task state and new version
    Worker->>DB: Claim committed outbox row
    Worker->>Feed: Insert activity record idempotently
    Worker->>DB: Mark outbox row processed
    Client->>API: GET activity feed
    API->>DB: Check access; read stable page
    DB-->>API: Authorized activity records
    API-->>Client: Feed page
```

1. **Write with the task change.** In the existing workflow transaction, I’d update the task and insert an immutable outbox record. It would include an event ID, event type, task ID, committed task version, actor ID, timestamp, and only the before/after details needed by the feed. The worker wouldn’t be called until after commit.
2. **Process batches in a worker.** The worker would claim a bounded number of rows, process them, and mark them complete. A lease or `FOR UPDATE SKIP LOCKED` claim lets multiple workers share the work without a permanent leader. I’d retry temporary failures with backoff and keep repeatedly failing rows available for inspection or replay.
3. **Make retries safe.** I’d give each activity record a unique source event ID. If a retry encounters the same ID, it would skip the duplicate. I’d preserve ordering for each task using its committed version or a sequence, without assuming one global order across unrelated tasks.
4. **Check access when reading.** The activity endpoint would apply current workspace and list visibility rules, and paginate with a stable cursor such as `(created_at, id)`. The feed may appear shortly after the task change because the worker processes it asynchronously.

The outbox table would be the IPC boundary: the API and worker exchange durable records through PostgreSQL. I’d consider Redis Streams or a managed queue only if measured volume or delivery lag justified it. The activity records can start in a table in the same database, owned by an activity module. Task writes would stay with the task/workflow modules; the worker would consume event contracts instead of querying another module’s repositories.

For this app’s current size, I expect the extra database writes and a small worker to be manageable. The ongoing costs are storage, indexes, retention, and running the worker. I’d start with a bounded feed page and one worker, then measure event volume and processing lag before adding a broker or partitioning. Before building it, I’d decide how long to keep activity and what to show after a task is archived or deleted.

### Failure behavior

- If the task transaction rolls back, its outbox row rolls back too, so the feed won’t show a change that never happened.
- If the worker is down, committed rows wait for it to restart; task writes can continue.
- If a worker crashes after inserting an activity record but before marking the outbox row complete, its retry finds the event ID and avoids a duplicate.
- If an event keeps failing, I’d keep it visible for debugging and replay instead of blocking unrelated task changes.
- If the feed falls behind, the board still shows the confirmed task change while the feed catches up.

## 3. Optimistic drag-and-drop and conflict handling

I’d move a card as soon as the user drops it, then reconcile that preview with the server response. The server remains authoritative, and the existing task version and placement/move API can detect stale writes.

### How I’d handle each response

```mermaid
sequenceDiagram
    actor User
    participant UI as Board UI
    participant API as Placement workflow
    participant DB as PostgreSQL
    User->>UI: Drop card in new position
    UI->>UI: Save prior columns; show optimistic placement
    UI->>API: Move task with expectedVersion
    API->>DB: Check access/config/version; write placement
    alt Version is current
        DB-->>API: Commit new placement and version
        API-->>UI: Confirmed placement and version
        UI->>UI: Replace preview with server result
    else Version is stale
        DB-->>API: Reject without writing
        API-->>UI: 409 conflict
        UI->>API: Reload affected board data
        API-->>UI: Current authorized board
        UI->>UI: Remove preview; explain conflict
    end
```

1. On drop, I’d save the current source and destination columns, move the card in the UI, and show a pending indicator. The request would include the task ID, destination/status/order, and latest version I have.
2. On success, I’d replace the preview with the server’s response, including its version and position. If the response doesn’t include enough ordering information, I’d reload the affected board.
3. On a stale-version conflict (409), I’d reload the source and destination, remove the stale preview, and tell the user the board changed. I’d let them retry against the refreshed version, rather than silently repeating a move after status or field rules may have changed.
4. On validation or permission errors (400/403/404), I’d restore the saved board state or use freshly loaded data, then show the server’s error. If the request times out or the connection drops, I’d reload the board first: the server may have saved the move even though the response never arrived.

The server would still check membership, access, destination configuration, and `expectedVersion` in the placement transaction. The response confirms the move; client-side ordering is only a preview and cannot skip workflow validation. If another user moves the task first, my stale request gets a conflict and reloads server state. For rapid moves of one task, I’d serialize the requests or track them by version so an older response can’t overwrite a newer position.

### Cases I’d verify

- Accepted move: card previews immediately, then settles at the canonical server position/version.
- Stale version: no write is applied; client refreshes and presents a clear conflict state.
- Destination status/field invalidated during drag: server rejects; client restores/refetches and explains the rejection.
- Permission revoked during drag: server rejects without leaking the destination; client refreshes accessible board data.
- Response lost after commit: reconciliation discovers the committed position without issuing a duplicate move.
- Rapid moves of one task: response ordering cannot revert the latest confirmed version.

## 4. Suggested order and scope

I’d choose from these after the required work is complete, based on the time available:

1. **Optimistic drag-and-drop:** make the board feel faster and handle version conflicts in the UI.
2. **Activity feed:** add the outbox and a small idempotent worker. I’d start with polling; the feed doesn’t need live updates to be useful.
3. **SSE notifications:** build this when I have a notification experience to deliver. I’d reuse committed outbox events and handle reconnects, authentication, and multiple API replicas.

Before I implement one, I’d update its module guide, API contract, and any affected architecture decisions; add schema changes to the owned module guide; and record test scenarios. I’d run the documentation checker and follow the [change guide](change-guide.md). I’d mark the feature implemented only after the code and verification are in place.
