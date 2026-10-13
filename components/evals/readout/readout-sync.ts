"use client";

/**
 * Keeps the audience window and the presenter window of one readout in step
 * (launch L-35): the current slide, the timer, the transcripts and next step
 * in use and, for operators, the notes. Both windows are the same person's
 * tabs on the same origin, connected by a BroadcastChannel named after the
 * report revision. A window that opens asks for the current state; every
 * local change is published; remote changes are applied without echoing.
 */
import { useCallback, useEffect, useRef } from "react";
import type { ReadoutNextStep } from "@/lib/evals/reports/readout";

export type ReadoutTimer = { running: boolean; startedAt: number | null; base: number };
export type ReadoutSyncState = {
  index: number;
  timer: ReadoutTimer;
  transcriptIds: string[];
  nextStep: ReadoutNextStep;
  notes?: Record<string, string>;
};
type Message = { type: "hello"; from: string } | { type: "state"; from: string; state: ReadoutSyncState } | { type: "exit"; from: string };

export function readoutChannelName(revisionId: string) {
  return `caudals-readout:${revisionId}`;
}

export function timerElapsed(timer: ReadoutTimer, now: number) {
  return timer.base + (timer.running && timer.startedAt != null ? Math.max(0, now - timer.startedAt) : 0);
}

export function useReadoutSync(name: string, current: () => ReadoutSyncState, apply: (state: ReadoutSyncState) => void, onExit?: () => void) {
  const channel = useRef<BroadcastChannel | null>(null);
  const id = useRef("");
  const latest = useRef({ current, apply, onExit });
  useEffect(() => {
    latest.current = { current, apply, onExit };
  });
  useEffect(() => {
    if (typeof BroadcastChannel === "undefined") return;
    if (!id.current) id.current = crypto.randomUUID();
    const from = id.current;
    const open = new BroadcastChannel(name);
    channel.current = open;
    open.onmessage = (event: MessageEvent<Message>) => {
      const message = event.data;
      if (!message || message.from === from) return;
      if (message.type === "hello") open.postMessage({ type: "state", from, state: latest.current.current() } satisfies Message);
      else if (message.type === "state") latest.current.apply(message.state);
      else if (message.type === "exit") latest.current.onExit?.();
    };
    open.postMessage({ type: "hello", from } satisfies Message);
    return () => {
      open.close();
      if (channel.current === open) channel.current = null;
    };
  }, [name]);
  const publish = useCallback((state: ReadoutSyncState) => {
    channel.current?.postMessage({ type: "state", from: id.current, state } satisfies Message);
  }, []);
  const publishExit = useCallback(() => {
    channel.current?.postMessage({ type: "exit", from: id.current } satisfies Message);
  }, []);
  return { publish, publishExit, supported: typeof BroadcastChannel !== "undefined" };
}
