import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { runInNewContext } from "node:vm";

test("assistant notification retries display once, including after worker restart", async () => {
  const source = await readFile(
    new URL("../../public/firebase-messaging-sw.js", import.meta.url),
    "utf8",
  );
  const seen = new Map<string, Response>();
  const notifications: unknown[] = [],
    opened: string[] = [];
  function start() {
    let deliver: (payload: any) => Promise<void>;
    let click: (event: any) => void;
    runInNewContext(source, {
      URL,
      Request,
      Response,
      importScripts() {},
      firebase: {
        initializeApp() {},
        messaging: () => ({
          onBackgroundMessage(fn: any) {
            deliver = fn;
          },
        }),
      },
      caches: {
        open: async () => ({
          match: async (key: Request) => seen.get(key.url),
          put: async (key: Request, value: Response) => {
            seen.set(key.url, value);
          },
          keys: async () => [...seen.keys()].map((key) => new Request(key)),
          delete: async (key: Request) => seen.delete(key.url),
        }),
      },
      self: {
        location: new URL(
          "https://gestao.test/firebase-messaging-sw.js?apiKey=test&projectId=test&appId=test&messagingSenderId=test",
        ),
        registration: {
          showNotification: async (...args: unknown[]) => {
            notifications.push(args);
          },
        },
        clients: {
          matchAll: async () => [],
          openWindow: async (url: string) => {
            opened.push(url);
          },
        },
        addEventListener(_name: string, fn: any) {
          click = fn;
        },
      },
    });
    return {
      deliver: (p: any) => deliver!(p),
      click: async (link: string) => {
        let work: Promise<unknown> | undefined;
        click!({
          notification: { close() {}, data: { link } },
          waitUntil(p: Promise<unknown>) {
            work = p;
          },
        });
        await work;
      },
    };
  }
  const payload = {
    data: {
      type: "assistant_routine",
      notification_id: "synthetic-occurrence",
      title: "Seu dia",
      link: "/assistente",
    },
  };
  const first = start();
  await Promise.all([first.deliver(payload), first.deliver(payload)]);
  assert.equal(notifications.length, 1);
  const restarted = start();
  await restarted.deliver(payload);
  assert.equal(notifications.length, 1);
  await restarted.click("https://external.test/steal");
  assert.equal(opened.length, 0);
  await restarted.click("/assistente?run=synthetic");
  assert.equal(opened[0], "https://gestao.test/assistente?run=synthetic");
});
