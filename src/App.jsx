import React, { useEffect, useMemo, useRef, useState } from "react";

/* ----------------- 공용 유틸 ----------------- */
function uid() {
  if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}
function now() { return Date.now(); }
function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}
function sample(arr, n) { return shuffle(arr).slice(0, Math.min(n, arr.length)); }

/* 오답 리스트 계산(순수 함수) */
function getWrongList(queue, answers) {
  return queue.filter((q) => answers[q.id] !== q.answerId);
}

/* 문제 생성기 */
function mkQ(subject, topic, prompt, choiceTexts, answerIdx, explanation = "", difficulty = 2) {
  const choices = choiceTexts.map((t) => ({ id: uid(), text: t }));
  return {
    id: uid(),
    subject, topic, prompt, choices,
    answerId: choices[answerIdx].id,
    explanation, difficulty,
    attempts: 0, correct: 0, lastSeen: undefined, bookmarked: false,
  };
}

/* ----------------- 간단 자가 테스트 ----------------- */
function runSelfTests() {
  const results = [];
  const q1 = mkQ("컴퓨터 일반", "테스트", "Q?", ["A", "B"], 0, "exp");
  results.push({ name: "mkQ 기본", passed: q1.choices.length === 2 && q1.answerId === q1.choices[0].id });

  const parsed = parseCSVLine('컴퓨터 일반,주제,"쉼표, 포함",보기1,보기2,,,0,설명');
  results.push({ name: "CSV 파서", passed: parsed[2] === "쉼표, 포함" });

  const norm = normalizeQuestion({ prompt: "P", choices: [{ text: "x" }, { text: "y" }] });
  results.push({ name: "normalizeQuestion", passed: !!norm.id && norm.choices.length === 2 && !!norm.answerId });

  const qa = mkQ("컴퓨터 일반", "T1", "?", ["x","y"], 0);
  const qb = mkQ("컴퓨터 일반", "T2", "?", ["x","y"], 1);
  const answers = {}; answers[qa.id] = qa.answerId; answers[qb.id] = qb.choices.find(c => c.id !== qb.answerId).id;
  const wrong = getWrongList([qa, qb], answers);
  results.push({ name: "오답 필터", passed: wrong.length === 1 && wrong[0].id === qb.id });

  return results;
}

/* ----------------- 메인 앱 ----------------- */
export default function App() {
  const DEFAULT_CONFIG = { mockCount: 60, mockMinutes: 60, passScore: 60 };

  // PWA 설치 배너 (선택)
  const [installReady, setInstallReady] = useState(false);
  const promptRef = useRef(null);
  useEffect(() => {
    const handler = (e) => { e.preventDefault(); promptRef.current = e; setInstallReady(true); };
    const onInstalled = () => { setInstallReady(false); promptRef.current = null; };
    window.addEventListener("beforeinstallprompt", handler);
    window.addEventListener("appinstalled", onInstalled);
    return () => { window.removeEventListener("beforeinstallprompt", handler); window.removeEventListener("appinstalled", onInstalled); };
  }, []);
  const doInstall = async () => {
    const p = promptRef.current; if (!p) return;
    p.prompt(); try { await p.userChoice; } catch {}
    promptRef.current = null; setInstallReady(false);
  };

  const [tab, setTab] = useState("quiz"); // quiz | mock | review | bank | settings
  const [config, setConfig] = useState(() => {
    try { const raw = localStorage.getItem("khla-config"); if (raw) return JSON.parse(raw); } catch {}
    return DEFAULT_CONFIG;
  });

  const [questions, setQuestions] = useState(() => {
    try { const raw = localStorage.getItem("khla-questions"); if (raw) return JSON.parse(raw); } catch {}
    // seed 예시 (실제 기출 아님)
    return [
      mkQ("컴퓨터 일반","운영체제","다중 작업을 지원하며 CPU 스케줄링과 메모리 관리를 담당하는 시스템 소프트웨어는?",["운영체제(OS)","컴파일러","프린터 드라이버","미들웨어"],0,"운영체제는 자원 관리와 스케줄링을 담당합니다.",2),
      mkQ("스프레드시트","셀 참조","다음 중 절대참조 표기법으로 옳은 것은?",["A1","$A$1","A$1","$A1"],1,"열/행 앞의 $는 고정.",1),
      mkQ("데이터베이스","키","관계형 DB에서 기본키의 성질로 옳지 않은 것은?",["튜플을 유일하게 식별","NULL을 허용","중복을 허용하지 않음","후보키 중 하나"],1,"기본키는 중복/NULL 불가.",2),
      mkQ("스프레드시트","함수","합계를 구하는 기본 함수는?",["SUM","COUNT","AVERAGE","MAX"],0,"=SUM(range)",1),
      mkQ("데이터베이스","정규화","정규화 목적과 가장 거리가 먼 것은?",["중복 감소","이상 최소화","질의 속도 저하 유도","일관성 향상"],2,"정규화는 중복/이상 완화.",3),
      mkQ("컴퓨터 일반","네트워크","전송 계층(Transport)의 대표 프로토콜은?",["TCP/UDP","IP/ICMP","HTTP/HTTPS","ARP"],0,"종단 간 신뢰성/흐름 제어.",2),
    ];
  });

  useEffect(() => { localStorage.setItem("khla-questions", JSON.stringify(questions)); }, [questions]);
  useEffect(() => { localStorage.setItem("khla-config", JSON.stringify(config)); }, [config]);

  const countsBySubject = useMemo(() => {
    const map = {};
    for (const q of questions) map[q.subject] = (map[q.subject] || 0) + 1;
    return map;
  }, [questions]);

  const [testResults, setTestResults] = useState(null);
  useEffect(() => { setTestResults(runSelfTests()); }, []);

  return (
    <div style={{ minHeight: "100vh", background: "#0a0a0a", color: "#e5e5e5", padding: 16 }}>
      <div style={{ maxWidth: 1120, margin: "0 auto" }}>
        <Header counts={countsBySubject} config={config} />

        {/* 설치 안내 배너 */}
        <InstallBanner installReady={installReady} onInstall={doInstall} />

        <nav style={{ marginTop: 16, display: "flex", gap: 8, flexWrap: "wrap" }}>
          <TabBtn active={tab === "quiz"} onClick={() => setTab("quiz")}>퀴즈</TabBtn>
          <TabBtn active={tab === "mock"} onClick={() => setTab("mock")}>모의고사</TabBtn>
          <TabBtn active={tab === "review"} onClick={() => setTab("review")}>오답노트</TabBtn>
          <TabBtn active={tab === "bank"} onClick={() => setTab("bank")}>문제은행</TabBtn>
          <TabBtn active={tab === "settings"} onClick={() => setTab("settings")}>설정</TabBtn>
        </nav>

        <main style={{ marginTop: 16 }}>
          {tab === "quiz" && <QuizPane questions={questions} setQuestions={setQuestions} />}
          {tab === "mock" && <MockPane questions={questions} setQuestions={setQuestions} config={config} />}
          {tab === "review" && <ReviewPane questions={questions} setQuestions={setQuestions} />}
          {tab === "bank" && <BankPane questions={questions} setQuestions={setQuestions} />}
          {tab === "settings" && <SettingsPane config={config} setConfig={setConfig} testResults={testResults} />}
        </main>

        <footer style={{ marginTop: 24, fontSize: 12, color: "#9ca3af" }}>
          ※ 데이터는 이 브라우저의 로컬 저장소에만 저장됩니다. 다른 기기와 자동 동기화되지 않습니다.
        </footer>
      </div>
    </div>
  );
}

