import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { AboutSheet } from "./components/AboutSheet";
import { BottomNav, type Tab } from "./components/BottomNav";
import { Header } from "./components/Header";
import {
  type AdvisoryResponse,
  type Candidate,
  type ChatTurn,
  type EngineClient,
  EngineError,
  type Lang,
  type LedgerStats,
  type ProfilePatch,
  type ScanKind,
  type ScanRecord,
  type UserProfile,
  type VisionResult,
} from "./contracts/types";
import { createEngine } from "./engine";
import i18n from "./i18n";
import { kindOfLabel } from "./lib/label";
import {
  applyTheme,
  loadLang,
  loadTheme,
  saveLang,
  saveTheme,
  type ThemeChoice,
} from "./lib/prefs";
import { makeThumb } from "./lib/thumb";
import { Account } from "./screens/Account";
import { Chat } from "./screens/Chat";
import { History } from "./screens/History";
import { Home } from "./screens/Home";
import { Login } from "./screens/Login";
import { Result } from "./screens/Result";
import { Scan } from "./screens/Scan";
import { ScanDetail } from "./screens/ScanDetail";

type View = "tab" | "result" | "advisory" | "detail";

const NO_STATS: LedgerStats = { scans: 0, bytes: 0, lastAt: null };

interface Props {
  engine?: EngineClient;
}

