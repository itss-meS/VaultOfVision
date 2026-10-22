import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { App } from "../src/App";
import i18n from "../src/i18n";
import { EngineError } from "../src/contracts/types";
import { FakeEngineClient } from "./fakeEngine";

function leaf(): File {
  return new File([new Uint8Array(2048)], "leaf.jpg", { type: "image/jpeg" });
}

function choose(testId: string, file: File = leaf()) {
  fireEvent.change(screen.getByTestId(testId), { target: { files: [file] } });
}

async function createAccount(
  name = "Asha Patil",
  mobile = "9876543210",
  password = "secret1",
) {
  fireEvent.click(screen.getByRole("tab", { name: "Create Account" }));
  fireEvent.change(screen.getByPlaceholderText("Your name"), {
    target: { value: name },
  });
  fireEvent.change(screen.getByPlaceholderText("10-digit mobile number"), {
    target: { value: mobile },
  });
  fireEvent.change(screen.getByPlaceholderText("At least 6 characters"), {
    target: { value: password },
  });
  fireEvent.change(screen.getByPlaceholderText("Type the password again"), {
    target: { value: password },
  });
  fireEvent.click(screen.getByRole("button", { name: "Create Account" }));
}

beforeEach(async () => {
  vi.stubGlobal(
    "URL",
    Object.assign(URL, {
      createObjectURL: () => "blob:fake",
      revokeObjectURL: () => undefined,
    }),
  );
  document.documentElement.removeAttribute("data-theme");
  await act(async () => {
    await i18n.changeLanguage("en");
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("sign up and log in", () => {
  it("validates the form before calling the engine", async () => {
    render(<App engine={new FakeEngineClient(0)} />);
    await screen.findByText("Welcome to Redesigned Edge AI");
    fireEvent.change(screen.getByPlaceholderText("10-digit mobile number"), {
      target: { value: "12345" },
    });
    fireEvent.change(screen.getByPlaceholderText("Your password"), {
      target: { value: "secret1" },
    });
    fireEvent.click(
      screen.getByRole("button", { name: "Log In", hidden: false }),
    );
    expect(
      await screen.findByText("Enter a valid 10-digit mobile number."),
    ).toBeTruthy();

    fireEvent.click(screen.getByRole("tab", { name: "Create Account" }));
    fireEvent.change(screen.getByPlaceholderText("10-digit mobile number"), {
      target: { value: "9876543210" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Create Account" }));
    expect(
      await screen.findByText("Enter your name (2 to 60 characters)."),
    ).toBeTruthy();

    fireEvent.change(screen.getByPlaceholderText("Your name"), {
      target: { value: "Asha" },
    });
    fireEvent.change(screen.getByPlaceholderText("At least 6 characters"), {
      target: { value: "secret1" },
    });
    fireEvent.change(screen.getByPlaceholderText("Type the password again"), {
      target: { value: "other12" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Create Account" }));
    expect(await screen.findByText("The passwords do not match.")).toBeTruthy();
  });

  it("creates an account, lands on the home screen and logs out and in again", async () => {
    render(<App engine={new FakeEngineClient(0)} />);
    await screen.findByText("Welcome to Redesigned Edge AI");
    await createAccount();
    await screen.findByText("Open Camera to Scan Leaf");
    expect(
      screen.getByText("No scans yet. Scan your first leaf."),
    ).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Account" }));
    await screen.findByText("Asha Patil");
    fireEvent.click(screen.getByRole("button", { name: "Log Out" }));
    await screen.findByText("Welcome to Redesigned Edge AI");

    fireEvent.change(screen.getByPlaceholderText("10-digit mobile number"), {
      target: { value: "9876543210" },
    });
    fireEvent.change(screen.getByPlaceholderText("Your password"), {
      target: { value: "wrong-pass" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Log In" }));
    expect(
      await screen.findByText("Wrong mobile number or password."),
    ).toBeTruthy();

    fireEvent.change(screen.getByPlaceholderText("Your password"), {
      target: { value: "secret1" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Log In" }));
    await screen.findByText("Open Camera to Scan Leaf");
  });

  it("explains that a mobile number is already registered", async () => {
    const engine = new FakeEngineClient(0);
    await engine.signUp({
      name: "Asha Patil",
      mobile: "9876543210",
      password: "secret1",
    });
    await engine.logout();
    render(<App engine={engine} />);
    await screen.findByText("Welcome to Redesigned Edge AI");
    await createAccount();
    expect(
      await screen.findByText(
        "This mobile number already has an account. Log in instead.",
      ),
    ).toBeTruthy();
  });

  it("restores a signed in session", async () => {
    render(<App engine={new FakeEngineClient(0, true)} />);
    await screen.findByText("Open Camera to Scan Leaf");
  });
});

describe("scan, advice and history", () => {
  it("scans a photo, shows advice and keeps it in the history", async () => {
    render(<App engine={new FakeEngineClient(0, true)} />);
    await screen.findByText("Open Camera to Scan Leaf");
    choose("gallery-input");
    await screen.findByText("AI Confidence");
    fireEvent.click(screen.getByRole("button", { name: "Get advice" }));
    await screen.findByText("What to do");
    expect(screen.getByRole("button", { name: "Play audio" })).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Check another leaf" }));
    await screen.findByText("Crop Disease Scanner");

    fireEvent.click(screen.getByRole("button", { name: /^History/ }));
    await screen.findByText("Field Ledger");
    expect(screen.getByText("Diagnosis History (1)")).toBeTruthy();
    expect(screen.getByRole("button", { name: "History (1)" })).toBeTruthy();

    const item = screen.getAllByRole("button", { name: /match|%/ })[0];
    if (!item) throw new Error("no history item");
    fireEvent.click(item);
    await screen.findByText("Scan details");
    await screen.findByText("What to do");
  });

  it("filters, deletes and clears the history", async () => {
    const engine = new FakeEngineClient(0, true);
    render(<App engine={engine} />);
    await screen.findByText("Open Camera to Scan Leaf");
    choose(
      "gallery-input",
      new File([new Uint8Array(2048)], "a.jpg", { type: "image/jpeg" }),
    );
    await screen.findByText("AI Confidence");
    fireEvent.click(screen.getByRole("button", { name: "Account" }));
    fireEvent.click(screen.getByRole("button", { name: /^History/ }));
    await screen.findByText("Diagnosis History (1)");

    fireEvent.click(screen.getByRole("button", { name: "Pest" }));
    expect(screen.getByText("No scans in this list.")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "All" }));

    fireEvent.click(screen.getByRole("button", { name: "Delete scan" }));
    await screen.findByText("Diagnosis History (0)");
  });

  it("asks to retake a low quality photo", async () => {
    const engine = new FakeEngineClient(0, true);
    vi.spyOn(engine, "analyzeImage").mockResolvedValue({
      class_id: 0,
      label: "Early Blight",
      confidence: 0.3,
      bbox: [0, 0, 1, 1],
      mask_polygon: [],
      severity_level: null,
      low_confidence: true,
    });
    render(<App engine={engine} />);
    await screen.findByText("Open Camera to Scan Leaf");
    choose("camera-input");
    await screen.findByText(
      "The photo is not clear enough. Please take another one.",
    );
    expect(await engine.listScans()).toHaveLength(0);
  });

  it("shows an error and stays on the scanner when analysis fails", async () => {
    const engine = new FakeEngineClient(0, true);
    vi.spyOn(engine, "analyzeImage").mockRejectedValue(new Error("boom"));
    render(<App engine={engine} />);
    await screen.findByText("Open Camera to Scan Leaf");
    choose("gallery-input");
    await screen.findByText("Something went wrong. Please try again.");
    expect(screen.getByText("Crop Disease Scanner")).toBeTruthy();
  });
});

describe("language, theme and account", () => {
  it("switches the whole app between all four languages", async () => {
    render(<App engine={new FakeEngineClient(0, true)} />);
    await screen.findByText("Open Camera to Scan Leaf");
    for (const [native, home] of [
      ["తెలుగు", "హోమ్"],
      ["हिन्दी", "होम"],
      ["मराठी", "मुख्यपृष्ठ"],
      ["English", "Home"],
    ] as const) {
      fireEvent.click(
        document.querySelector<HTMLElement>(
          '[aria-haspopup="menu"]',
        ) as HTMLElement,
      );
      const menu = screen.getByRole("menu");
      fireEvent.click(
        within(menu).getByRole("menuitemradio", {
          name: (n) => n.startsWith(native),
        }),
      );
      await waitFor(() =>
        expect(
          within(screen.getByRole("navigation")).getByText(home),
        ).toBeTruthy(),
      );
    }
  });

  it("toggles the dark theme", async () => {
    render(<App engine={new FakeEngineClient(0, true)} />);
    await screen.findByText("Open Camera to Scan Leaf");
    fireEvent.click(screen.getByRole("button", { name: "Switch theme" }));
    expect(document.documentElement.getAttribute("data-theme")).toBe("dark");
    fireEvent.click(screen.getByRole("button", { name: "Switch theme" }));
    expect(document.documentElement.getAttribute("data-theme")).toBe("light");
  });

  it("opens and closes the about sheet", async () => {
    render(<App engine={new FakeEngineClient(0, true)} />);
    await screen.findByText("Open Camera to Scan Leaf");
    fireEvent.click(screen.getByRole("button", { name: "About" }));
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText("0.1.0")).toBeTruthy();
    fireEvent.click(within(dialog).getByRole("button", { name: "Close" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });

  it("saves the profile and validates the farm size", async () => {
    const engine = new FakeEngineClient(0, true);
    render(<App engine={engine} />);
    await screen.findByText("Open Camera to Scan Leaf");
    fireEvent.click(screen.getByRole("button", { name: "Account" }));
    fireEvent.change(screen.getByPlaceholderText("Used for dosage totals"), {
      target: { value: "0" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
    expect(
      await screen.findByText("Enter a size above 0 and up to 1000."),
    ).toBeTruthy();
    fireEvent.change(screen.getByPlaceholderText("Used for dosage totals"), {
      target: { value: "1.5" },
    });
    fireEvent.change(screen.getByPlaceholderText("Add village"), {
      target: { value: "Baramati" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
    await screen.findByText("Saved");
    expect((await engine.restoreSession())?.areaHa).toBe(1.5);
  });

  it("deletes the account only with the right password", async () => {
    const engine = new FakeEngineClient(0, true);
    render(<App engine={engine} />);
    await screen.findByText("Open Camera to Scan Leaf");
    fireEvent.click(screen.getByRole("button", { name: "Account" }));
    fireEvent.click(screen.getByRole("button", { name: "Delete my account" }));
    fireEvent.change(screen.getByLabelText("Password"), {
      target: { value: "not-right" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Delete account" }));
    expect(
      await screen.findByText("Wrong mobile number or password."),
    ).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Password"), {
      target: { value: "secret1" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Delete account" }));
    await screen.findByText("Welcome to Redesigned Edge AI");
    expect(await engine.restoreSession()).toBeNull();
  });
});

describe("confidence list and advice chat", () => {
  it("shows every model result with its confidence and no choice to make", async () => {
    render(<App engine={new FakeEngineClient(0, true)} />);
    await screen.findByText("Open Camera to Scan Leaf");
    choose("gallery-input");
    await screen.findByText("AI results from every model");
    expect(screen.queryByRole("radio")).toBeNull();
    expect(screen.getByText("Leaf disease model")).toBeTruthy();
    expect(screen.getByText("Insect and pest model")).toBeTruthy();
    expect(screen.getAllByRole("progressbar").length).toBeGreaterThanOrEqual(3);
  });

  it("opens the advice as a chat and answers follow-up questions about the leaf", async () => {
    const engine = new FakeEngineClient(0, true);
    render(<App engine={engine} />);
    await screen.findByText("Open Camera to Scan Leaf");
    choose("gallery-input");
    await screen.findByText("AI results from every model");
    fireEvent.click(screen.getByRole("button", { name: "Get advice" }));
    await screen.findByText("What to do");
    expect(
      screen.getByPlaceholderText("Ask a follow-up question"),
    ).toBeTruthy();
    fireEvent.change(screen.getByPlaceholderText("Ask a follow-up question"), {
      target: { value: "Can I water in the evening?" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Send" }));
    await screen.findByText("Water early in the day.");
    expect(screen.getByText("Can I water in the evening?")).toBeTruthy();
    expect(screen.getByText("What to do")).toBeTruthy();
    expect(engine.chatTopics[0]).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Back" }));
    await screen.findByText("AI results from every model");
  });

  it("starts a new scan from the advice chat", async () => {
    render(<App engine={new FakeEngineClient(0, true)} />);
    await screen.findByText("Open Camera to Scan Leaf");
    choose("gallery-input");
    await screen.findByText("AI results from every model");
    fireEvent.click(screen.getByRole("button", { name: "Get advice" }));
    await screen.findByText("What to do");
    fireEvent.click(screen.getByRole("button", { name: "Check another leaf" }));
    await screen.findByText("Crop Disease Scanner");
  });
});

describe("chat", () => {
  async function openChat(engine: FakeEngineClient) {
    render(<App engine={engine} />);
    await screen.findByText("Open Camera to Scan Leaf");
    fireEvent.click(screen.getByRole("button", { name: "Ask" }));
    await screen.findByText("Ask AgriEdge");
  }

  it("sends a question and shows the answer", async () => {
    const engine = new FakeEngineClient(0, true);
    await openChat(engine);
    fireEvent.change(screen.getByPlaceholderText("Type your question"), {
      target: { value: "When should I water?" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Send" }));
    await screen.findByText("Water early in the day.");
    expect(screen.getByText("When should I water?")).toBeTruthy();
    expect(engine.chatCalls[0]?.[0]?.content).toBe("When should I water?");
  });

  it("sends a suggested question and clears the chat", async () => {
    const engine = new FakeEngineClient(0, true);
    await openChat(engine);
    fireEvent.click(
      screen.getByRole("button", {
        name: "How do I stop leaf spots on tomato?",
      }),
    );
    await screen.findByText("Water early in the day.");
    fireEvent.click(screen.getByRole("button", { name: "Clear chat" }));
    expect(screen.queryByText("Water early in the day.")).toBeNull();
    expect(screen.getByText(/Ask a farming question/)).toBeTruthy();
  });

  it("keeps the conversation when switching tabs", async () => {
    const engine = new FakeEngineClient(0, true);
    await openChat(engine);
    fireEvent.click(
      screen.getByRole("button", {
        name: "When should I water tomato plants?",
      }),
    );
    await screen.findByText("Water early in the day.");
    fireEvent.click(screen.getByRole("button", { name: "Home" }));
    fireEvent.click(screen.getByRole("button", { name: "Ask" }));
    expect(await screen.findByText("Water early in the day.")).toBeTruthy();
  });

  it("explains when the language model is not available", async () => {
    const engine = new FakeEngineClient(0, true);
    engine.chatReply = new EngineError("unavailable", "no model");
    await openChat(engine);
    fireEvent.change(screen.getByPlaceholderText("Type your question"), {
      target: { value: "Hello" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Send" }));
    expect(
      await screen.findByText(
        "The language model runs only in the Android app. It is not available in the browser.",
      ),
    ).toBeTruthy();
  });

  it("does not send an empty question", async () => {
    const engine = new FakeEngineClient(0, true);
    await openChat(engine);
    expect(
      (screen.getByRole("button", { name: "Send" }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);
  });
});