/* ----------------- UI 조각들 ----------------- */
function Header({ counts, config }) {
  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  return (
    <div style={{ display: "flex", gap: 16, flexWrap: "wrap", alignItems: "flex-end", justifyContent: "space-between" }}>
      <div>
        <h1 style={{ fontSize: 24, fontWeight: 600 }}>컴활 1급 필기 공부앱 · 프로토타입</h1>
        <p style={{ color: "#9ca3af", marginTop: 4 }}>퀴즈/모의고사/오답노트/문제은행을 한 곳에서</p>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0,1fr))", gap: 8 }}>
        <Stat label="문제 수" value={String(total)} />
        <Stat label="모의고사 문항" value={`${config.mockCount}문항`} />
        <Stat label="합격 기준" value={`${config.passScore}점`} />
      </div>
    </div>
  );
}

function Stat({ label, value }) {
  return (
    <div style={{ background: "#171717", border: "1px solid #262626", borderRadius: 16, padding: 12 }}>
      <div style={{ fontSize: 12, color: "#9ca3af" }}>{label}</div>
      <div style={{ fontSize: 18, fontWeight: 600 }}>{value}</div>
    </div>
  );
}

function TabBtn({ active, onClick, children }) {
  return (
    <button
      onClick={onClick}
      style={{
        padding: "8px 16px",
        borderRadius: 16,
        border: "1px solid",
        borderColor: active ? "#3b82f6" : "#262626",
        background: active ? "#2563eb" : "#171717",
        color: active ? "#fff" : "#e5e5e5",
        cursor: "pointer"
      }}
    >
      {children}
    </button>
  );
}