export function App({ engine: injected }: Props) {
  const { t } = useTranslation();
  const engine = useMemo(() => injected ?? createEngine(), [injected]);
  const [booting, setBooting] = useState(true);
  const [user, setUser] = useState<UserProfile | null>(null);
  const [lang, setLang] = useState<Lang>(loadLang() ?? "en");
  const [theme, setTheme] = useState<ThemeChoice>(loadTheme());
  const [tab, setTab] = useState<Tab>("home");
  const [view, setView] = useState<View>("tab");
  const [detailId, setDetailId] = useState<string | null>(null);
  const [scans, setScans] = useState<ScanRecord[]>([]);
  const [stats, setStats] = useState<LedgerStats>(NO_STATS);
  const [vision, setVision] = useState<VisionResult | null>(null);
  const [kind, setKind] = useState<ScanKind>("disease");
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [scanId, setScanId] = useState<string | null>(null);
  const [response, setResponse] = useState<AdvisoryResponse | null>(null);
  const [analysing, setAnalysing] = useState(false);
  const [advising, setAdvising] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [aboutOpen, setAboutOpen] = useState(false);
  const [cands, setCands] = useState<Candidate[]>([]);
  const [followUp, setFollowUp] = useState<ChatTurn[]>([]);
  const [chat, setChat] = useState<ChatTurn[]>([]);
  const [chatBusy, setChatBusy] = useState(false);
  const [chatError, setChatError] = useState<string | null>(null);
  const urlRef = useRef<string | null>(null);
  const warmedRef = useRef(false);
  const photoRef = useRef<File | null>(null);
  const durationRef = useRef(0);

  const reset = useCallback(() => {
    setVision(null);
    setCands([]);
    setFollowUp([]);
    setResponse(null);
    setScanId(null);
    setError(null);
    setDetailId(null);
  }, []);

  const signedOut = useCallback(() => {
    setUser(null);
    setScans([]);
    setStats(NO_STATS);
    setChat([]);
    setChatError(null);
    reset();
    setTab("home");
    setView("tab");
  }, [reset]);

  const fail = useCallback(
    (err: unknown) => {
      const code = err instanceof EngineError ? err.code : "unknown";
      if (code === "auth") signedOut();
      setError(t(`errors.${code}`));
    },
    [signedOut, t],
  );

  const refresh = useCallback(async () => {
    try {
      const [list, ledger] = await Promise.all([
        engine.listScans(),
        engine.ledgerStats(),
      ]);
      setScans(list);
      setStats(ledger);
    } catch (err) {
      fail(err);
    }
  }, [engine, fail]);

  useEffect(() => {
    void i18n.changeLanguage(lang);
    document.documentElement.lang = lang;
  }, [lang]);

  useEffect(() => {
    let live = true;
    engine
      .restoreSession()
      .then((u) => {
        if (!live) return;
        if (u) {
          setUser(u);
          setLang(u.lang);
        }
      })
      .catch((err: unknown) => {
        if (live) fail(err);
      })
      .finally(() => {
        if (live) setBooting(false);
      });
    return () => {
      live = false;
    };
  }, [engine, fail]);

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [tab, view]);

  useEffect(() => {
    if (!user || warmedRef.current) return;
    if (tab === "chat" || view === "result" || view === "advisory") {
      warmedRef.current = true;
      void engine.warmUp();
    }
  }, [user, tab, view, engine]);

  useEffect(() => {
    if (user) void refresh();
  }, [user, refresh]);

  useEffect(
    () => () => {
      if (urlRef.current) URL.revokeObjectURL(urlRef.current);
    },
    [],
  );

  function changeLang(next: Lang) {
    setLang(next);
    saveLang(next);
    if (user && user.lang !== next) {
      engine
        .updateProfile({ lang: next })
        .then(setUser)
        .catch(() => undefined);
    }
  }

  function toggleTheme() {
    const next: ThemeChoice = theme === "dark" ? "light" : "dark";
    setTheme(next);
    saveTheme(next);
    applyTheme(next);
  }

  function go(next: Tab) {
    setTab(next);
    setView("tab");
    setError(null);
    if (next === "history" || next === "home") void refresh();
  }

  function onUser(next: UserProfile) {
    setUser(next);
    setLang(next.lang);
    saveLang(next.lang);
    setTab("home");
    setView("tab");
  }

  async function analyze(photo: File) {
    if (analysing) return;
    setAnalysing(true);
    setError(null);
    const started = performance.now();
    try {
      const result = await engine.analyzeImage(photo);
      const duration = performance.now() - started;
      photoRef.current = photo;
      durationRef.current = duration;
      if (urlRef.current) URL.revokeObjectURL(urlRef.current);
      const url = URL.createObjectURL(photo);
      urlRef.current = url;
      setPhotoUrl(url);
      const list = engine.candidates();
      setVision(result);
      setCands(list);
      setKind(list[0]?.kind ?? kindOfLabel(result.label));
      setResponse(null);
      setScanId(null);
      if (!result.low_confidence) {
        try {
          const id = await engine.saveScan({
            vision: result,
            thumb: await makeThumb(photo),
            durationMs: duration,
          });
          setScanId(id);
          void refresh();
        } catch (err) {
          if (err instanceof EngineError && err.code === "auth") throw err;
        }
      }
      setTab("scan");
      setView("result");
    } catch (err) {
      setTab("scan");
      setView("tab");
      fail(err);
    } finally {
      setAnalysing(false);
    }
  }

  async function converse(
    text: string,
    list: ChatTurn[],
    setList: (next: ChatTurn[]) => void,
    topic?: string,
  ) {
    if (chatBusy) return;
    const next: ChatTurn[] = [...list, { role: "user", content: text }];
    setList(next);
    setChatBusy(true);
    setChatError(null);
    try {
      const reply = await engine.chat(next, lang, topic, (partial) => {
        if (partial.length > 0)
          setList([...next, { role: "assistant", content: partial }]);
      });
      setList([...next, { role: "assistant", content: reply }]);
    } catch (err) {
      const code = err instanceof EngineError ? err.code : "unknown";
      if (code === "auth") signedOut();
      else if (code === "llm")
        setChatError(
          t("errors.llm", {
            detail: err instanceof Error ? err.message : "",
          }),
        );
      else setChatError(t(`errors.${code}`));
    } finally {
      setChatBusy(false);
    }
  }

  async function advise() {
    if (!vision) return;
    setAdvising(true);
    setError(null);
    try {
      const res = await engine.ask(vision.label, vision, {
        lang,
        area_ha: user?.areaHa ?? undefined,
      });
      setResponse(res);
      setFollowUp([]);
      setChatError(null);
      setView("advisory");
      if (scanId) {
        try {
          await engine.attachAdvice(scanId, res);
          void refresh();
        } catch (err) {
          if (err instanceof EngineError && err.code === "auth") throw err;
        }
      }
    } catch (err) {
      fail(err);
    } finally {
      setAdvising(false);
    }
  }

  async function speak(text: string, spoken?: Lang) {
    setError(null);
    try {
      await engine.speak(text, spoken ?? lang);
    } catch (err) {
      fail(err);
    }
  }

  async function saveProfile(patch: ProfilePatch) {
    setUser(await engine.updateProfile(patch));
  }

  async function logout() {
    try {
      await engine.logout();
    } finally {
      signedOut();
    }
  }

  async function deleteAccount(password: string) {
    await engine.deleteAccount(password);
    signedOut();
  }

  async function removeScan(id: string) {
    try {
      await engine.deleteScan(id);
      await refresh();
    } catch (err) {
      fail(err);
    }
  }

  async function clearScans() {
    try {
      await engine.clearScans();
      await refresh();
    } catch (err) {
      fail(err);
    }
  }

  function openDetail(id: string) {
    setDetailId(id);
    setView("detail");
    setError(null);
  }

  const header = (
    <Header
      lang={lang}
      theme={theme}
      onLang={changeLang}
      onTheme={toggleTheme}
      onAbout={() => setAboutOpen(true)}
    />
  );
  const about = aboutOpen ? (
    <AboutSheet engine={engine} onClose={() => setAboutOpen(false)} />
  ) : null;

  const frame = "mx-auto min-h-dvh w-full max-w-[480px] bg-bg";

  if (booting) {
    return (
      <div className={frame}>
        <p className="p-6 text-base text-muted">{t("common.loading")}</p>
      </div>
    );
  }

  if (!user) {
    return (
      <div className={frame}>
        {header}
        <Login engine={engine} lang={lang} onUser={onUser} />
        {about}
      </div>
    );
  }

  const detail = detailId ? scans.find((s) => s.id === detailId) : undefined;
  let body;
  if (view === "result" && vision && photoUrl) {
    body = (
      <Result
        vision={vision}
        kind={kind}
        candidates={cands}
        photoUrl={photoUrl}
        busy={advising}
        error={error}
        onBack={() => go("scan")}
        onAdvice={() => void advise()}
      />
    );
  } else if (view === "advisory" && response) {
    body = (
      <Chat
        advice={{
          response,
          speakError: error,
          onSpeak: speak,
          onBack: () => {
            setChatError(null);
            setView("result");
          },
          onRestart: () => {
            reset();
            go("scan");
          },
        }}
        messages={followUp}
        busy={chatBusy}
        error={chatError}
        onSend={(text) =>
          void converse(text, followUp, setFollowUp, vision?.label)
        }
        onClear={() => {
          setFollowUp([]);
          setChatError(null);
        }}
      />
    );
  } else if (view === "detail" && detail) {
    body = (
      <ScanDetail
        engine={engine}
        scan={detail}
        onSpeak={speak}
        speakError={error}
        onBack={() => setView("tab")}
      />
    );
  } else if (tab === "scan") {
    body = (
      <Scan
        error={error}
        onPhoto={(f) => void analyze(f)}
        onClose={() => go("home")}
        onClear={() => setError(null)}
      />
    );
  } else if (tab === "chat") {
    body = (
      <Chat
        messages={chat}
        busy={chatBusy}
        error={chatError}
        onSend={(text) => void converse(text, chat, setChat)}
        onClear={() => {
          setChat([]);
          setChatError(null);
        }}
      />
    );
  } else if (tab === "history") {
    body = (
      <History
        scans={scans}
        stats={stats}
        onOpen={openDetail}
        onDelete={(id) => void removeScan(id)}
        onClear={() => void clearScans()}
      />
    );
  } else if (tab === "account") {
    body = (
      <Account
        user={user}
        onSave={saveProfile}
        onLogout={() => void logout()}
        onDelete={deleteAccount}
      />
    );
  } else {
    body = (
      <Home
        scans={scans}
        onPhoto={(f) => void analyze(f)}
        onOpenScan={openDetail}
        onViewAll={() => go("history")}
      />
    );
  }

  return (
    <div className={frame}>
      {header}
      <main>{body}</main>
      <BottomNav tab={tab} historyCount={scans.length} onTab={go} />
      {analysing ? (
        <div
          role="status"
          className="fixed inset-0 z-40 flex items-center justify-center bg-black/50"
        >
          <div className="card flex items-center gap-4 px-6 py-5">
            <span className="h-7 w-7 animate-spin rounded-full border-4 border-line border-t-brand dark:border-t-mint" />
            <span className="text-base font-semibold text-fg">
              {t("scan.analysing")}
            </span>
          </div>
        </div>
      ) : null}
      {about}
    </div>
  );
}
