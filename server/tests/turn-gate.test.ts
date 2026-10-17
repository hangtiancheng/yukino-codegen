import { describe, expect, it } from "vitest";
import { TurnGate } from "../src/agent-runtime/turn-gate.js";

describe("TurnGate", () => {
  it("admits up to the limit immediately and queues the rest FIFO", async () => {
    const gate = new TurnGate(2);
    const order: string[] = [];

    const first = await gate.acquire();
    order.push("first");
    const second = await gate.acquire();
    order.push("second");
    expect(gate.active).toBe(2);
    expect(gate.pending).toBe(0);

    const thirdPromise = gate.acquire().then((release) => {
      order.push("third");
      return release;
    });
    const fourthPromise = gate.acquire().then((release) => {
      order.push("fourth");
      return release;
    });
    await Promise.resolve();
    expect(gate.pending).toBe(2);
    expect(order).toEqual(["first", "second"]);

    first();
    const third = await thirdPromise;
    expect(order).toEqual(["first", "second", "third"]);
    expect(gate.active).toBe(2);

    second();
    const fourth = await fourthPromise;
    expect(order).toEqual(["first", "second", "third", "fourth"]);

    third();
    fourth();
    expect(gate.active).toBe(0);
  });

  it("release is idempotent and never frees a slot twice", async () => {
    const gate = new TurnGate(1);
    const release = await gate.acquire();
    release();
    release();
    expect(gate.active).toBe(0);

    const next = await gate.acquire();
    expect(gate.active).toBe(1);
    next();
  });

  it("rejects a queued waiter when its abort signal fires and frees the queue", async () => {
    const gate = new TurnGate(1);
    const release = await gate.acquire();
    const controller = new AbortController();
    const queued = gate.acquire(controller.signal);
    const rejection = expect(queued).rejects.toThrow("Turn aborted while waiting");
    await Promise.resolve();
    expect(gate.pending).toBe(1);

    controller.abort();
    await rejection;
    expect(gate.pending).toBe(0);

    // The slot still belongs to the first holder; a new waiter is admitted
    // normally once it releases.
    const next = gate.acquire();
    release();
    const releaseNext = await next;
    expect(gate.active).toBe(1);
    releaseNext();
  });

  it("rejects immediately when the signal is already aborted", async () => {
    const gate = new TurnGate(2);
    const controller = new AbortController();
    controller.abort();
    await expect(gate.acquire(controller.signal)).rejects.toThrow(
      "Turn aborted while waiting for a slot",
    );
    expect(gate.active).toBe(0);
  });

  it("prefers a different fairness key when a slot frees up", async () => {
    const gate = new TurnGate(1);
    const release = await gate.acquire(undefined, "user-a");
    const order: string[] = [];
    const secondA = gate.acquire(undefined, "user-a").then((value) => {
      order.push("a2");
      return value;
    });
    const firstB = gate.acquire(undefined, "user-b").then((value) => {
      order.push("b1");
      return value;
    });
    await Promise.resolve();
    expect(gate.pending).toBe(2);

    release();
    const releaseB = await firstB;
    expect(order).toEqual(["b1"]);

    // With only user-a left in the queue, FIFO resumes for the same key.
    releaseB();
    const releaseA2 = await secondA;
    expect(order).toEqual(["b1", "a2"]);
    releaseA2();
  });

  it("clamps a non-positive limit to a single slot", async () => {
    const gate = new TurnGate(0);
    const release = await gate.acquire();
    let secondAdmitted = false;
    const second = gate.acquire().then((value) => {
      secondAdmitted = true;
      return value;
    });
    await Promise.resolve();
    expect(secondAdmitted).toBe(false);
    release();
    const releaseSecond = await second;
    expect(secondAdmitted).toBe(true);
    releaseSecond();
  });
});