/* ----------------- 퀴즈 Pane ----------------- */
function QuizPane({ questions, setQuestions }) {
  const subjects = ["컴퓨터 일반", "스프레드시트", "데이터베이스"];
  const [selected, setSelected] = useState([...subjects]);
  const [count, setCount] = useState(10);
  const [inProgress, setInProgress] = useState(false);
  const [queue, setQueue] = useState([]);
  const [idx, setIdx] = useState(0);
  const [chosen, setChosen] = useState(null);
  const [result, setResult] = useState(null);

  const filtered = useMemo(() => questions.filter((q) => selected.includes(q.subject)), [questions, selected]);

  function start() {
    if (filtered.length === 0) { alert("선택한 과목의 문제가 없습니다."); return; }
    const q = sample(filtered, count);
    setQueue(q); setIdx(0); setChosen(null); setResult(null); setInProgress(true);
  }

  function markAnswer(q, choiceId) {
    if (result !== null) return;
    setChosen(choiceId);
    const isCorrect = q.answerId === choiceId;
    setResult(isCorrect);
    setQuestions((prev) => prev.map((x) => x.id === q.id ? {
      ...x, attempts: x.attempts + 1, correct: x.correct + (isCorrect ? 1 : 0), lastSeen: now()
    } : x));
  }

  function next() {
    if (idx + 1 < queue.length) { setIdx(idx + 1); setChosen(null); setResult(null); }
    else { setInProgress(false); }
  }

  useKeyboardShortcuts({
    onKey: (n) => {
      if (!inProgress) return;
      const q = queue[idx]; const choice = q?.choices?.[n - 1];
      if (choice) markAnswer(q, choice.id);
    },
    onNext: () => inProgress && next()
  });

  return (
    <div style={{ display: "grid", gap: 12 }}>
      <div style={{ background: "#171717", border: "1px solid #262626", borderRadius: 16, padding: 12 }}>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          {subjects.map((s) => (
            <label key={s} style={{ border: "1px solid #374151", borderRadius: 12, padding: "6px 10px", cursor: "pointer", background: selected.includes(s) ? "#1d4ed8" : "transparent" }}>
              <input type="checkbox" style={{ marginRight: 6 }} checked={selected.includes(s)}
                     onChange={() => setSelected((prev) => prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s])}/>
              {s}
            </label>
          ))}
          <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontSize: 14, color: "#9ca3af" }}>문항 수</span>
            <input type="number" min={5} max={100} value={count}
                   onChange={(e) => setCount(parseInt(e.target.value || "10", 10))}
                   style={{ width: 80, background: "#0a0a0a", color: "#e5e5e5", border: "1px solid #262626", borderRadius: 8, padding: "4px 6px" }} />
            <button onClick={start} style={{ padding: "8px 14px", borderRadius: 12, background: "#2563eb", color: "#fff", border: 0, cursor: "pointer" }}>시작</button>
          </div>
        </div>
      </div>

      {inProgress ? (
        <div style={{ background: "#171717", border: "1px solid #262626", borderRadius: 16, padding: 16 }}>
          <div style={{ fontSize: 12, color: "#9ca3af" }}>문제 {idx + 1} / {queue.length}</div>
          <div style={{ marginTop: 8, fontSize: 20, fontWeight: 600, lineHeight: 1.5 }}>{queue[idx].prompt}</div>
          {queue[idx].topic ? <div style={{ marginTop: 4, fontSize: 12, color: "#9ca3af" }}>[{queue[idx].subject} · {queue[idx].topic}]</div> : null}

          <div style={{ marginTop: 16, display: "grid", gap: 8 }}>
            {queue[idx].choices.map((c, i) => {
              const picked = chosen === c.id;
              const show = result !== null;
              const isAns = queue[idx].answerId === c.id;
              const styleBase = { textAlign: "left", padding: "10px 12px", borderRadius: 12, border: "1px solid #374151", cursor: "pointer" };
              let bg = "transparent", border = "#374151";
              if (show && isAns) { bg = "rgba(22,163,74,.2)"; border = "#15803d"; }
              else if (show && picked && !isAns) { bg = "rgba(220,38,38,.15)"; border = "#b91c1c"; }
              return (
                <button key={c.id} onClick={() => markAnswer(queue[idx], c.id)} disabled={show}
                        style={{ ...styleBase, background: bg, borderColor: border }}>
                  <span style={{ fontSize: 12, color: "#9ca3af", marginRight: 6 }}>[{i + 1}]</span>{c.text}
                </button>
              );
            })}
          </div>

          {result !== null && (
            <div style={{ marginTop: 12, padding: 12, borderRadius: 12, border: "1px solid #262626", background: "#0a0a0a", fontSize: 14 }}>
              <div style={{ color: result ? "#34d399" : "#f87171", marginBottom: 4 }}>{result ? "정답!" : "오답"}</div>
              {queue[idx].explanation ? <div style={{ color: "#d1d5db" }}>{queue[idx].explanation}</div> : null}
            </div>
          )}

          <div style={{ marginTop: 12, display: "flex", gap: 8, alignItems: "center" }}>
            <button onClick={() => toggleBookmark(queue[idx].id, setQuestions)} style={{ padding: "6px 10px", borderRadius: 10, border: "1px solid #374151", background: "transparent", color: "#e5e5e5", cursor: "pointer" }}>
              {isBookmarked(queue[idx].id, questions) ? "★ 북마크됨" : "☆ 북마크"}
            </button>
            <div style={{ flex: 1 }} />
            <button onClick={next} style={{ padding: "8px 14px", borderRadius: 12, background: "#2563eb", color: "#fff", border: 0, cursor: "pointer" }}>다음</button>
          </div>
        </div>
      ) : (
        <div style={{ color: "#9ca3af", fontSize: 14 }}>과목과 문항 수를 선택하고 <b style={{ color: "#e5e5e5" }}>시작</b>을 눌러주세요. (숫자키 1–6으로 보기도 선택 가능)</div>
      )}
    </div>
  );
}

function useKeyboardShortcuts({ onKey, onNext }) {
  useEffect(() => {
    function handle(e) {
      if (e.key >= "1" && e.key <= "6") onKey(parseInt(e.key, 10));
      if (e.key === "Enter" || (e.key || "").toLowerCase() === "n") onNext();
    }
    window.addEventListener("keydown", handle);
    return () => window.removeEventListener("keydown", handle);
  }, [onKey, onNext]);
}

