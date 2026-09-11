import { describe, expect, it } from "vitest";
import { readImageAssetConversation } from "./session";

describe("readImageAssetConversation", () => {
  it("keeps only user and assistant text from the active branch", () => {
    expect(
      readImageAssetConversation([
        {
          type: "message",
          message: {
            role: "user",
            content: [
              { type: "text", text: "Generate assets/fox.png" },
              { type: "image", data: "ignored" },
            ],
          },
        },
        {
          type: "message",
          message: {
            role: "assistant",
            content: "IMAGE_ASSET_PROPOSAL",
          },
        },
        {
          type: "message",
          message: { role: "toolResult", content: "ignored" },
        },
        { type: "custom", data: "ignored" },
      ]),
    ).toEqual([
      { role: "user", text: "Generate assets/fox.png" },
      { role: "assistant", text: "IMAGE_ASSET_PROPOSAL" },
    ]);
  });

  it("supports legacy root-level content without inventing non-text content", () => {
    expect(
      readImageAssetConversation([
        {
          type: "message",
          message: { role: "user" },
          content: [{ type: "text", text: "确认图片资产" }],
        },
        {
          type: "message",
          message: { role: "assistant", content: [{ type: "toolCall" }] },
        },
      ]),
    ).toEqual([
      { role: "user", text: "确认图片资产" },
      { role: "assistant", text: "" },
    ]);
  });
});
