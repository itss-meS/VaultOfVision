import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { App } from "../src/App";
import { FakeEngineClient } from "./fakeEngine";
import { HttpEngineClient } from "../src/engine/http";
import { EngineError } from "../src/contracts/types";

function pickFile(container: HTMLElement) {
  const inputs = Array.from(
    container.querySelectorAll<HTMLInputElement>("input[type=file]"),
  );
  const file = new File([new Uint8Array(2048)], "leaf.jpg", {
    type: "image/jpeg",
  });
  const input = inputs[1];
  if (!input) throw new Error("no input");
  fireEvent.change(input, { target: { files: [file] } });
}

describe("App click-through with a fake engine", () => {
  it("runs setup, capture, result and advisory offline", async () => {
    vi.stubGlobal(
      "URL",
      Object.assign(URL, {
        createObjectURL: () => "blob:fake",
        revokeObjectURL: () => undefined,
      }),
    );
    const { container } = render(<App engine={new FakeEngineClient(0)} />);
    await screen.findByText("Set up");
    fireEvent.click(screen.getByRole("button", { name: "हिन्दी" }));
    await screen.findByText("सेटअप");
    fireEvent.click(screen.getByRole("button", { name: "आगे बढ़ें" }));
    await waitFor(() =>
      expect(container.querySelectorAll("input[type=file]").length).toBe(2),
    );
    pickFile(container);
    const analyze = await screen.findByRole("button", { name: "पत्ती जाँचें" });
    await waitFor(() =>
      expect((analyze as HTMLButtonElement).disabled).toBe(false),
    );
    fireEvent.click(analyze);
    await screen.findByText("परिणाम");
  });
});

describe("HttpEngineClient", () => {
  it("sends csrf header after login and maps errors", async () => {
    const calls: Array<{ url: string; headers: Headers }> = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init: RequestInit) => {
        calls.push({ url, headers: new Headers(init.headers) });
        if (url.endsWith("/session") && init.method === "POST") {
          return new Response(
            JSON.stringify({
              profile_id: "p",
              role: "farmer",
              lang: "en",
              csrf: "tok",
              expires_in: 900,
            }),
          );
        }
        return new Response("{}", { status: 429 });
      }),
    );
    const client = new HttpEngineClient("/api/v1");
    await client.login("p", "1234");
    await expect(
      client.ask("q", undefined, { lang: "en" }),
    ).rejects.toMatchObject({ code: "rate" });
    const last = calls[calls.length - 1];
    expect(last?.headers.get("X-CSRF-Token")).toBe("tok");
    expect(last?.headers.get("Authorization")).toBeNull();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => Promise.reject(new TypeError("x"))),
    );
    await expect(client.analyzeImage(new Blob([]))).rejects.toBeInstanceOf(
      EngineError,
    );
  });

  it("restoreSession returns null on 401", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("{}", { status: 401 })),
    );
    expect(await new HttpEngineClient().restoreSession()).toBeNull();
  });
});