function isBookmarked(id, questions) { return !!questions.find((q) => q.id === id)?.bookmarked; }
function toggleBookmark(id, setQuestions) {
  setQuestions((prev) => prev.map((q) => q.id === id ? { ...q, bookmarked: !q.bookmarked } : q));
}

/* ----------------- 모의고사 Pane ----------------- */
function MockPane({ questions, setQuestions, config }) {
  const [inProgress, setInProgress] = useState(false);
  const [queue, setQueue] = useState([]);
  const [idx, setIdx] = useState(0);
  const [answers, setAnswers] = useState({});
  const [deadline, setDeadline] = useState(null);
  const [finished, setFinished] = useState(false);
  const mockStartedCountRef = useRef(0);

  function start() {
    if (questions.length < 2) { alert("문제 수가 부족합니다."); return; }
    const q = sample(questions, config.mockCount);
    mockStartedCountRef.current = q.length;
    setQueue(q); setIdx(0); setAnswers({}); setFinished(false); setInProgress(true);
    setDeadline(Date.now() + config.mockMinutes * 60 * 1000);
  }

  function select(choiceId) {
    const q = queue[idx];
    setAnswers((prev) => ({ ...prev, [q.id]: choiceId }));
  }

  function next() { if (idx + 1 < queue.length) setIdx(idx + 1); }
  function prev() { if (idx > 0) setIdx(idx - 1); }

  const remain = useTimer(deadline, () => finish());

  function finish() {
    if (!inProgress) return;
    const updates = {};
    queue.forEach((q) => {
      const isCorrect = answers[q.id] === q.answerId;
      updates[q.id] = { attempts: 1, correct: isCorrect ? 1 : 0 };
    });
    setQuestions((prev) => prev.map((q) => updates[q.id] ? { ...q, attempts: q.attempts + 1, correct: q.correct + updates[q.id].correct, lastSeen: now() } : q));
    setFinished(true); setInProgress(false);
  }

  const wrongList = useMemo(() => getWrongList(queue, answers), [queue, answers]);
  function retryWrong() {
    if (!finished) return;
    if (wrongList.length === 0) { alert("오답이 없습니다."); return; }
    const perQ = mockStartedCountRef.current > 0 ? config.mockMinutes / mockStartedCountRef.current : 1;
    const minutes = Math.max(1, Math.ceil(perQ * wrongList.length));
    setQueue(wrongList); setIdx(0); setAnswers({}); setFinished(false); setInProgress(true);
    setDeadline(Date.now() + minutes * 60 * 1000);
  }

  const score = useMemo(() => {
    const total = queue.length; if (total === 0) return 0;
    let c = 0; for (const q of queue) if (answers[q.id] === q.answerId) c++;
    return Math.round((c / total) * 100);
  }, [answers, queue]);

  return (
    <div style={{ display: "grid", gap: 12 }}>
      <div style={{ background: "#171717", border: "1px solid #262626", borderRadius: 16, padding: 12, display: "flex", gap: 8, alignItems: "center" }}>
        <div style={{ fontSize: 14, color: "#9ca3af" }}>모의고사: {config.mockCount}문항 / {config.mockMinutes}분</div>
        <div style={{ flex: 1 }} />
        {!inProgress && !finished && <button onClick={start} style={{ padding: "8px 14px", borderRadius: 12, background: "#2563eb", color: "#fff", border: 0, cursor: "pointer" }}>시작</button>}
        {inProgress && <CountdownDisplay remainMs={remain} />}
        {inProgress && <button onClick={finish} style={{ marginLeft: 8, padding: "8px 14px", borderRadius: 12, border: "1px solid #374151", background: "transparent", color: "#e5e5e5", cursor: "pointer" }}>종료</button>}
      </div>

      {inProgress && (
        <div style={{ background: "#171717", border: "1px solid #262626", borderRadius: 16, padding: 16 }}>
          <div style={{ fontSize: 12, color: "#9ca3af" }}>문제 {idx + 1} / {queue.length}</div>
          <div style={{ marginTop: 8, fontSize: 20, fontWeight: 600, lineHeight: 1.5 }}>{queue[idx].prompt}</div>
          {queue[idx].topic ? <div style={{ marginTop: 4, fontSize: 12, color: "#9ca3af" }}>[{queue[idx].subject} · {queue[idx].topic}]</div> : null}

          <div style={{ marginTop: 16, display: "grid", gap: 8 }}>
            {queue[idx].choices.map((c, i) => {
              const picked = answers[queue[idx].id] === c.id;
              return (
                <button key={c.id} onClick={() => select(c.id)}
                        style={{ textAlign: "left", padding: "10px 12px", borderRadius: 12, border: "1px solid", borderColor: picked ? "#2563eb" : "#374151", background: picked ? "rgba(37,99,235,.2)" : "transparent", cursor: "pointer" }}>
                  <span style={{ fontSize: 12, color: "#9ca3af", marginRight: 6 }}>[{i + 1}]</span>{c.text}
                </button>
              );
            })}
          </div>

          <div style={{ marginTop: 12, display: "flex", alignItems: "center", gap: 8 }}>
            <button onClick={() => toggleBookmark(queue[idx].id, setQuestions)} style={{ padding: "6px 10px", borderRadius: 10, border: "1px solid #374151", background: "transparent", color: "#e5e5e5", cursor: "pointer" }}>
              {isBookmarked(queue[idx].id, questions) ? "★ 북마크됨" : "☆ 북마크"}
            </button>
            <div style={{ flex: 1 }} />
            <button onClick={prev} style={{ padding: "8px 12px", borderRadius: 10, border: "1px solid #374151", background: "transparent", color: "#e5e5e5", cursor: "pointer" }}>이전</button>
            <button onClick={next} style={{ padding: "8px 12px", borderRadius: 10, border: "1px solid #374151", background: "transparent", color: "#e5e5e5", cursor: "pointer" }}>다음</button>
          </div>
        </div>
      )}

      {finished && (
        <div style={{ background: "#171717", border: "1px solid #262626", borderRadius: 16, padding: 16 }}>
          <div style={{ fontSize: 18, fontWeight: 600 }}>결과: {score}점 {score >= config.passScore ? "(합격 기준 충족)" : "(미달)"}</div>
          <div style={{ marginTop: 12, display: "grid", gap: 8, gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))" }}>
            {queue.map((q, i) => {
              const ok = answers[q.id] === q.answerId;
              const my = answers[q.id];
              const myText = q.choices.find((c) => c.id === my)?.text ?? "무응답";
              const ansText = q.choices.find((c) => c.id === q.answerId)?.text ?? "?";
              return (
                <div key={q.id} style={{ borderRadius: 12, padding: 12, border: "1px solid", borderColor: ok ? "#15803d" : "#b91c1c", background: ok ? "rgba(22,163,74,.1)" : "rgba(220,38,38,.1)" }}>
                  <div style={{ fontSize: 12, color: "#9ca3af" }}>문항 {i + 1} · {q.subject} · {q.topic}</div>
                  <div style={{ marginTop: 4 }}>{q.prompt}</div>
                  <div style={{ marginTop: 6, fontSize: 14 }}><span style={{ color: "#9ca3af" }}>내 답</span>: {myText}</div>
                  <div style={{ fontSize: 14 }}><span style={{ color: "#9ca3af" }}>정답</span>: {ansText}</div>
                  {q.explanation ? <div style={{ marginTop: 4, fontSize: 12, color: "#9ca3af" }}>해설: {q.explanation}</div> : null}
                </div>
              );
            })}
          </div>
          <div style={{ marginTop: 12 }}>
            {wrongList.length > 0 && (
              <button onClick={retryWrong} style={{ padding: "10px 14px", borderRadius: 12, background: "#2563eb", color: "#fff", border: 0, cursor: "pointer" }}>
                오답만 재풀기 ({wrongList.length})
              </button>
            )}
          </div>
        </div>
      )}

      {!inProgress && !finished && (
        <div style={{ color: "#9ca3af", fontSize: 14 }}>모의고사는 종료 시 일괄 채점됩니다. (문항/시간/합격 기준은 설정 탭에서 변경)</div>
      )}
    </div>
  );
}

