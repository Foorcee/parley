// test/todos-edit.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { openDb } from '../src/store/db.js';
import { apiRouter } from '../src/web/api.js';

function seeded() {
  const db = openDb(':memory:');
  const mId = db.createMeeting({ guildId: 'g1', channelId: 'c1', channelName: 'g', startedAt: '2026-01-01T00:00:00.000Z' });
  const notes = {
    tldr: '', topics: [], decisions: [], openQuestions: [],
    actionItems: [{ assignee: 'Alice', task: 'Ship it' }, { assignee: null, task: 'Pick a name' }],
  };
  db.saveSummary(mId, notes, [], 'fake');
  db.seedTodos(mId, 'g1', notes.actionItems);
  const byTask = (t) => db.listTodos('g1').find((x) => x.task === t);
  return { db, mId, byTask };
}

test('updateTodoTask edits the todo and the summary, and survives backfill', () => {
  const { db, mId, byTask } = seeded();
  const { id } = byTask('Ship it');
  db.setTodoDone(id, true);
  const updated = db.updateTodoTask(id, 'Ship it on Friday');
  assert.equal(updated.task, 'Ship it on Friday');
  assert.equal(updated.done, 1); // done state untouched
  assert.deepEqual(db.getSummary(mId).notes.actionItems[0], { assignee: 'Alice', task: 'Ship it on Friday' });
  assert.equal(db.backfillTodos(), 0); // original text is not re-seeded
  assert.deepEqual(db.listTodos('g1').map((t) => t.task).sort(), ['Pick a name', 'Ship it on Friday']);
});

test('updateTodoTask returns null for a missing id and throws on a duplicate', () => {
  const { db, byTask } = seeded();
  assert.equal(db.updateTodoTask(9999, 'x'), null);
  db.seedTodos(byTask('Ship it').meeting_id, 'g1', [{ assignee: 'Alice', task: 'Other' }]);
  assert.throws(() => db.updateTodoTask(byTask('Other').id, 'Ship it'), /UNIQUE/);
  assert.ok(byTask('Other')); // rolled back
});

test('deleteTodo removes the todo and its summary entry, and survives backfill', () => {
  const { db, mId, byTask } = seeded();
  assert.equal(db.deleteTodo(byTask('Pick a name').id), true);
  assert.equal(db.deleteTodo(9999), false);
  assert.deepEqual(db.getSummary(mId).notes.actionItems, [{ assignee: 'Alice', task: 'Ship it' }]);
  assert.equal(db.backfillTodos(), 0);
  assert.deepEqual(db.listTodos('g1').map((t) => t.task), ['Ship it']);
});

async function listen(db, user) {
  const app = express();
  app.use(express.json());
  if (user) app.use('/api', (req, _res, next) => { req.authResolved = true; req.user = user; next(); });
  app.use('/api', apiRouter({ db, client: null }));
  const server = app.listen(0, '127.0.0.1');
  await new Promise((r) => server.once('listening', r));
  return { base: `http://127.0.0.1:${server.address().port}`, close: () => server.close() };
}
const send = (base, path, method, body) => fetch(`${base}/api${path}`, {
  method, headers: { 'content-type': 'application/json' }, body: body && JSON.stringify(body),
});

test('PATCH /todos/:id edits text; validates; 404/409', async () => {
  const { db, byTask } = seeded();
  const { base, close } = await listen(db);
  try {
    const { id } = byTask('Ship it');
    let r = await send(base, `/todos/${id}`, 'PATCH', { task: '  Ship v2  ' });
    assert.equal(r.status, 200);
    assert.equal((await r.json()).task, 'Ship v2');
    assert.equal((await send(base, `/todos/${id}`, 'PATCH', { task: '   ' })).status, 400);
    assert.equal((await send(base, `/todos/9999`, 'PATCH', { task: 'x' })).status, 404);
    db.seedTodos(byTask('Ship v2').meeting_id, 'g1', [{ assignee: 'Alice', task: 'Dup' }]);
    assert.equal((await send(base, `/todos/${byTask('Dup').id}`, 'PATCH', { task: 'Ship v2' })).status, 409);
    r = await send(base, `/todos/${id}`, 'PATCH', { done: true });
    assert.equal((await r.json()).done, 1);
  } finally { close(); }
});

test('DELETE /todos/:id removes it; 404 when missing; admin only', async () => {
  const { db, byTask } = seeded();
  const viewer = await listen(db, { id: 2, username: 'v', isAdmin: false });
  try {
    assert.equal((await send(viewer.base, `/todos/${byTask('Ship it').id}`, 'DELETE')).status, 403);
    assert.equal((await send(viewer.base, `/todos/${byTask('Ship it').id}`, 'PATCH', { task: 'x' })).status, 403);
  } finally { viewer.close(); }
  const { base, close } = await listen(db);
  try {
    const { id } = byTask('Ship it');
    assert.equal((await send(base, `/todos/${id}`, 'DELETE')).status, 200);
    assert.equal((await send(base, `/todos/${id}`, 'DELETE')).status, 404);
    assert.equal(db.listTodos('g1').length, 1);
  } finally { close(); }
});
