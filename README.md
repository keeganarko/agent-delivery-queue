# agent-delivery-queue

A small delivery queue for messages from coding agents to a person.
One rule runs it: while the person is typing, incoming messages wait.
An agent message must never land on top of an unsent human draft.

Zero dependencies. Node 20+. The whole contract is one file:
[`src/index.js`](src/index.js).

## Why this exists

I run five coding agents on one project in Agent Hub. Early on,
agent messages kept arriving mid-sentence and overwriting what I was
typing. The fix that mattered was not smarter sync. It was a boring
rule: my typing comes first. In my own logs that one rule overruled
the fancier sync design 393 times out of 441. I wrote that up in
[Agents need direction more than anything](https://www.keegan.ai/writing/agents-need-direction.html).

Agent Hub's production queue is private and much larger. This package
is a reference implementation of its published design: an eight-state
queue, `queued` through `replied`, holding messages in a preview
queue while a person is typing. It implements the contract, not the
production system. There is no storage, transport, or UI in here.

## The states

`queued → previewed → delivered → seen → replied`, with two side
states. `held` is where messages sit while the person types, and
`released` is where they return when typing stops. `cancelled` ends
a message from anywhere. Delivery is always an explicit step:
releasing held messages never delivers them by itself, and
`deliverNext` refuses outright while typing is on.

## Use

```js
import { DeliveryQueue } from "agent-delivery-queue";

const queue = new DeliveryQueue(); // capacity 16, like Agent Hub

queue.enqueue({ from: "agent", text: "Tests pass. Ready for review." });
queue.setTyping(true);   // person starts typing: everything holds
queue.setTyping(false);  // person stops: held messages release

for (const message of queue.preview()) {
  console.log(message.state, message.payload.text);
}

const delivered = queue.deliverNext((payload) => showToPerson(payload));
if (delivered) queue.markSeen(delivered.id);
```

If your delivery handler throws, the message stays `previewed`.
A failed delivery is never recorded as delivered.

## Limits

- In-memory only. Persist snapshots yourself if you need durability.
- Single process, single person. Multiplayer ordering belongs in
  your transport layer, not here.
- Typing detection is yours: call `setTyping` from your editor,
  terminal, or input box. This package only enforces what you tell it.

## Colophon

Source-available under FSL-1.1-MIT (see `LICENSE.md`). Part of the
work behind [Relay](https://www.relayaiworld.com) and
[keegan.ai](https://www.keegan.ai).