function useTimer(deadline, onExpire) {
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

function CountdownDisplay({ remainMs }) {
  const mm = Math.floor(remainMs / 60000);
  const ss = Math.floor((remainMs % 60000) / 1000);
  return <div style={{ padding: "4px 10px", borderRadius: 10, background: "#2a2a2a", fontSize: 14 }}>남은 시간 {String(mm).padStart(2, "0")}:{String(ss).padStart(2, "0")}</div>;
}

/* ----------------- 오답노트 Pane ----------------- */
function ReviewPane({ questions, setQuestions }) {
  const items = useMemo(() => {
    return questions
      .filter((q) => (q.attempts > 0 && (q.correct / q.attempts) < 0.7) || q.bookmarked)
      .sort((a, b) => (b.lastSeen ?? 0) - (a.lastSeen ?? 0));
  }, [questions]);

  function resetStats(id) {
    setQuestions((prev) => prev.map((q) => q.id === id ? { ...q, attempts: 0, correct: 0 } : q));
  }

  return (
    <div style={{ background: "#171717", border: "1px solid #262626", borderRadius: 16, padding: 16 }}>
      <div style={{ fontSize: 14, color: "#9ca3af" }}>오답/북마크 {items.length}문항</div>
      <div style={{ marginTop: 12, display: "grid", gap: 8, gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))" }}>
        {items.map((q) => (
          <div key={q.id} style={{ borderRadius: 12, padding: 12, border: "1px solid #374151" }}>
            <div style={{ fontSize: 12, color: "#9ca3af" }}>{q.subject} · {q.topic}</div>
            <div style={{ marginTop: 4, fontWeight: 500 }}>{q.prompt}</div>
            <ul style={{ marginTop: 8, marginLeft: 16, fontSize: 14 }}>
              {q.choices.map((c) => (<li key={c.id} style={{ color: c.id === q.answerId ? "#34d399" : "#e5e5e5" }}>{c.text}</li>))}
            </ul>
            {q.explanation ? <div style={{ marginTop: 6, fontSize: 12, color: "#9ca3af" }}>해설: {q.explanation}</div> : null}
            <div style={{ marginTop: 6, fontSize: 12, color: "#9ca3af" }}>정답 {q.correct} / 시도 {q.attempts}</div>
            <div style={{ marginTop: 8, display: "flex", gap: 8 }}>
              <button onClick={() => toggleBookmark(q.id, setQuestions)} style={{ padding: "6px 10px", borderRadius: 10, border: "1px solid #374151", background: "transparent", color: "#e5e5e5", cursor: "pointer" }}>
                {q.bookmarked ? "★ 북마크 해제" : "☆ 북마크"}
              </button>
              <button onClick={() => resetStats(q.id)} style={{ padding: "6px 10px", borderRadius: 10, border: "1px solid #374151", background: "transparent", color: "#e5e5e5", cursor: "pointer" }}>
                통계 초기화
              </button>
            </div>
          </div>
        ))}
      </div>
      {items.length === 0 && <div style={{ marginTop: 8, color: "#9ca3af", fontSize: 14 }}>오답 또는 북마크 문제가 없습니다.</div>}
    </div>
  );
}

/* ----------------- 문제은행 Pane ----------------- */
function BankPane({ questions, setQuestions }) {
  const [filter, setFilter] = useState("");
  const [editing, setEditing] = useState(null);

  const filtered = useMemo(() => {
    const key = filter.trim();
    if (!key) return questions;
    return questions.filter((q) => [q.prompt, q.topic, q.subject, ...(q.tags || [])].join(" ").toLowerCase().includes(key.toLowerCase()));
  }, [filter, questions]);

  function addBlank() {
    const c1 = { id: uid(), text: "보기1" };
    const c2 = { id: uid(), text: "보기2" };
    const q = { id: uid(), subject: "컴퓨터 일반", topic: "", prompt: "새 문제", choices: [c1, c2], answerId: c1.id, explanation: "", difficulty: 2, attempts: 0, correct: 0, bookmarked: false };
    setQuestions((prev) => [q, ...prev]); setEditing(q.id);
  }

  function remove(id) { if (confirm("삭제할까요?")) setQuestions((prev) => prev.filter((q) => q.id !== id)); }

  function exportJSON() {
    const blob = new Blob([JSON.stringify(questions, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = "khla-questions.json"; a.click(); URL.revokeObjectURL(url);
  }

  function importJSON(evt) {
    const file = evt.target.files?.[0]; if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const arr = JSON.parse(String(reader.result));
        if (!Array.isArray(arr)) throw new Error("형식 오류");
        const normalized = arr.map((raw) => normalizeQuestion(raw));
        setQuestions(normalized);
      } catch (e) { alert("JSON 형식이 올바르지 않습니다."); }
    };
    reader.readAsText(file, "utf-8");
  }

  function importCSV(evt) {
    const file = evt.target.files?.[0]; if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const text = String(reader.result);
        const rows = text.split(/\r?\n/).filter(Boolean);
        rows.shift(); // header
        const out = [];
        for (const line of rows) {
          const cols = parseCSVLine(line);
          const [subject, topic, prompt, c1, c2, c3, c4, ansIdxStr, exp] = cols;
          const list = [c1, c2, c3, c4].filter(Boolean);
          if (!subject || !prompt || list.length < 2) continue;
          const ansIdx = Math.max(0, Math.min(list.length - 1, parseInt(ansIdxStr || "0", 10)));
          out.push(mkQ(subject, topic || "", prompt, list, ansIdx, exp || ""));
        }
        setQuestions(out);
      } catch (e) { alert("CSV 형식이 올바르지 않습니다."); }
    };
    reader.readAsText(file, "utf-8");
  }

  return (
    <div style={{ display: "grid", gap: 12 }}>
      <div style={{ background: "#171717", border: "1px solid #262626", borderRadius: 16, padding: 12, display: "flex", alignItems: "center", gap: 8 }}>
        <input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="검색: 지문/주제/태그"
               style={{ flex: 1, background: "#0a0a0a", color: "#e5e5e5", border: "1px solid #262626", borderRadius: 10, padding: "8px 10px" }} />
        <button onClick={addBlank} style={{ padding: "8px 12px", borderRadius: 10, background: "#2563eb", color: "#fff", border: 0, cursor: "pointer" }}>새 문제</button>
        <button onClick={exportJSON} style={{ padding: "8px 12px", borderRadius: 10, border: "1px solid #374151", background: "transparent", color: "#e5e5e5", cursor: "pointer" }}>내보내기(JSON)</button>
        <label style={{ padding: "8px 12px", borderRadius: 10, border: "1px solid #374151", background: "transparent", color: "#e5e5e5", cursor: "pointer" }}>
          가져오기(JSON)
          <input type="file" accept=".json,application/json" onChange={importJSON} hidden />
        </label>
        <label style={{ padding: "8px 12px", borderRadius: 10, border: "1px solid #374151", background: "transparent", color: "#e5e5e5", cursor: "pointer" }}>
          가져오기(CSV)
          <input type="file" accept=".csv,text/csv" onChange={importCSV} hidden />
        </label>
      </div>

      <div style={{ display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))" }}>
        {filtered.map((q) => (
          <QuestionCard key={q.id} q={q}
                        editing={editing === q.id}
                        onEdit={() => setEditing(q.id)}
                        onClose={() => setEditing(null)}
                        onChange={(patched) => setQuestions((prev) => prev.map((x) => x.id === q.id ? patched : x))}
                        onRemove={() => remove(q.id)} />
        ))}
      </div>
    </div>
  );
}

