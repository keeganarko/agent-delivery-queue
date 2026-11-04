// agent-delivery-queue
//
// A small delivery queue for messages from coding agents to a person.
// One rule runs it: while the person is typing, incoming messages wait.
// An agent message must never land on top of an unsent human draft.
//
// This is a reference implementation of the design used in Agent Hub
// (private). The published design is an eight-state queue, `queued`
// through `replied`, that holds messages in a preview queue while a
// person is typing. This package implements that contract in plain,
// dependency-free JavaScript so the behaviour can be read and tested
// end to end. It is not the production code and carries no storage,
// transport, or UI. Bring your own.

export const STATES = Object.freeze([
  "queued",
  "previewed",
  "held",
  "released",
  "delivered",
  "seen",
  "replied",
  "cancelled",
]);

const TERMINAL = new Set(["replied", "cancelled"]);

export class DeliveryQueue {
  #messages = new Map();
  #order = [];
  #typing = false;
  #counter = 0;
  #listeners = new Set();

  /**
   * @param {{ capacity?: number }} [options]
   * capacity: max messages held at once (default 16, matching the
   * published Agent Hub default). Enqueue past capacity throws.
   */
  constructor({ capacity = 16 } = {}) {
    if (!Number.isInteger(capacity) || capacity < 1) {
      throw new TypeError("capacity must be a positive integer");
    }
    this.capacity = capacity;
  }

  /** Number of messages not yet in a terminal state. */
  get size() {
    let n = 0;
    for (const m of this.#messages.values()) {
      if (!TERMINAL.has(m.state)) n += 1;
    }
    return n;
  }

  /** Whether the person is currently marked as typing. */
  get typing() {
    return this.#typing;
  }

  /**
   * Add a message. Returns its id. The message starts `queued`, or
   * `held` if the person is already typing: holding is the default
   * safe state, never a surprise delivery.
   */
  enqueue(payload) {
    if (this.size >= this.capacity) {
      throw new RangeError(`queue is full (capacity ${this.capacity})`);
    }
    const id = `msg-${++this.#counter}`;
    const message = {
      id,
      payload,
      state: this.#typing ? "held" : "queued",
      enqueuedAt: Date.now(),
    };
    this.#messages.set(id, message);
    this.#order.push(id);
    this.#emit(message);
    return id;
  }

  /**
   * Mark typing on or off. Turning typing on holds everything not yet
   * delivered. Turning it off releases held messages back to the
   * preview queue, in arrival order. It never delivers by itself:
   * delivery stays an explicit step.
   */
  setTyping(isTyping) {
    const next = Boolean(isTyping);
    if (next === this.#typing) return;
    this.#typing = next;
    for (const id of this.#order) {
      const m = this.#messages.get(id);
      if (!m) continue;
      if (next && (m.state === "queued" || m.state === "previewed" || m.state === "released")) {
        m.state = "held";
        this.#emit(m);
      } else if (!next && m.state === "held") {
        m.state = "released";
        this.#emit(m);
      }
    }
  }

  /**
   * Messages the person may look at now, in arrival order. Viewing
   * the preview wheel moves `queued` and `released` messages to
   * `previewed`. Held messages are listed too, flagged by state, so
   * nothing is ever hidden from the person it is waiting for.
   */
  preview() {
    const out = [];
    for (const id of this.#order) {
      const m = this.#messages.get(id);
      if (!m || TERMINAL.has(m.state) || m.state === "delivered" || m.state === "seen") continue;
      if (m.state === "queued" || m.state === "released") {
        m.state = "previewed";
        this.#emit(m);
      }
      out.push(snapshot(m));
    }
    return out;
  }

  /**
   * Deliver the next previewed message through `handler(payload)`.
   * Refuses while the person is typing: returns null instead of
   * interrupting. The handler runs synchronously; if it throws, the
   * message stays `previewed` and the error propagates, so a failed
   * delivery is never recorded as delivered.
   */
  deliverNext(handler) {
    if (typeof handler !== "function") throw new TypeError("handler must be a function");
    if (this.#typing) return null;
    for (const id of this.#order) {
      const m = this.#messages.get(id);
      if (!m || m.state !== "previewed") continue;
      handler(m.payload);
      m.state = "delivered";
      this.#emit(m);
      return snapshot(m);
    }
    return null;
  }

  /** Mark a delivered message as seen by the person. */
  markSeen(id) {
    return this.#move(id, "delivered", "seen");
  }

  /** Mark a seen (or delivered) message as replied to. Terminal. */
  markReplied(id) {
    const m = this.#get(id);
    if (m.state !== "seen" && m.state !== "delivered") {
      throw new Error(`cannot mark ${id} replied from state ${m.state}`);
    }
    m.state = "replied";
    this.#emit(m);
    return snapshot(m);
  }

  /** Cancel any non-terminal message. Terminal. */
  cancel(id) {
    const m = this.#get(id);
    if (TERMINAL.has(m.state)) throw new Error(`cannot cancel ${id} from state ${m.state}`);
    m.state = "cancelled";
    this.#emit(m);
    return snapshot(m);
  }

  /** Current snapshot of one message, or undefined if unknown. */
  get(id) {
    const m = this.#messages.get(id);
    return m ? snapshot(m) : undefined;
  }

  /** All messages ever enqueued, in arrival order. */
  list() {
    return this.#order.map((id) => snapshot(this.#messages.get(id)));
  }

  /**
   * Subscribe to state changes: fn(snapshot) on every transition.
   * Returns an unsubscribe function.
   */
  onChange(fn) {
    if (typeof fn !== "function") throw new TypeError("listener must be a function");
    this.#listeners.add(fn);
    return () => this.#listeners.delete(fn);
  }

  #get(id) {
    const m = this.#messages.get(id);
    if (!m) throw new Error(`unknown message ${id}`);
    return m;
  }

  #move(id, from, to) {
    const m = this.#get(id);
    if (m.state !== from) throw new Error(`cannot move ${id} from ${m.state} to ${to}`);
    m.state = to;
    this.#emit(m);
    return snapshot(m);
  }

  #emit(message) {
    const snap = snapshot(message);
    for (const fn of this.#listeners) fn(snap);
  }
}

function snapshot(m) {
  return { id: m.id, payload: m.payload, state: m.state, enqueuedAt: m.enqueuedAt };
}
