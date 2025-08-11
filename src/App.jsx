import React, { useEffect, useMemo, useRef, useState } from "react";

// ---- PWA helpers: manifest + service worker (inline) ----
function createManifestAndMeta() {
  if (!document.querySelector('link[rel="manifest"]')) {
    const svg = `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 512 512'>
      <rect rx='96' ry='96' width='512' height='512' fill='#0ea5e9'/>
      <text x='50%' y='55%' text-anchor='middle' font-size='280' font-family='system-ui' fill='white'>K</text>
    </svg>`;
    const manifest = {
      name: "컴활 1급 필기 공부앱",
      short_name: "컴활1급",
      start_url: ".",
      display: "standalone",
      background_color: "#0a0a0a",
      theme_color: "#0ea5e9",
      icons: [
        { src: "data:image/svg+xml;utf8," + encodeURIComponent(svg), sizes: "192x192", type: "image/svg+xml", purpose: "any maskable" },
        { src: "data:image/svg+xml;utf8," + encodeURIComponent(svg), sizes: "512x512", type: "image/svg+xml", purpose: "any maskable" }
      ]
    };
    const blob = new Blob([JSON.stringify(manifest)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('link');
    link.rel = 'manifest';
    link.href = url;
    document.head.appendChild(link);

    const theme = document.querySelector('meta[name="theme-color"]') || document.createElement('meta');
    theme.setAttribute('name', 'theme-color');
    theme.setAttribute('content', '#0ea5e9');
    document.head.appendChild(theme);
  }
}

function registerInlineSW() {
  if (!('serviceWorker' in navigator)) return;
  const sw = `self.addEventListener('install', e => { self.skipWaiting(); });
self.addEventListener('activate', e => { e.waitUntil(self.clients.claim()); });
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  e.respondWith(
    caches.match(e.request).then(cached => cached || fetch(e.request).then(res => {
      const clone = res.clone();
      caches.open('khla-cache-v1').then(c => c.put(e.request, clone));
      return res;
    }).catch(() => caches.match('/'))) // 단순 폴백
  );
});`;
  const blob = new Blob([sw], { type: 'text/javascript' });
  const url = URL.createObjectURL(blob);
  navigator.serviceWorker.register(url, { scope: './' }).catch(() => {});
}

function enablePWA(setInstallReady: (b: boolean) => void, promptRef: React.MutableRefObject<any>) {
  createManifestAndMeta();
  registerInlineSW();
  const handler = (e: any) => {
    e.preventDefault();
    promptRef.current = e;
    setInstallReady(true);
  };
  window.addEventListener('beforeinstallprompt', handler);
  const onInstalled = () => { setInstallReady(false); promptRef.current = null; };
  window.addEventListener('appinstalled', onInstalled);
  return () => {
    window.removeEventListener('beforeinstallprompt', handler);
    window.removeEventListener('appinstalled', onInstalled);
  };
}

// ----------------- 공용 유틸 -----------------
function uid() { return (typeof crypto !== 'undefined' && (crypto as any).randomUUID) ? (crypto as any).randomUUID() : Math.random().toString(36).slice(2) + Date.now().toString(36); }
function now() { return Date.now(); }
function shuffle<T>(arr: T[]): T[] { const a = [...arr]; for (let i=a.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[a[i],a[j]]=[a[j],a[i]];} return a; }
function sample<T>(arr: T[], n: number) { return shuffle(arr).slice(0, Math.min(n, arr.length)); }

// 오답 리스트 계산(순수 함수) — 테스트 가능
function getWrongList(queue: any[], answers: Record<string, string|undefined>) {
  return queue.filter((q) => answers[q.id] !== q.answerId);
}

function mkQ(
  subject: "컴퓨터 일반" | "스프레드시트" | "데이터베이스",
  topic: string,
  prompt: string,
  choiceTexts: string[],
  answerIdx: number,
  explanation?: string,
  difficulty: 1|2|3|4|5 = 2
) {
  const choices = choiceTexts.map((t) => ({ id: uid(), text: t }));
  return {
    id: uid(), subject, topic, prompt, choices, answerId: choices[answerIdx].id,
    explanation, difficulty, attempts: 0, correct: 0, lastSeen: undefined, bookmarked: false,
  };
}

// ----------------- 간단한 런타임 자가 테스트 -----------------
type TestResult = { name: string; passed: boolean; message?: string };
function runSelfTests(): TestResult[] {
  const results: TestResult[] = [];
  // 1) mkQ 기초 동작
  const q1 = mkQ("컴퓨터 일반", "테스트", "Q?", ["A","B"], 0, "exp");
  results.push({ name: 'mkQ 기본', passed: q1.choices.length === 2 && q1.answerId === q1.choices[0].id });
  // 2) CSV 파서 따옴표/쉼표 처리
  const parsed = parseCSVLine('컴퓨터 일반,주제,"쉼표, 포함",보기1,보기2,,,0,설명');
  results.push({ name: 'CSV 파서', passed: parsed[2] === '쉼표, 포함' });
  // 3) normalizeQuestion 구조 보정
  const norm = normalizeQuestion({ prompt: 'P', choices: [{ text: 'x' }, { text: 'y' }] });
  results.push({ name: 'normalizeQuestion', passed: !!norm.id && norm.choices.length === 2 && !!norm.answerId });
  // 4) 오답 필터
  const qa = mkQ("컴퓨터 일반", "T1", "?", ["x","y"], 0);
  const qb = mkQ("컴퓨터 일반", "T2", "?", ["x","y"], 1);
  const answers: Record<string, string> = {};
  answers[qa.id] = qa.answerId; // 맞춤
  answers[qb.id] = qb.choices.find(c=>c.id!==qb.answerId)!.id; // 틀림
  const wrong = getWrongList([qa, qb], answers);
  results.push({ name: '오답 필터', passed: wrong.length === 1 && wrong[0].id === qb.id });
  return results;
}

// 컴퓨터활용능력 1급 필기 공부용 웹앱 (프로토타입)
export default function App() {
  type Choice = { id: string; text: string };
  type Question = {
    id: string;
    subject: "컴퓨터 일반" | "스프레드시트" | "데이터베이스";
    topic?: string;
    prompt: string;
    choices: Choice[]; // 반드시 2~6개
    answerId: string; // 정답 choice.id
    explanation?: string;
    difficulty?: 1 | 2 | 3 | 4 | 5;
    tags?: string[];
    source?: string;
    // 학습 통계
    attempts: number;
    correct: number;
    lastSeen?: number;
    bookmarked?: boolean;
  };

  type ExamConfig = { mockCount: number; mockMinutes: number; passScore: number };

  const DEFAULT_CONFIG: ExamConfig = { mockCount: 60, mockMinutes: 60, passScore: 60 };

  // PWA install state
  const [installReady, setInstallReady] = useState(false);
  const promptRef = useRef<any>(null);
  useEffect(() => { return enablePWA(setInstallReady, promptRef); }, []);
  const doInstall = async () => {
    const p = promptRef.current; if (!p) return;
    p.prompt();
    try { await p.userChoice; } catch {}
    promptRef.current = null;
    setInstallReady(false);
  };

  const [tab, setTab] = useState<"quiz" | "mock" | "review" | "bank" | "settings">("quiz");
  const [config, setConfig] = useState<ExamConfig>(() => {
    const raw = localStorage.getItem("khla-config");
    if (raw) { try { return JSON.parse(raw) as ExamConfig; } catch {} }
    return DEFAULT_CONFIG;
  });

  const [questions, setQuestions] = useState<Question[]>(() => {
    const raw = localStorage.getItem("khla-questions");
    if (raw) { try { return JSON.parse(raw) as Question[]; } catch {} }
    // seed 예시(일반 지식) — 실제 기출 X
    const seed = [
      mkQ("컴퓨터 일반","운영체제","다중 작업을 지원하며 CPU 스케줄링과 메모리 관리를 담당하는 시스템 소프트웨어는?",["운영체제(OS)","컴파일러","프린터 드라이버","미들웨어"],0,"운영체제는 하드웨어와 응용 프로그램 사이에서 자원 관리와 스케줄링을 담당합니다.",2),
      mkQ("스프레드시트","셀 참조","다음 중 절대참조 표기법으로 옳은 것은?",["A1","$A$1","A$1","$A1"],1,"열과 행 앞에 $를 붙이면 해당 좌표가 고정됩니다.",1),
      mkQ("데이터베이스","키","관계형 DB에서 기본키(Primary Key)의 성질로 옳지 않은 것은?",["튜플을 유일하게 식별한다","NULL을 허용한다","중복을 허용하지 않는다","후보키 중 하나를 선택한 것"],1,"기본키는 중복/NULL을 허용하지 않습니다.",2),
      mkQ("스프레드시트","함수","엑셀에서 합계를 구하는 기본 함수는?",["SUM","COUNT","AVERAGE","MAX"],0,"=SUM(range) 형식으로 사용합니다.",1),
      mkQ("데이터베이스","정규화","정규화의 주요 목적과 가장 거리가 먼 것은?",["데이터 중복 감소","이상(Anomaly) 최소화","질의 속도 저하 유도","데이터 일관성 향상"],2,"정규화는 중복을 줄이고 이상 현상을 완화하여 일관성을 높입니다.",3),
      mkQ("컴퓨터 일반","네트워크","OSI 7계층에서 전송 계층(Transport Layer)의 대표 프로토콜은?",["TCP/UDP","IP/ICMP","HTTP/HTTPS","ARP"],0,"전송 계층은 종단 간 신뢰성과 흐름 제어를 담당합니다.",2)
    ];
    return seed;
  });

  useEffect(() => { localStorage.setItem("khla-questions", JSON.stringify(questions)); }, [questions]);
  useEffect(() => { localStorage.setItem("khla-config", JSON.stringify(config)); }, [config]);

  const countsBySubject = useMemo(() => {
    const map: Record<string, number> = {};
    for (const q of questions) map[q.subject] = (map[q.subject] || 0) + 1;
    return map;
  }, [questions]);

  const [testResults, setTestResults] = useState<TestResult[] | null>(null);
  useEffect(() => { setTestResults(runSelfTests()); }, []);

  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-100 p-6">
      <div className="max-w-6xl mx-auto">
        <Header counts={countsBySubject} config={config} />

        <InstallBanner installReady={installReady} onInstall={doInstall} />

        <nav className="mt-4 flex flex-wrap gap-2">
          <TabBtn active={tab === "quiz"} onClick={() => setTab("quiz")}>퀴즈</TabBtn>
          <TabBtn active={tab === "mock"} onClick={() => setTab("mock")}>모의고사</TabBtn>
          <TabBtn active={tab === "review"} onClick={() => setTab("review")}>오답노트</TabBtn>
          <TabBtn active={tab === "bank"} onClick={() => setTab("bank")}>문제은행</TabBtn>
          <TabBtn active={tab === "settings"} onClick={() => setTab("settings")}>설정</TabBtn>
        </nav>

        <main className="mt-6">
          {tab === "quiz" && <QuizPane questions={questions} setQuestions={setQuestions} />}
          {tab === "mock" && <MockPane questions={questions} setQuestions={setQuestions} config={config} />}
          {tab === "review" && <ReviewPane questions={questions} setQuestions={setQuestions} />}
          {tab === "bank" && <BankPane questions={questions} setQuestions={setQuestions} />}
          {tab === "settings" && <SettingsPane config={config} setConfig={setConfig} testResults={testResults} />}
        </main>

        <footer className="mt-10 text-xs text-neutral-400">
          <p>※ 데이터는 이 브라우저의 로컬 저장소에만 저장됩니다. 다른 기기와 자동 동기화되지 않습니다.</p>
        </footer>
      </div>
    </div>
  );
}

function Header({ counts, config }: { counts: Record<string, number>; config: any }) {
  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  return (
    <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-4">
      <div>
        <h1 className="text-2xl md:text-3xl font-semibold">컴활 1급 필기 공부앱 · 프로토타입</h1>
        <p className="text-neutral-400 mt-1">퀴즈/모의고사/오답노트/문제은행을 한 곳에서</p>
      </div>
      <div className="grid grid-cols-3 gap-2">
        <Stat label="문제 수" value={String(total)} />
        <Stat label="모의고사 문항" value={`${config.mockCount}문항`} />
        <Stat label="합격 기준" value={`${config.passScore}점`} />
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-neutral-900 rounded-2xl p-3 shadow border border-neutral-800">
      <div className="text-xs text-neutral-400">{label}</div>
      <div className="text-lg font-semibold">{value}</div>
    </div>
  );
}

function TabBtn({ active, onClick, children }: any) {
  return (
    <button
      onClick={onClick}
      className={`px-4 py-2 rounded-2xl border transition shadow-sm ${
        active
          ? "bg-blue-600/90 border-blue-500 text-white"
          : "bg-neutral-900 border-neutral-800 text-neutral-200 hover:bg-neutral-800"
      }`}
    >
      {children}
    </button>
  );
}

// ----------------- 퀴즈 Pane -----------------
function QuizPane({ questions, setQuestions }: any) {
  const subjects = ["컴퓨터 일반", "스프레드시트", "데이터베이스"] as const;
  const [selected, setSelected] = useState<string[]>([...subjects]);
  const [count, setCount] = useState(10);
  const [inProgress, setInProgress] = useState(false);
  const [queue, setQueue] = useState<any[]>([]);
  const [idx, setIdx] = useState(0);
  const [chosen, setChosen] = useState<string | null>(null);
  const [result, setResult] = useState<null | boolean>(null);

  const filtered = useMemo(() => questions.filter((q: any) => selected.includes(q.subject)), [questions, selected]);

  function start() {
    if (filtered.length === 0) return alert("선택한 과목의 문제가 없습니다.");
    const q = sample(filtered, count);
    setQueue(q);
    setIdx(0);
    setChosen(null);
    setResult(null);
    setInProgress(true);
  }

  function markAnswer(q: any, choiceId: string) {
    if (result !== null) return; // 이미 답함
    setChosen(choiceId);
    const isCorrect = q.answerId === choiceId;
    setResult(isCorrect);
    setQuestions((prev: any[]) => prev.map((x) => x.id === q.id ? {
      ...x,
      attempts: x.attempts + 1,
      correct: x.correct + (isCorrect ? 1 : 0),
      lastSeen: now(),
    } : x));
  }

  function next() {
    if (idx + 1 < queue.length) {
      setIdx(idx + 1); setChosen(null); setResult(null);
    } else {
      setInProgress(false);
    }
  }

  useKeyboardShortcuts({ onKey: (n) => {
    if (!inProgress) return;
    const q = queue[idx];
    const choice = q?.choices?.[n-1];
    if (choice) markAnswer(q, choice.id);
  }, onNext: () => inProgress && next() });

  return (
    <div className="space-y-4">
      <div className="bg-neutral-900 rounded-2xl p-4 border border-neutral-800">
        <div className="flex flex-wrap items-center gap-3">
          {subjects.map((s) => (
            <label key={s} className={`px-3 py-1 rounded-xl border cursor-pointer ${selected.includes(s) ? "bg-blue-600/20 border-blue-500" : "border-neutral-700"}`}>
              <input type="checkbox" className="mr-2" checked={selected.includes(s)} onChange={() => setSelected((prev) => prev.includes(s) ? prev.filter((x) => x!==s) : [...prev, s])} />
              {s}
            </label>
          ))}
          <div className="flex items-center gap-2 ml-auto">
            <span className="text-sm text-neutral-400">문항 수</span>
            <input type="number" min={5} max={100} value={count} onChange={(e)=>setCount(parseInt(e.target.value||"10"))} className="w-20 bg-neutral-950 border border-neutral-800 rounded-xl px-2 py-1" />
            <button onClick={start} className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 transition">시작</button>
          </div>
        </div>
      </div>

      {inProgress && (
        <div className="bg-neutral-900 rounded-2xl p-5 border border-neutral-800">
          <div className="text-sm text-neutral-400">문제 {idx+1} / {queue.length}</div>
          <div className="mt-2 text-xl font-semibold leading-relaxed">{queue[idx].prompt}</div>
          {queue[idx].topic && <div className="mt-1 text-xs text-neutral-500">[{queue[idx].subject} · {queue[idx].topic}]</div>}

          <div className="mt-5 grid gap-2">
            {queue[idx].choices.map((c: any, i: number) => {
              const picked = chosen === c.id;
              const show = result !== null;
              const isAns = queue[idx].answerId === c.id;
              const base = "text-left px-4 py-3 rounded-xl border transition";
              const cls = show ? (isAns ? "border-green-700 bg-green-900/30" : picked ? "border-red-800 bg-red-900/30" : "border-neutral-700") : "border-neutral-700 hover:bg-neutral-800";
              return (
                <button key={c.id} onClick={() => markAnswer(queue[idx], c.id)} disabled={show} className={`${base} ${cls}`}>
                  <span className="text-xs text-neutral-400 mr-2">[{i+1}]</span>
                  {c.text}
                </button>
              );
            })}
          </div>

          {result !== null && (
            <div className="mt-4 p-3 rounded-xl bg-neutral-950 border border-neutral-800 text-sm">
              <div className={result ? "text-green-400" : "text-red-400"}>{result ? "정답!" : "오답"}</div>
              {queue[idx].explanation && <div className="mt-1 text-neutral-300">{queue[idx].explanation}</div>}
            </div>
          )}

          <div className="mt-4 flex items-center gap-2">
            <button onClick={() => toggleBookmark(queue[idx].id, setQuestions)} className="px-3 py-1 text-xs rounded-lg border border-neutral-700 hover:bg-neutral-800">{isBookmarked(queue[idx].id, questions) ? "★ 북마크됨" : "☆ 북마크"}</button>
            <div className="flex-1" />
            <button onClick={next} className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 transition">다음</button>
          </div>
        </div>
      )}

      {!inProgress && (
        <div className="text-neutral-400 text-sm">과목과 문항 수를 선택하고 <b className="text-neutral-200">시작</b>을 눌러주세요. 퀵 퀴즈는 즉시 채점됩니다. (숫자키 1–5로 보기도 선택 가능)</div>
      )}
    </div>
  );
}

function useKeyboardShortcuts({ onKey, onNext }: { onKey: (n: number)=>void; onNext: ()=>void }) {
  useEffect(() => {
    function handle(e: KeyboardEvent) {
      if (e.key >= '1' && e.key <= '6') { onKey(parseInt(e.key, 10)); }
      if (e.key === 'Enter' || e.key.toLowerCase() === 'n') { onNext(); }
    }
    window.addEventListener('keydown', handle);
    return () => window.removeEventListener('keydown', handle);
  }, [onKey, onNext]);
}

function isBookmarked(id: string, questions: any[]) { return !!questions.find((q)=>q.id===id)?.bookmarked; }
function toggleBookmark(id: string, setQuestions: any) {
  setQuestions((prev: any[]) => prev.map((q) => q.id === id ? { ...q, bookmarked: !q.bookmarked } : q));
}

// ----------------- 모의고사 Pane -----------------
function MockPane({ questions, setQuestions, config }: any) {
  const [inProgress, setInProgress] = useState(false);
  const [queue, setQueue] = useState<any[]>([]);
  const [idx, setIdx] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string|undefined>>({});
  const [deadline, setDeadline] = useState<number | null>(null);
  const [finished, setFinished] = useState(false);
  const mockStartedCountRef = useRef(0);

  function start() {
    if (questions.length < 2) return alert("문제 수가 부족합니다.");
    const q = sample(questions, config.mockCount);
    mockStartedCountRef.current = q.length;
    setQueue(q); setIdx(0); setAnswers({}); setFinished(false);
    setInProgress(true);
    setDeadline(Date.now() + config.mockMinutes * 60 * 1000);
  }

  function select(choiceId: string) {
    const q = queue[idx];
    setAnswers((prev) => ({ ...prev, [q.id]: choiceId }));
  }

  function next() { if (idx + 1 < queue.length) setIdx(idx + 1); }
  function prev() { if (idx > 0) setIdx(idx - 1); }

  const remain = useTimer(deadline, () => finish());

  function finish() {
    if (!inProgress) return;
    // 채점 및 통계 반영
    const updates: any = {};
    queue.forEach((q) => {
      const isCorrect = answers[q.id] === q.answerId;
      updates[q.id] = { attempts: 1, correct: isCorrect ? 1 : 0 };
    });
    setQuestions((prev: any[]) => prev.map((q) => updates[q.id] ? { ...q, attempts: q.attempts + 1, correct: q.correct + updates[q.id].correct, lastSeen: now() } : q));
    setFinished(true);
    setInProgress(false);
  }

  // 오답만 재풀기
  const wrongList = useMemo(() => getWrongList(queue, answers), [queue, answers]);
  function retryWrong() {
    if (!finished) return;
    if (wrongList.length === 0) return alert('오답이 없습니다.');
    const perQ = mockStartedCountRef.current > 0 ? config.mockMinutes / mockStartedCountRef.current : 1;
    const minutes = Math.max(1, Math.ceil(perQ * wrongList.length));
    setQueue(wrongList);
    setIdx(0);
    setAnswers({});
    setFinished(false);
    setInProgress(true);
    setDeadline(Date.now() + minutes * 60 * 1000);
  }

  const score = useMemo(() => {
    const total = queue.length;
    if (total === 0) return 0;
    let c = 0; for (const q of queue) if (answers[q.id] === q.answerId) c++;
    return Math.round((c / total) * 100);
  }, [answers, queue]);

  return (
    <div className="space-y-4">
      <div className="bg-neutral-900 rounded-2xl p-4 border border-neutral-800 flex items-center gap-3">
        <div className="text-sm text-neutral-400">모의고사: {config.mockCount}문항 / {config.mockMinutes}분</div>
        <div className="flex-1" />
        {!inProgress && !finished && <button onClick={start} className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 transition">시작</button>}
        {inProgress && <CountdownDisplay remainMs={remain} />}
        {inProgress && <button onClick={finish} className="ml-2 px-4 py-2 rounded-xl border border-neutral-700 hover:bg-neutral-800">종료</button>}
      </div>

      {inProgress && (
        <div className="bg-neutral-900 rounded-2xl p-5 border border-neutral-800">
          <div className="text-sm text-neutral-400">문제 {idx+1} / {queue.length}</div>
          <div className="mt-2 text-xl font-semibold leading-relaxed">{queue[idx].prompt}</div>
          {queue[idx].topic && <div className="mt-1 text-xs text-neutral-500">[{queue[idx].subject} · {queue[idx].topic}]</div>}
          <div className="mt-5 grid gap-2">
            {queue[idx].choices.map((c: any, i: number) => {
              const picked = answers[queue[idx].id] === c.id;
              return (
                <button key={c.id} onClick={() => select(c.id)} className={`text-left px-4 py-3 rounded-xl border transition ${picked ? "border-blue-600 bg-blue-900/20" : "border-neutral-700 hover:bg-neutral-800"}`}>
                  <span className="text-xs text-neutral-400 mr-2">[{i+1}]</span>
                  {c.text}
                </button>
              );
            })}
          </div>
          <div className="mt-4 flex items-center gap-2">
            <button onClick={() => toggleBookmark(queue[idx].id, setQuestions)} className="px-3 py-1 text-xs rounded-lg border border-neutral-700 hover:bg-neutral-800">{isBookmarked(queue[idx].id, questions) ? "★ 북마크됨" : "☆ 북마크"}</button>
            <div className="flex-1" />
            <button onClick={prev} className="px-3 py-2 rounded-lg border border-neutral-700 hover:bg-neutral-800">이전</button>
            <button onClick={next} className="px-3 py-2 rounded-lg border border-neutral-700 hover:bg-neutral-800">다음</button>
          </div>
        </div>
      )}

      {finished && (
        <div className="bg-neutral-900 rounded-2xl p-5 border border-neutral-800">
          <div className="text-xl font-semibold">결과: {score}점 {score >= config.passScore ? "(합격 기준 충족)" : "(미달)"}</div>
          <div className="mt-3 grid md:grid-cols-2 gap-3">
            {queue.map((q: any, i: number) => {
              const ok = answers[q.id] === q.answerId;
              const my = answers[q.id];
              const myText = q.choices.find((c: any) => c.id === my)?.text ?? "무응답";
              const ansText = q.choices.find((c: any) => c.id === q.answerId)?.text ?? "?";
              return (
                <div key={q.id} className={`rounded-xl p-3 border ${ok ? "border-green-700 bg-green-900/10" : "border-red-800 bg-red-900/10"}`}>
                  <div className="text-xs text-neutral-400">문항 {i+1} · {q.subject} · {q.topic}</div>
                  <div className="mt-1">{q.prompt}</div>
                  <div className="mt-2 text-sm"><span className="text-neutral-400">내 답</span>: {myText}</div>
                  <div className="text-sm"><span className="text-neutral-400">정답</span>: {ansText}</div>
                  {q.explanation && <div className="mt-1 text-xs text-neutral-400">해설: {q.explanation}</div>}
                </div>
              );
            })}
          </div>
          <div className="mt-4 flex items-center gap-2">
            {wrongList.length > 0 && (
              <button onClick={retryWrong} className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500">오답만 재풀기 ({wrongList.length})</button>
            )}
          </div>
        </div>
      )}

      {!inProgress && !finished && (
        <div className="text-neutral-400 text-sm">모의고사는 타이머가 동작하며 종료 시 일괄 채점됩니다. (기본 60문항·60분·합격 60점은 설정 탭에서 변경 가능)</div>
      )}
    </div>
  );
}

function useTimer(deadline: number | null, onExpire: () => void) {
  const [remain, setRemain] = useState(0);
  useEffect(() => {
    if (!deadline) return;
    const id = setInterval(() => {
      const r = Math.max(0, deadline - Date.now());
      setRemain(r);
      if (r <= 0) { clearInterval(id); onExpire(); }
    }, 250);
    return () => clearInterval(id);
  }, [deadline]);
  return remain;
}

function CountdownDisplay({ remainMs }: { remainMs: number }) {
  const mm = Math.floor(remainMs / 60000);
  const ss = Math.floor((remainMs % 60000) / 1000);
  return <div className="px-3 py-1 rounded-lg bg-neutral-800 text-sm">남은 시간 {String(mm).padStart(2,'0')}:{String(ss).padStart(2,'0')}</div>;
}

// ----------------- 오답노트 Pane -----------------
function ReviewPane({ questions, setQuestions }: any) {
  const items = useMemo(() => {
    return questions
      .filter((q: any) => (q.attempts > 0 && (q.correct / q.attempts) < 0.7) || q.bookmarked)
      .sort((a: any, b: any) => (b.lastSeen ?? 0) - (a.lastSeen ?? 0));
  }, [questions]);

  function resetStats(id: string) { setQuestions((prev: any[]) => prev.map((q) => q.id===id ? { ...q, attempts: 0, correct: 0 } : q)); }

  return (
    <div className="bg-neutral-900 rounded-2xl p-5 border border-neutral-800">
      <div className="text-sm text-neutral-400">오답/북마크 {items.length}문항</div>
      <div className="mt-3 grid md:grid-cols-2 gap-3">
        {items.map((q: any) => (
          <div key={q.id} className="rounded-xl p-3 border border-neutral-700">
            <div className="text-xs text-neutral-400">{q.subject} · {q.topic}</div>
            <div className="mt-1 font-medium">{q.prompt}</div>
            <ul className="mt-2 list-disc ml-5 text-sm text-neutral-300">
              {q.choices.map((c: any) => (
                <li key={c.id} className={c.id===q.answerId?"text-green-400":""}>{c.text}</li>
              ))}
            </ul>
            {q.explanation && <div className="mt-2 text-xs text-neutral-400">해설: {q.explanation}</div>}
            <div className="mt-2 text-xs text-neutral-500">정답 {q.correct} / 시도 {q.attempts}</div>
            <div className="mt-2 flex items-center gap-2">
              <button onClick={() => toggleBookmark(q.id, setQuestions)} className="px-3 py-1 text-xs rounded-lg border border-neutral-700 hover:bg-neutral-800">{q.bookmarked?"★ 북마크 해제":"☆ 북마크"}</button>
              <button onClick={() => resetStats(q.id)} className="px-3 py-1 text-xs rounded-lg border border-neutral-700 hover:bg-neutral-800">통계 초기화</button>
            </div>
          </div>
        ))}
      </div>
      {items.length === 0 && <div className="text-neutral-400 mt-2 text-sm">오답 또는 북마크 문제가 없습니다.</div>}
    </div>
  );
}

// ----------------- 문제은행 Pane -----------------
function BankPane({ questions, setQuestions }: any) {
  const [filter, setFilter] = useState("");
  const [editing, setEditing] = useState<any | null>(null);

  const filtered = useMemo(() => {
    const key = filter.trim();
    if (!key) return questions;
    return questions.filter((q: any) => [q.prompt, q.topic, q.subject, ...(q.tags||[])].join(" ").toLowerCase().includes(key.toLowerCase()));
  }, [filter, questions]);

  function addBlank() {
    const c1 = { id: uid(), text: "보기1" };
    const c2 = { id: uid(), text: "보기2" };
    const q = { id: uid(), subject: "컴퓨터 일반", topic: "", prompt: "새 문제", choices: [c1, c2], answerId: c1.id, explanation: "", difficulty: 2, attempts: 0, correct: 0, bookmarked: false };
    setQuestions((prev: any[]) => [q, ...prev]);
    setEditing(q.id);
  }

  function remove(id: string) { if (confirm("삭제할까요?")) setQuestions((prev: any[]) => prev.filter((q)=>q.id!==id)); }

  function exportJSON() {
    const blob = new Blob([JSON.stringify(questions, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = "khla-questions.json"; a.click(); URL.revokeObjectURL(url);
  }

  function importJSON(evt: any) {
    const file = evt.target.files?.[0]; if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const arr = JSON.parse(String(reader.result));
        if (!Array.isArray(arr)) throw new Error("형식 오류");
        const normalized = arr.map((raw:any) => normalizeQuestion(raw));
        setQuestions(normalized);
      } catch (e) { alert("JSON 형식이 올바르지 않습니다."); }
    };
    reader.readAsText(file, "utf-8");
  }

  function importCSV(evt: any) {
    const file = evt.target.files?.[0]; if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const text = String(reader.result);
        const rows = text.split(/\r?\n/).filter(Boolean);
        rows.shift(); // header skip
        // 기대 헤더: subject,topic,prompt,choice1,choice2,choice3,choice4,answerIndex,explanation
        const out:any[] = [];
        for (const line of rows) {
          const cols = parseCSVLine(line);
          const [subject, topic, prompt, c1, c2, c3, c4, ansIdxStr, exp] = cols;
          const list = [c1,c2,c3,c4].filter(Boolean);
          if (!subject || !prompt || list.length < 2) continue;
          const ansIdx = Math.max(0, Math.min(list.length-1, parseInt(ansIdxStr || "0", 10)));
          out.push(mkQ(subject as any, topic || "", prompt, list, ansIdx, exp || ""));
        }
        setQuestions(out);
      } catch (e) { alert("CSV 형식이 올바르지 않습니다."); }
    };
    reader.readAsText(file, "utf-8");
  }

  return (
    <div className="space-y-4">
      <div className="bg-neutral-900 rounded-2xl p-4 border border-neutral-800 flex items-center gap-2">
        <input value={filter} onChange={(e)=>setFilter(e.target.value)} placeholder="검색: 지문/주제/태그" className="flex-1 bg-neutral-950 border border-neutral-800 rounded-xl px-3 py-2" />
        <button onClick={addBlank} className="px-3 py-2 rounded-xl bg-blue-600 hover:bg-blue-500">새 문제</button>
        <button onClick={exportJSON} className="px-3 py-2 rounded-xl border border-neutral-700 hover:bg-neutral-800">내보내기(JSON)</button>
        <label className="px-3 py-2 rounded-xl border border-neutral-700 hover:bg-neutral-800 cursor-pointer">가져오기(JSON)
          <input type="file" accept=".json,application/json" onChange={importJSON} hidden />
        </label>
        <label className="px-3 py-2 rounded-xl border border-neutral-700 hover:bg-neutral-800 cursor-pointer">가져오기(CSV)
          <input type="file" accept=".csv,text/csv" onChange={importCSV} hidden />
        </label>
      </div>

      <div className="grid md:grid-cols-2 gap-3">
        {filtered.map((q: any) => (
          <QuestionCard key={q.id} q={q} editing={editing===q.id} onEdit={()=>setEditing(q.id)} onClose={()=>setEditing(null)} onChange={(patched:any)=>setQuestions((prev:any[])=>prev.map((x)=>x.id===q.id?patched:x))} onRemove={()=>remove(q.id)} />
        ))}
      </div>
    </div>
  );
}

function normalizeQuestion(raw:any) {
  const id = raw.id || uid();
  const subject = raw.subject || "컴퓨터 일반";
  const topic = raw.topic || "";
  const prompt = raw.prompt || "";
  let choices = raw.choices || [];
  if (!Array.isArray(choices)) {
    const list = [raw.choice1, raw.choice2, raw.choice3, raw.choice4].filter(Boolean);
    choices = list.map((t:string)=>({ id: uid(), text: t }));
  } else {
    choices = choices.map((c:any)=>({ id: c.id || uid(), text: c.text }));
  }
  const answerId = raw.answerId || choices[0]?.id;
  return {
    id, subject, topic, prompt, choices, answerId,
    explanation: raw.explanation || "",
    difficulty: raw.difficulty || 2,
    tags: raw.tags || [],
    source: raw.source || "",
    attempts: raw.attempts || 0,
    correct: raw.correct || 0,
    lastSeen: raw.lastSeen || undefined,
    bookmarked: raw.bookmarked || false,
  };
}

function parseCSVLine(line: string) {
  // 간단 CSV 파서(따옴표 포함 최소 처리)
  const out:string[] = [];
  let cur = ""; let inQ = false;
  for (let i=0;i<line.length;i++) {
    const ch = line[i];
    if (ch === '"') { inQ = !inQ; continue; }
    if (ch === ',' && !inQ) { out.push(cur.trim()); cur = ""; continue; }
    cur += ch;
  }
  out.push(cur.trim());
  return out;
}

function QuestionCard({ q, editing, onEdit, onClose, onChange, onRemove }: any) {
  const [draft, setDraft] = useState<any>(q);
  useEffect(()=>setDraft(q), [q]);

  function save() { onChange(draft); onClose(); }
  function addChoice() { setDraft((d:any)=>({ ...d, choices: [...d.choices, { id: uid(), text: "새 보기" }] })); }
  function rmChoice(id:string) { setDraft((d:any)=>({ ...d, choices: d.choices.filter((c:any)=>c.id!==id) })); if (draft.answerId===id && draft.choices[0]) setDraft((d:any)=>({ ...d, answerId: d.choices[0].id })); }

  return (
    <div className="bg-neutral-900 rounded-2xl p-4 border border-neutral-800">
      {!editing && (
        <div className="flex items-start gap-2">
          <div className="flex-1">
            <div className="text-xs text-neutral-400">{q.subject} · {q.topic}</div>
            <div className="mt-1 font-medium">{q.prompt}</div>
            <ul className="mt-2 list-disc ml-5 text-sm text-neutral-300">
              {q.choices.map((c:any)=>(<li key={c.id} className={c.id===q.answerId?"text-green-400":""}>{c.text}</li>))}
            </ul>
            {q.explanation && <div className="mt-2 text-xs text-neutral-400">해설: {q.explanation}</div>}
            <div className="mt-2 text-xs text-neutral-500">정답 {q.correct} / 시도 {q.attempts}</div>
          </div>
          <div className="flex flex-col gap-2">
            <button onClick={onEdit} className="px-3 py-1 text-xs rounded-lg border border-neutral-700 hover:bg-neutral-800">편집</button>
            <button onClick={onRemove} className="px-3 py-1 text-xs rounded-lg border border-neutral-700 hover:bg-neutral-800">삭제</button>
          </div>
        </div>
      )}

      {editing && (
        <div className="space-y-2">
          <div className="grid md:grid-cols-3 gap-2">
            <select value={draft.subject} onChange={(e)=>setDraft((d:any)=>({ ...d, subject: e.target.value }))} className="bg-neutral-950 border border-neutral-800 rounded-xl px-3 py-2">
              <option>컴퓨터 일반</option>
              <option>스프레드시트</option>
              <option>데이터베이스</option>
            </select>
            <input value={draft.topic||""} onChange={(e)=>setDraft((d:any)=>({ ...d, topic: e.target.value }))} placeholder="주제(선택)" className="bg-neutral-950 border border-neutral-800 rounded-xl px-3 py-2" />
            <input value={draft.source||""} onChange={(e)=>setDraft((d:any)=>({ ...d, source: e.target.value }))} placeholder="출처(선택)" className="bg-neutral-950 border border-neutral-800 rounded-xl px-3 py-2" />
          </div>
          <textarea value={draft.prompt} onChange={(e)=>setDraft((d:any)=>({ ...d, prompt: e.target.value }))} className="w-full bg-neutral-950 border border-neutral-800 rounded-xl px-3 py-2" rows={3} />

          <div className="space-y-2">
            {draft.choices.map((c:any) => (
              <div key={c.id} className="flex items-center gap-2">
                <input type="radio" name={`ans-${q.id}`} checked={draft.answerId===c.id} onChange={()=>setDraft((d:any)=>({ ...d, answerId: c.id }))} />
                <input value={c.text} onChange={(e)=>setDraft((d:any)=>({ ...d, choices: d.choices.map((x:any)=>x.id===c.id?{...x, text:e.target.value}:x) }))} className="flex-1 bg-neutral-950 border border-neutral-800 rounded-xl px-3 py-2" />
                <button onClick={()=>rmChoice(c.id)} className="px-3 py-1 text-xs rounded-lg border border-neutral-700 hover:bg-neutral-800">삭제</button>
              </div>
            ))}
            <div>
              <button onClick={addChoice} className="px-3 py-1 text-xs rounded-lg border border-neutral-700 hover:bg-neutral-800">보기 추가</button>
            </div>
          </div>

          <textarea value={draft.explanation||""} onChange={(e)=>setDraft((d:any)=>({ ...d, explanation: e.target.value }))} placeholder="해설(선택)" className="w-full bg-neutral-950 border border-neutral-800 rounded-xl px-3 py-2" rows={2} />

          <div className="flex items-center gap-2 justify-end">
            <button onClick={save} className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500">저장</button>
            <button onClick={onClose} className="px-4 py-2 rounded-xl border border-neutral-700 hover:bg-neutral-800">취소</button>
          </div>
        </div>
      )}
    </div>
  );
}

// ----------------- 설정 Pane -----------------
function SettingsPane({ config, setConfig, testResults }: { config: any; setConfig: (fn:any)=>void; testResults: TestResult[] | null }) {
  function up(k: string, v: number) { setConfig((c:any)=>({ ...c, [k]: v })); }
  function reset() { setConfig({ mockCount: 60, mockMinutes: 60, passScore: 60 }); }

  return (
    <div className="bg-neutral-900 rounded-2xl p-5 border border-neutral-800 space-y-4">
      <div className="grid md:grid-cols-3 gap-3">
        <NumInput label="모의고사 문항 수" value={config.mockCount} onChange={(v)=>up('mockCount', v)} min={10} max={100} />
        <NumInput label="모의고사 시간(분)" value={config.mockMinutes} onChange={(v)=>up('mockMinutes', v)} min={10} max={180} />
        <NumInput label="합격 기준 점수" value={config.passScore} onChange={(v)=>up('passScore', v)} min={40} max={100} />
      </div>
      <div className="flex items-center gap-2">
        <button onClick={reset} className="px-4 py-2 rounded-xl border border-neutral-700 hover:bg-neutral-800">기본값으로</button>
      </div>
      <div className="text-xs text-neutral-400">※ 실제 시험의 세부 규정(문항 수/시간/합격선 등)은 연도·회차별로 달라질 수 있으니 공고를 확인하세요. 이 값은 자유롭게 조정 가능합니다.</div>

      {/* 자가 테스트 결과 표시 */}
      {testResults && (
        <div className="mt-6 bg-neutral-950 rounded-2xl p-4 border border-neutral-800">
          <div className="font-medium">진단/자가 테스트</div>
          <ul className="mt-2 text-sm">
            {testResults.map((t, i) => (
              <li key={i} className={t.passed ? 'text-green-400' : 'text-red-400'}>
                {t.passed ? '✔' : '✖'} {t.name}{t.message ? ` — ${t.message}` : ''}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function NumInput({ label, value, onChange, min, max }: any) {
  return (
    <label className="block">
      <div className="text-sm text-neutral-400 mb-1">{label}</div>
      <input type="number" className="bg-neutral-950 border border-neutral-800 rounded-xl px-3 py-2" value={value} min={min} max={max} onChange={(e)=>onChange(parseInt(e.target.value||"0",10))} />
    </label>
  );
}

// ---- Install banner component ----
function InstallBanner({ installReady, onInstall }: { installReady: boolean; onInstall: () => void }) {
  // iOS 안내: beforeinstallprompt 미지원
  const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent);
  const isStandalone = (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) || (navigator as any).standalone;
  if (isStandalone) return null;

  if (installReady) {
    return (
      <div className="mt-4 bg-neutral-900 rounded-2xl p-3 border border-blue-700/40 text-sm flex items-center gap-3">
        <div>📲 이 웹앱을 <b>홈 화면</b>에 설치할 수 있어요.</div>
        <div className="flex-1" />
        <button onClick={onInstall} className="px-3 py-2 rounded-xl bg-blue-600 hover:bg-blue-500">설치</button>
      </div>
    );
  }

  if (isIOS) {
    return (
      <div className="mt-4 bg-neutral-900 rounded-2xl p-3 border border-neutral-800 text-sm">
        iOS에서는 Safari에서 공유 버튼 → <b>홈 화면에 추가</b>를 눌러 설치할 수 있어요.
      </div>
    );
  }

  return null;
}