function normalizeQuestion(raw) {
  const id = raw.id || uid();
  const subject = raw.subject || "컴퓨터 일반";
  const topic = raw.topic || "";
  const prompt = raw.prompt || "";
  let choices = raw.choices || [];
  if (!Array.isArray(choices)) {
    const list = [raw.choice1, raw.choice2, raw.choice3, raw.choice4].filter(Boolean);
    choices = list.map((t) => ({ id: uid(), text: t }));
  } else {
    choices = choices.map((c) => ({ id: c.id || uid(), text: c.text }));
  }
  const answerId = raw.answerId || (choices[0] ? choices[0].id : undefined);
  return {
    id, subject, topic, prompt, choices, answerId,
    explanation: raw.explanation || "", difficulty: raw.difficulty || 2,
    tags: raw.tags || [], source: raw.source || "",
    attempts: raw.attempts || 0, correct: raw.correct || 0,
    lastSeen: raw.lastSeen || undefined, bookmarked: raw.bookmarked || false,
  };
}

function parseCSVLine(line) {
  const out = []; let cur = ""; let inQ = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') { inQ = !inQ; continue; }
    if (ch === "," && !inQ) { out.push(cur.trim()); cur = ""; continue; }
    cur += ch;
  }
  out.push(cur.trim());
  return out;
}

