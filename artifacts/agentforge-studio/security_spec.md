# Security Specification for AgentForge

## Data Invariants
1. A project must have a unique ID and a valid owner ID matching the creator's UID.
2. A task must belong to an existing project and have a valid owner ID matching the project owner's UID.
3. Progress must be a number between 0 and 100.
4. Users can only read, create, update, or delete their own projects and tasks.

## The "Dirty Dozen" Payloads

1. **Identity Spoofing (Project)**: Create a project with an `ownerId` that doesn't match `request.auth.uid`.
2. **Identity Spoofing (Task)**: Create a task with an `ownerId` that doesn't match `request.auth.uid`.
3. **Cross-User Access (Read)**: Attempt to read a project document belonging to another user.
4. **Cross-User Access (List)**: Attempt to list projects without filtering by `ownerId == request.auth.uid`.
5. **Orphaned Task**: Create a task with a `projectId` that does not point to an existing project.
6. **Project Hijacking**: Update a project's `ownerId` to a different value.
7. **Task Progress Poisoning**: Update task progress to a non-number or out-of-range value (e.g., -1 or 101).
8. **Malicious ID**: Create a project with an ID longer than 128 characters or containing illegal characters.
9. **Shadow Field Injection**: Add an unauthorized field (e.g., `isAdmin: true`) to a project document.
10. **Immutable Field Change**: Attempt to change `id` or `projectId` after creation.
11. **Unverified Email Access**: Attempt to write data while `email_verified` is false.
12. **Blanket Read Attack**: Attempt to query all projects without specifying the owner.

## The Test Runner (Plan)
- Verify `create` on `/projects/{id}` fails if `ownerId != auth.uid`.
- Verify `read` on `/projects/{id}` fails if `resource.data.ownerId != auth.uid`.
- Verify `update` on `/projects/{id}` fails if `incoming().ownerId != existing().ownerId`.
- Verify `create` on `/projects/{id}/tasks/{taskId}` fails if project doesn't exist.
- Verify `create` on `/projects/{id}/tasks/{taskId}` fails if `ownerId != auth.uid`.
