import { randomUUID } from "node:crypto";
import { type ProfileValues } from "@autoapply/core";
import { attachRecorder, postProcessRecording, type Recorder } from "@autoapply/engine";
import { chromium, type Browser, type Page } from "playwright";

type Session = {
  id: string;
  browser: Browser;
  page: Page;
  recorder: Recorder;
  profile: ProfileValues;
};

const sessions = new Map<string, Session>();

export async function startRecordSession(url: string, profile: ProfileValues): Promise<string> {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1024, height: 768 } });
  const recorder = await attachRecorder(page);
  await page.goto(url, { waitUntil: "domcontentloaded" });
  const id = randomUUID();
  sessions.set(id, { id, browser, page, recorder, profile });
  return id;
}

export async function stopRecordSession(id: string): Promise<ReturnType<typeof postProcessRecording>> {
  const session = sessions.get(id);
  if (!session) {
    throw new Error("record session not found");
  }
  const events = await session.recorder.stop();
  const processed = postProcessRecording(events, session.profile);
  await session.browser.close();
  sessions.delete(id);
  return processed;
}