function QuestionCard({ q, editing, onEdit, onClose, onChange, onRemove }) {
  const [draft, setDraft] = useState(q);
  useEffect(() => setDraft(q), [q]);

  function save() { onChange(draft); onClose(); }
  function addChoice() { setDraft((d) => ({ ...d, choices: [...d.choices, { id: uid(), text: "새 보기" }] })); }
  function rmChoice(id) {
    setDraft((d) => ({ ...d, choices: d.choices.filter((c) => c.id !== id) }));
    if (draft.answerId === id && draft.choices[0]) setDraft((d) => ({ ...d, answerId: d.choices[0].id }));
  }

  return (
    <div style={{ background: "#171717", border: "1px solid #262626", borderRadius: 16, padding: 12 }}>
      {!editing ? (
        <div style={{ display: "flex", gap: 8 }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 12, color: "#9ca3af" }}>{q.subject} · {q.topic}</div>
            <div style={{ marginTop: 4, fontWeight: 500 }}>{q.prompt}</div>
            <ul style={{ marginTop: 8, marginLeft: 16, fontSize: 14 }}>
              {q.choices.map((c) => (<li key={c.id} style={{ color: c.id === q.answerId ? "#34d399" : "#e5e5e5" }}>{c.text}</li>))}
            </ul>
            {q.explanation ? <div style={{ marginTop: 6, fontSize: 12, color: "#9ca3af" }}>해설: {q.explanation}</div> : null}
            <div style={{ marginTop: 6, fontSize: 12, color: "#9ca3af" }}>정답 {q.correct} / 시도 {q.attempts}</div>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <button onClick={onEdit} style={{ padding: "6px 10px", borderRadius: 10, border: "1px solid #374151", background: "transparent", color: "#e5e5e5", cursor: "pointer" }}>편집</button>
            <button onClick={onRemove} style={{ padding: "6px 10px", borderRadius: 10, border: "1px solid #374151", background: "transparent", color: "#e5e5e5", cursor: "pointer" }}>삭제</button>
          </div>
        </div>
      ) : (
        <div style={{ display: "grid", gap: 8 }}>
          <div style={{ display: "grid", gap: 8, gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))" }}>
            <select value={draft.subject} onChange={(e) => setDraft((d) => ({ ...d, subject: e.target.value }))}
                    style={{ background: "#0a0a0a", color: "#e5e5e5", border: "1px solid #262626", borderRadius: 10, padding: "8px 10px" }}>
              <option>컴퓨터 일반</option>
              <option>스프레드시트</option>
              <option>데이터베이스</option>
            </select>
            <input value={draft.topic || ""} onChange={(e) => setDraft((d) => ({ ...d, topic: e.target.value }))}
                   placeholder="주제(선택)" style={{ background: "#0a0a0a", color: "#e5e5e5", border: "1px solid #262626", borderRadius: 10, padding: "8px 10px" }} />
            <input value={draft.source || ""} onChange={(e) => setDraft((d) => ({ ...d, source: e.target.value }))}
                   placeholder="출처(선택)" style={{ background: "#0a0a0a", color: "#e5e5e5", border: "1px solid #262626", borderRadius: 10, padding: "8px 10px" }} />
          </div>

          <textarea value={draft.prompt} onChange={(e) => setDraft((d) => ({ ...d, prompt: e.target.value }))}
                    rows={3} style={{ width: "100%", background: "#0a0a0a", color: "#e5e5e5", border: "1px solid #262626", borderRadius: 10, padding: "8px 10px" }} />

          <div style={{ display: "grid", gap: 8 }}>
            {draft.choices.map((c) => (
              <div key={c.id} style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <input type="radio" name={`ans-${q.id}`} checked={draft.answerId === c.id} onChange={() => setDraft((d) => ({ ...d, answerId: c.id }))} />
                <input value={c.text} onChange={(e) => setDraft((d) => ({ ...d, choices: d.choices.map((x) => x.id === c.id ? { ...x, text: e.target.value } : x) }))}
                       style={{ flex: 1, background: "#0a0a0a", color: "#e5e5e5", border: "1px solid #262626", borderRadius: 10, padding: "8px 10px" }} />
                <button onClick={() => rmChoice(c.id)} style={{ padding: "6px 10px", borderRadius: 10, border: "1px solid #374151", background: "transparent", color: "#e5e5e5", cursor: "pointer" }}>삭제</button>
              </div>
            ))}
            <div>
              <button onClick={addChoice} style={{ padding: "6px 10px", borderRadius: 10, border: "1px solid #374151", background: "transparent", color: "#e5e5e5", cursor: "pointer" }}>보기 추가</button>
            </div>
          </div>

          <textarea value={draft.explanation || ""} onChange={(e) => setDraft((d) => ({ ...d, explanation: e.target.value }))}
                    rows={2} style={{ width: "100%", background: "#0a0a0a", color: "#e5e5e5", border: "1px solid #262626", borderRadius: 10, padding: "8px 10px" }} />

          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
            <button onClick={save} style={{ padding: "8px 14px", borderRadius: 12, background: "#2563eb", color: "#fff", border: 0, cursor: "pointer" }}>저장</button>
            <button onClick={onClose} style={{ padding: "8px 14px", borderRadius: 12, border: "1px solid #374151", background: "transparent", color: "#e5e5e5", cursor: "pointer" }}>취소</button>
          </div>
        </div>
      )}
    </div>
  );
}

