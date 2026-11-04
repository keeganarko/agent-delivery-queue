import assert from "node:assert/strict";
import test from "node:test";
import { DeliveryQueue, STATES } from "../src/index.js";

test("publishes the eight designed states, queued through replied", () => {
  assert.deepEqual(STATES, [
    "queued", "previewed", "held", "released",
    "delivered", "seen", "replied", "cancelled",
  ]);
});

test("delivers in arrival order through preview, and never while typing", () => {
  const q = new DeliveryQueue();
  const a = q.enqueue("first");
  const b = q.enqueue("second");
  assert.equal(q.get(a).state, "queued");

  const delivered = [];
  assert.equal(q.deliverNext((p) => delivered.push(p)), null); // not previewed yet
  assert.deepEqual(q.preview().map((m) => m.id), [a, b]);

  q.setTyping(true);
  assert.equal(q.get(a).state, "held");
  assert.equal(q.deliverNext((p) => delivered.push(p)), null); // typing wins
  assert.deepEqual(delivered, []);

  q.setTyping(false);
  assert.equal(q.get(a).state, "released");
  q.preview();
  assert.equal(q.deliverNext((p) => delivered.push(p)).id, a);
  assert.equal(q.deliverNext((p) => delivered.push(p)).id, b);
  assert.deepEqual(delivered, ["first", "second"]);
});

test("messages arriving while typing start held, never queued for surprise delivery", () => {
  const q = new DeliveryQueue();
  q.setTyping(true);
  const id = q.enqueue("while you were typing");
  assert.equal(q.get(id).state, "held");
  assert.deepEqual(q.preview().map((m) => m.state), ["held"]); // visible, not hidden
});

test("a throwing handler leaves the message previewed, not delivered", () => {
  const q = new DeliveryQueue();
  const id = q.enqueue("boom");
  q.preview();
  assert.throws(() => q.deliverNext(() => { throw new Error("nope"); }), /nope/);
  assert.equal(q.get(id).state, "previewed");
});

test("seen then replied is the happy end; cancel works from anywhere live", () => {
  const q = new DeliveryQueue();
  const a = q.enqueue("a");
  const b = q.enqueue("b");
  q.preview();
  q.deliverNext(() => {});
  assert.equal(q.markSeen(a).state, "seen");
  assert.equal(q.markReplied(a).state, "replied");
  assert.equal(q.cancel(b).state, "cancelled");
  assert.equal(q.size, 0);
  assert.throws(() => q.cancel(a), /cannot cancel/);
  assert.throws(() => q.markSeen("msg-999"), /unknown message/);
});

test("capacity defaults to 16 live messages and refuses more", () => {
  const q = new DeliveryQueue();
  for (let i = 0; i < 16; i += 1) q.enqueue(i);
  assert.throws(() => q.enqueue(16), /capacity 16/);
  q.cancel(q.list()[0].id);
  assert.doesNotThrow(() => q.enqueue("room again"));
});

test("onChange observes every transition and can unsubscribe", () => {
  const q = new DeliveryQueue();
  const seen = [];
  const off = q.onChange((m) => seen.push(`${m.id}:${m.state}`));
  const id = q.enqueue("x");
  q.setTyping(true);
  q.setTyping(false);
  off();
  q.preview();
  assert.deepEqual(seen, [`${id}:queued`, `${id}:held`, `${id}:released`]);
});
