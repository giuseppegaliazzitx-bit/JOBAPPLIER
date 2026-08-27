import type { FieldDescriptor } from "@autoapply/core";
import type { Page } from "playwright";
import { locate } from "./locate.ts";

const PAD = 40;
const MAX_WIDTH = 800;

export async function cropFieldScreenshot(
  page: Page,
  field: FieldDescriptor,
): Promise<{ mime: "image/jpeg"; data: string } | undefined> {
  const loc = await locate(page, field.selector).catch(() => null);
  if (!loc) {
    return undefined;
  }
  const box = await loc.boundingBox();
  if (!box) {
    return undefined;
  }
  const clip = {
    x: Math.max(0, box.x - PAD),
    y: Math.max(0, box.y - PAD),
    width: box.width + PAD * 2,
    height: box.height + PAD * 2,
    scale: Math.min(1, MAX_WIDTH / Math.max(box.width + PAD * 2, 1)),
  };
  try {
    const cdp = await page.context().newCDPSession(page);
    const shot = await cdp.send("Page.captureScreenshot", {
      format: "jpeg",
      quality: 50,
      clip,
    });
    await cdp.detach().catch(() => undefined);
    return { mime: "image/jpeg", data: shot.data };
  } catch {
    const buf = await page.screenshot({
      type: "jpeg",
      quality: 50,
      clip: { x: clip.x, y: clip.y, width: clip.width, height: clip.height },
    });
    return { mime: "image/jpeg", data: buf.toString("base64") };
  }
}