/* ----------------- 설정 Pane ----------------- */
function SettingsPane({ config, setConfig, testResults }) {
  function up(k, v) { setConfig((c) => ({ ...c, [k]: v })); }
  function reset() { setConfig({ mockCount: 60, mockMinutes: 60, passScore: 60 }); }

  return (
    <div style={{ background: "#171717", border: "1px solid #262626", borderRadius: 16, padding: 16, display: "grid", gap: 12 }}>
      <div style={{ display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))" }}>
        <NumInput label="모의고사 문항 수" value={config.mockCount} onChange={(v) => up("mockCount", v)} min={10} max={100} />
        <NumInput label="모의고사 시간(분)" value={config.mockMinutes} onChange={(v) => up("mockMinutes", v)} min={10} max={180} />
        <NumInput label="합격 기준 점수" value={config.passScore} onChange={(v) => up("passScore", v)} min={40} max={100} />
      </div>
      <div>
        <button onClick={reset} style={{ padding: "8px 12px", borderRadius: 10, border: "1px solid #374151", background: "transparent", color: "#e5e5e5", cursor: "pointer" }}>기본값으로</button>
      </div>
      <div style={{ fontSize: 12, color: "#9ca3af" }}>※ 실제 시험 규정은 회차별로 다를 수 있습니다.</div>

      {testResults && (
        <div style={{ marginTop: 8, background: "#0a0a0a", border: "1px solid #262626", borderRadius: 16, padding: 12 }}>
          <div style={{ fontWeight: 500 }}>진단/자가 테스트</div>
          <ul style={{ marginTop: 8, fontSize: 14 }}>
            {testResults.map((t, i) => (
              <li key={i} style={{ color: t.passed ? "#34d399" : "#f87171" }}>
                {t.passed ? "✔" : "✖"} {t.name}{t.message ? ` — ${t.message}` : ""}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function NumInput({ label, value, onChange, min, max }) {
  return (
    <label style={{ display: "block" }}>
      <div style={{ fontSize: 14, color: "#9ca3af", marginBottom: 4 }}>{label}</div>
      <input type="number" value={value} min={min} max={max}
             onChange={(e) => onChange(parseInt(e.target.value || "0", 10))}
             style={{ background: "#0a0a0a", color: "#e5e5e5", border: "1px solid #262626", borderRadius: 10, padding: "8px 10px" }} />
    </label>
  );
}

/* ---- Install banner (간단) ---- */
function InstallBanner({ installReady, onInstall }) {
  const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent);
  const isStandalone = (window.matchMedia && window.matchMedia("(display-mode: standalone)").matches) || navigator.standalone;
  if (isStandalone) return null;

  if (installReady) {
    return (
      <div style={{ marginTop: 12, background: "#171717", border: "1px solid #1e3a8a", borderRadius: 16, padding: 12, display: "flex", gap: 8, alignItems: "center" }}>
        <div>📲 이 웹앱을 <b>홈 화면</b>에 설치할 수 있어요.</div>
        <div style={{ flex: 1 }} />
        <button onClick={onInstall} style={{ padding: "8px 12px", borderRadius: 12, background: "#2563eb", color: "#fff", border: 0, cursor: "pointer" }}>설치</button>
      </div>
    );
  }

  if (isIOS) {
    return (
      <div style={{ marginTop: 12, background: "#171717", border: "1px solid #262626", borderRadius: 16, padding: 12 }}>
        iOS는 Safari에서 공유 버튼 → <b>홈 화면에 추가</b>로 설치하세요.
      </div>
    );
  }

  return null;
}
