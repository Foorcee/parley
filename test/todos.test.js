// test/todos.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { openDb } from '../src/store/db.js';

function freshDb() { return openDb(':memory:'); }

test('seedTodos inserts action items and dedups on re-seed', () => {
  const db = freshDb();
  const mId = db.createMeeting({ guildId: 'g1', channelId: 'c1', channelName: 'general', startedAt: 'now' });
  const items = [{ assignee: 'Alice', task: 'ship it' }, { assignee: null, task: 'pick a name' }];
  assert.equal(db.seedTodos(mId, 'g1', items), 2);
  assert.equal(db.seedTodos(mId, 'g1', items), 0); // UNIQUE dedup
  const todos = db.listTodos('g1');
  assert.equal(todos.length, 2);
  assert.equal(todos.every((t) => t.done === 0), true);
  assert.equal(todos.every((t) => t.done_at === null), true);
});

test('listTodos open filter and setTodoDone toggle', () => {
  const db = freshDb();
  const mId = db.createMeeting({ guildId: 'g1', channelId: 'c1', channelName: 'g', startedAt: 'now' });
  db.seedTodos(mId, 'g1', [{ assignee: 'Bob', task: 'A' }, { assignee: 'Bob', task: 'B' }]);
  const [first] = db.listTodos('g1');
  db.setTodoDone(first.id, 1);
  assert.equal(db.listTodos('g1', { open: true }).length, 1);
  assert.equal(db.listTodos('g1').length, 2);
});

test('setTodoDone stamps the completion transition, preserves it on repeat, and clears it on reopen', () => {
  const db = freshDb();
  const mId = db.createMeeting({ guildId: 'g1', channelId: 'c1', channelName: 'g', startedAt: 'now' });
  db.seedTodos(mId, 'g1', [{ assignee: 'Alice', task: 'Ship it' }]);
  const [{ id }] = db.listTodos('g1');

  const before = new Date().toISOString();
  db.setTodoDone(id, true);
  const [resolved] = db.listTodos('g1');
  assert.equal(resolved.done, 1);
  assert.match(resolved.done_at, /Z$/);
  assert.ok(resolved.done_at >= before && resolved.done_at <= new Date().toISOString());

  // Model a repeat from a later session without depending on clock timing.
  const earlier = '2025-01-02T03:04:05.000Z';
  db.sql.prepare(`UPDATE todos SET done_at = ? WHERE id = ?`).run(earlier, id);
  db.setTodoDone(id, true);
  assert.equal(db.listTodos('g1')[0].done_at, earlier);

  db.setTodoDone(id, false);
  const [reopened] = db.listTodos('g1', { open: true });
  assert.equal(reopened.done, 0);
  assert.equal(reopened.done_at, null);

  db.setTodoDone(id, true);
  assert.ok(db.listTodos('g1')[0].done_at >= before);
});

test('replaceSummary preserves completion times and legacy NULLs for surviving todos', () => {
  const db = freshDb();
  const mId = db.createMeeting({ guildId: 'g1', channelId: 'c1', channelName: 'g', startedAt: 'now' });
  const carried = [{ assignee: 'Alice', task: 'Ship it' }, { assignee: null, task: 'Name it' }];
  db.seedTodos(mId, 'g1', carried);
  const completedAt = '2025-01-02T03:04:05.000Z';
  const mark = db.sql.prepare(`UPDATE todos SET done = 1, done_at = ? WHERE task = ?`);
  mark.run(completedAt, 'Ship it');
  mark.run(null, 'Name it');

  const actionItems = [...carried, { assignee: 'Bob', task: 'Test it' }];
  assert.equal(db.replaceSummary(mId, 'g1', { actionItems }, [], 'test:model'), 3);
  const statuses = Object.fromEntries(db.listTodos('g1').map((t) => [t.task, [t.done, t.done_at]]));
  assert.deepEqual(statuses, { 'Ship it': [1, completedAt], 'Name it': [1, null], 'Test it': [0, null] });
});

test('openDb adds done_at to legacy todos and leaves existing completion times unknown', () => {
  const dir = mkdtempSync(join(tmpdir(), 'parley-todos-migration-'));
  const path = join(dir, 'meetings.db');
  let db;
  try {
    const raw = new DatabaseSync(path);
    try {
      raw.exec(`
        CREATE TABLE todos (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          guild_id TEXT NOT NULL,
          meeting_id INTEGER,
          assignee TEXT,
          task TEXT NOT NULL,
          done INTEGER NOT NULL DEFAULT 0,
          created_at TEXT NOT NULL
        );
        INSERT INTO todos (guild_id, meeting_id, task, done, created_at)
        VALUES ('g1', 1, 'Legacy task', 1, '2025-01-02T03:04:05.000Z');
      `);
    } finally {
      raw.close();
    }

    db = openDb(path);
    const column = db.sql.prepare(`PRAGMA table_info(todos)`).all().find((c) => c.name === 'done_at');
    assert.equal(column?.type, 'TEXT');
    assert.equal(column?.notnull, 0);
    const [legacy] = db.listTodos('g1');
    assert.equal(legacy.task, 'Legacy task');
    assert.equal(legacy.done, 1);
    assert.equal(legacy.done_at, null);
    db.setTodoDone(legacy.id, true);
    assert.equal(db.listTodos('g1')[0].done_at, null);
  } finally {
    db?.sql.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

test('listGuilds returns distinct guilds from meetings and config', () => {
  const db = freshDb();
  db.createMeeting({ guildId: 'gA', channelId: 'c', channelName: 'g', startedAt: 'now' });
  db.createMeeting({ guildId: 'gA', channelId: 'c', channelName: 'g', startedAt: 'now' });
  db.sql.prepare(`INSERT INTO guild_config (guild_id) VALUES ('gB')`).run();
  const ids = db.listGuilds().map((r) => r.guild_id).sort();
  assert.deepEqual(ids, ['gA', 'gB']);
});

test('backfillTodos is idempotent', () => {
  const db = freshDb();
  const mId = db.createMeeting({ guildId: 'g1', channelId: 'c', channelName: 'g', startedAt: 'now' });
  db.saveSummary(mId, { actionItems: [{ assignee: 'Al', task: 'x' }] }, [], 'test:model');
  assert.equal(db.backfillTodos(), 1);
  assert.equal(db.backfillTodos(), 0);
  assert.equal(db.listTodos('g1').length, 1);
});
