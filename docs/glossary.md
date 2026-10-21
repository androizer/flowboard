# Flowboard glossary

Navigation: [hub](README.md), [business example](business-walkthrough.md).

| Term                   | Plain meaning                                                                             |
| ---------------------- | ----------------------------------------------------------------------------------------- |
| Workspace              | The team's root; this MVP has one.                                                        |
| Space                  | A broad area such as Engineering.                                                         |
| Folder                 | A group of lists, such as Q2 Launch.                                                      |
| List                   | The direct home of tasks, such as Backlog.                                                |
| Container              | A shared database representation for a space, folder, or list.                            |
| Primary list           | The task's one and only list in this MVP.                                                 |
| Board                  | A view of a list's tasks grouped by resolved status; not a separate ownership table.      |
| Ancestor               | A parent or a parent's parent on the path to the workspace.                               |
| Resolved configuration | The settings that actually apply after walking that path.                                 |
| Local status override  | A complete set at one container that replaces the inherited set.                          |
| Field definition       | The question, such as required numeric Effort.                                            |
| Field value            | One task's answer, such as Effort = 3.                                                    |
| Grant                  | An allow/deny access rule attached to a container and member.                             |
| Authentication         | Proving which internal person signed in.                                                  |
| Authorization          | Deciding what that person may access or change.                                           |
| Identity link          | An issuer/subject mapping connecting a login method to an internal user.                  |
| Credentials            | The local login identifier and password hash owned by a user.                             |
| Session                | One Flowboard login, with an expiry and revocation state.                                 |
| Access token           | A short-lived Flowboard JWT presented to APIs.                                            |
| Refresh token          | A longer-lived opaque secret used to obtain another access token within the same session. |
| Rotation               | Consuming one refresh token and creating its single successor.                            |
| Token family           | All refresh-token records belonging to one session.                                       |
| Actor                  | Trusted user ID, workspace ID, and current role given to business workflows.              |
| Transaction            | A group of writes that all commit or all roll back.                                       |
| Row lock               | A database mechanism making conflicting changes wait their turn.                          |
| Version                | A number detecting an edit based on old task data.                                        |
| Repository             | A module's controlled way to read/write its own tables.                                   |
| Workflow               | A use case that coordinates several module services.                                      |
| Modular monolith       | One deployed backend with enforced internal boundaries.                                   |
| ADR                    | A short record of an architecture decision, its reasons, and consequences.                |
| SSO / IdP              | External sign-in and its identity provider; actual integration is future scope.           |
| Idempotent             | Repeating an operation does not create extra unintended effects, such as duplicate seeds. |
| Outbox                 | A future durable event record written with a task change before a worker publishes it.    |
