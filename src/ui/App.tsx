import { useEffect, useRef, useState } from "react";
import { Game, type ViewState } from "../core/Game";
import {
  defaults,
  type Mode,
  type Settings,
  type Team,
  type WeaponId,
  type Snapshot,
} from "../shared/types";
import { WEAPONS } from "../shared/weapons";
import { MAP, obstacles } from "../shared/map";
import { Icon, WeaponArt } from "./Icons";
import { ScopeOverlay } from "./ScopeOverlay";
import { ViewmodelQA } from "./ViewmodelQA";
type Panel =
  "none" | "settings" | "inventory" | "credits" | "lobby" | "pause" | "shop";
const initial: ViewState = {
  localId: "local",
  fps: 0,
  ping: 0,
  damage: 0,
  hit: 0,
  room: "",
  network: "",
};
function loadSettings(): Settings {
  try {
    const saved = JSON.parse(localStorage.getItem("spectra.settings") ?? "{}");
    return { ...defaults, ...saved };
  } catch {
    return defaults;
  }
}
export function App() {
  const mount = useRef<HTMLDivElement>(null),
    game = useRef<Game | null>(null);
  const [settings, setSettings] = useState(loadSettings),
    [view, setView] = useState(initial),
    [ready, setReady] = useState(false),
    [playing, setPlaying] = useState(false),
    [busy, setBusy] = useState(false),
    [panel, setPanel] = useState<Panel>("none"),
    [mode, setMode] = useState<Mode>("offline"),
    [team, setTeam] = useState<Team>("VANGUARD"),
    [score, setScore] = useState(false),
    [error, setError] = useState(""),
    [toast, setToast] = useState(""),
    [selection, setSelection] = useState<WeaponId>("vx47"),
    [online, setOnline] = useState({
      name: "OPERADOR",
      url: `${location.protocol === "https:" ? "wss" : "ws"}://${location.hostname}:2567`,
      code: "",
    });
  const panelRef = useRef(panel),
    playingRef = useRef(playing);
  panelRef.current = panel;
  playingRef.current = playing;
  useEffect(() => {
    let g: Game;
    try {
      g = new Game(mount.current!, settings);
      game.current = g;
      g.onView = setView;
      g.onAction = (action) => {
        if (
          action === "unlock" &&
          playingRef.current &&
          panelRef.current === "none"
        ) {
          setPanel("pause");
          g.paused = true;
        }
        if (action === "shop" && playingRef.current) {
          if (panelRef.current === "shop") {
            setPanel("none");
            g.shop = false;
            void g.input.lock();
          } else if (
            g.snapshot?.phase === "BUY_PHASE" ||
            g.mode === "training" ||
            g.mode === "tdm"
          ) {
            panelRef.current = "shop";
            setPanel("shop");
            g.shop = true;
            g.paused = false;
            g.input.unlock();
          } else notify("Compras disponíveis na preparação da rodada.");
        }
        if (action === "scoreDown") setScore(true);
        if (action === "scoreUp") setScore(false);
        if (action === "drop") {
          g.drop();
          notify("Equipamento no chão. E para recolher com o espaço livre.");
        }
        if (action === "purchased") notify("Equipamento adquirido.");
        if (action === "purchaseFailed")
          notify("Compra indisponível: confira saldo, inventário e fase.");
        if (action === "lockFailed") {
          g.paused = true;
          panelRef.current = "pause";
          setPanel("pause");
          notify(
            "Este navegador bloqueou a captura do mouse. Abra o jogo no Chrome ou Edge e clique em Continuar.",
          );
        }
        if (action === "pause" && playingRef.current) {
          g.paused = true;
          panelRef.current = "pause";
          setPanel("pause");
          g.input.unlock();
        }
      };
      setReady(true);
    } catch (e) {
      setError(`Não foi possível iniciar o WebGL 2: ${String(e)}`);
    }
    return () => g?.dispose();
  }, []);
  useEffect(() => {
    game.current?.applySettings(settings);
    localStorage.setItem("spectra.settings", JSON.stringify(settings));
  }, [settings]);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(""), 3300);
    return () => clearTimeout(t);
  }, [toast]);
  const notify = (text: string) => setToast(text);
  const update = <K extends keyof Settings>(key: K, value: Settings[K]) =>
    setSettings((s) => ({ ...s, [key]: value }));
  async function start() {
    if (!game.current) return;
    setError("");
    setBusy(true);
    try {
      await game.current.start(mode, team, online);
      setPlaying(true);
      playingRef.current = true;
      setPanel("pause");
      panelRef.current = "pause";
    } catch (e) {
      setError(
        mode === "online"
          ? `Conexão falhou. Verifique o servidor e o código da sala. ${e instanceof Error ? e.message : String(e)}`
          : String(e),
      );
    } finally {
      setBusy(false);
    }
  }
  function resume() {
    setPanel("none");
    panelRef.current = "none";
    if (game.current) {
      game.current.paused = false;
      game.current.shop = false;
      void game.current.audio.unlock();
      void game.current.input.lock();
    }
  }
  function backToMenu() {
    playingRef.current = false;
    setPlaying(false);
    setPanel("none");
    panelRef.current = "none";
    game.current?.input.unlock();
    game.current?.stopMatch();
    setView(initial);
  }
  const s = view.snapshot,
    a = s?.actors.find((a) => a.id === view.localId),
    gun = a?.inventory.find((g) => g.id === a.weapon);
  const close = () => {
    if (playing) {
      setPanel("pause");
      panelRef.current = "pause";
    } else setPanel("none");
  };
  return (
    <main className="app">
      <div ref={mount} className="scene" />
      <div className={`cinema ${playing ? "ingame" : ""}`} />
      {import.meta.env.DEV &&
        new URLSearchParams(location.search).get("qa") === "viewmodel" &&
        ready &&
        game.current && (
          <ViewmodelQA
            game={game.current}
            start={async () => {
              await game.current!.start("training", team);
              setMode("training");
              setPlaying(true);
              playingRef.current = true;
              setPanel("none");
              panelRef.current = "none";
              game.current!.paused = false;
            }}
          />
        )}
      {!playing && (
        <>
          <header className="header">
            <button
              className="brand"
              onClick={() => setPanel("none")}
              aria-label="SPECTRA início"
            >
              <span className="brand-mark">S</span>
              <span>
                SPECTRA<small>TACTICAL DIVISION</small>
              </span>
            </button>
            <nav>
              <button
                className={panel === "none" ? "active" : ""}
                onClick={() => setPanel("none")}
              >
                JOGAR
              </button>
              <button onClick={() => setPanel("inventory")}>ARSENAL</button>
              <button onClick={() => setPanel("settings")}>
                CONFIGURAÇÕES
              </button>
            </nav>
            <div className="profile">
              <span className="status-dot" /> SISTEMAS PRONTOS{" "}
              <span className="avatar">OP</span>
            </div>
          </header>
          <section className="menu-content">
            <div className="eyebrow">
              <span /> OPERAÇÃO 01 <i /> INDUSTRIAL DISTRICT
            </div>
            <h1>
              CADA ÂNGULO
              <br />
              <em>CONTA.</em>
            </h1>
            <p>
              Precisão no disparo. Estratégia no movimento.
              <br />O próximo passo decide a rodada.
            </p>
            <div className="hero-tags">
              <span>FPS TÁTICO</span>
              <span>5 CONTRA 5</span>
              <span>ORIGINAL & INDEPENDENTE</span>
            </div>
          </section>
          <aside className="district-card">
            <span className="corner" />
            <div className="eyebrow">ÁREA DE OPERAÇÃO</div>
            <h2>
              Industrial
              <br />
              District<span>04</span>
            </h2>
            <div className="district-map">
              <MiniMap snapshot={undefined} localId="" />
            </div>
            <div className="district-data">
              <span>
                SETORES <b>A / B</b>
              </span>
              <span>
                ROTAS <b>03</b>
              </span>
              <span>
                CLIMA <b>LIMPO</b>
              </span>
            </div>
            <p>Complexo industrial · Zona de contenção</p>
          </aside>
          <section className="deployment">
            <div className="section-caption">
              <span>ESCOLHA SUA OPERAÇÃO</span>
              <span>01 — 04</span>
            </div>
            <div className="mode-row">
              {(
                [
                  {
                    id: "tdm",
                    icon: "bolt",
                    name: "MATA-MATA 7V7",
                    label: "7V7 • 75 PONTOS",
                    text: "Ação contínua e respawn em 3s.",
                  },
                  {
                    id: "offline",
                    icon: "people",
                    name: "COMBATE TÁTICO",
                    label: "5V5 • PARTIDA COM BOTS",
                    text: "Duas equipes. Um objetivo.",
                  },
                  {
                    id: "training",
                    icon: "target",
                    name: "CAMPO DE TREINO",
                    label: "SOLO • ALVOS",
                    text: "Domine seu próximo disparo.",
                  },
                  {
                    id: "online",
                    icon: "signal",
                    name: "OPERAÇÃO ONLINE",
                    label: "MULTIPLAYER • SERVIDOR",
                    text: "Crie uma sala. Reúna sua equipe.",
                  },
                ] as const
              ).map((m, i) => (
                <button
                  key={m.id}
                  onClick={() => {
                    setMode(m.id);
                    game.current?.audio.ui();
                  }}
                  className={`mode-card ${mode === m.id ? "selected" : ""}`}
                >
                  <span className="mode-number">0{i + 1}</span>
                  <Icon name={m.icon} size={26} />
                  <div>
                    <small>{m.label}</small>
                    <strong>{m.name}</strong>
                    <p>{m.text}</p>
                  </div>
                  <span className="radio" />
                </button>
              ))}
            </div>
            <div className="deploy-footer">
              <div className="hint">
                <span className="status-dot" />
                <span>
                  {mode === "online"
                    ? "Servidor autoritativo · Até 10 jogadores"
                    : "Execução local · Sem conta · Pronto para jogar"}
                </span>
              </div>
              <button
                className="primary deploy-button"
                disabled={!ready}
                onClick={() => {
                  setError("");
                  setPanel("lobby");
                }}
              >
                {ready ? "INICIAR OPERAÇÃO" : "INICIALIZANDO"}
                <Icon name="arrow" />
              </button>
            </div>
          </section>
          <footer className="footer">
            <span>
              SPECTRA <b> / </b> BUILD 0.1 · DESENVOLVIMENTO
            </span>
            <span>
              WASD <b>MOVER</b> · MOUSE <b>MIRAR</b> · R <b>RECARREGAR</b>
            </span>
            <button onClick={() => setPanel("credits")}>
              CRÉDITOS <span>↗</span>
            </button>
          </footer>
        </>
      )}
      {playing && s && a && (
        <>
          <ScopeOverlay game={game.current} />
          <div className="hud-top">
            <MiniMap snapshot={s} localId={a.id} />
            <div className="round-score">
              <div className="team-score blue">
                <span>VANGUARD</span>
                <b>{s.score.VANGUARD}</b>
                <div className="lives">
                  {s.actors
                    .filter((a) => a.team === "VANGUARD")
                    .map((a) => (
                      <i key={a.id} className={a.alive ? "" : "dead"} />
                    ))}
                </div>
              </div>
              <div className="timer">
                <small>
                  {mode === "training"
                    ? "TREINAMENTO"
                    : mode === "tdm"
                      ? `MATA-MATA · ${s.targetScore ?? 75} PTS`
                      : `RODADA ${String(s.round).padStart(2, "0")}`}
                </small>
                <strong className={s.objective.planted ? "danger" : ""}>
                  {mode === "training"
                    ? "∞"
                    : formatTime(
                        s.objective.planted ? s.objective.remaining : s.time,
                      )}
                </strong>
                <span>
                  {mode === "tdm"
                    ? "RESPAWN ATIVO"
                    : s.phase === "BUY_PHASE"
                      ? "PREPARAÇÃO"
                      : s.objective.planted
                        ? "DISPOSITIVO ATIVO"
                        : a.team === s.attacking
                          ? "ATAQUE"
                          : "DEFESA"}
                </span>
              </div>
              <div className="team-score orange">
                <span>PHANTOM</span>
                <b>{s.score.PHANTOM}</b>
                <div className="lives">
                  {s.actors
                    .filter((a) => a.team === "PHANTOM")
                    .map((a) => (
                      <i key={a.id} className={a.alive ? "" : "dead"} />
                    ))}
                </div>
              </div>
            </div>
            <div className="match-info">
              <span>
                {mode === "online"
                  ? `${view.network} · ${view.ping} MS`
                  : "PARTIDA LOCAL"}
              </span>
              {view.room && (
                <button
                  onClick={() => {
                    void navigator.clipboard
                      .writeText(view.room)
                      .then(() => notify("Código da sala copiado."));
                  }}
                >
                  SALA {view.room} ⧉
                </button>
              )}
              {settings.fps && <b>{view.fps} FPS</b>}
            </div>
          </div>
          <div className="killfeed">
            {s.events
              .filter((e) => e.type === "kill")
              .slice(-5)
              .reverse()
              .map((e) => (
                <div key={e.id}>
                  <span
                    className={
                      s.actors.find((a) => a.id === e.actor)?.team ===
                      "VANGUARD"
                        ? "blue"
                        : "orange"
                    }
                  >
                    {s.actors.find((a) => a.id === e.actor)?.name ?? "OPERADOR"}
                  </span>
                  <small>
                    {e.headshot ? "⌾ " : ""}
                    {WEAPONS[e.weapon!].name}
                  </small>
                  <span>
                    {s.actors.find((a) => a.id === e.target)?.name ?? "ALVO"}
                  </span>
                </div>
              ))}
          </div>
          {a.alive && panel === "none" && (
            <div className={`crosshair ${game.current?.aim ? "aim" : ""}`}>
              <i />
              <i />
              <i />
              <i />
              <b />
            </div>
          )}
          {view.hit > 0 && (
            <div className="hitmarker" style={{ opacity: view.hit }}>
              ×
            </div>
          )}
          <div className="damage" style={{ opacity: view.damage * 0.7 }} />
          <div className="objective-hint">
            {s.phase === "BUY_PHASE" ? (
              <>
                <b>FASE DE COMPRA</b>
                <span>
                  Prepare seu equipamento. <kbd>B</kbd> ABRIR LOJA
                </span>
              </>
            ) : mode === "training" ? (
              <>
                <b>CAMPO DE TREINO</b>
                <span>
                  Alvos reaparecem · <kbd>B</kbd> ARSENAL · <kbd>F</kbd>{" "}
                  INSPECIONAR · <kbd>C</kbd> DESLIZAR
                </span>
              </>
            ) : mode === "tdm" ? (
              <>
                <b>MATA-MATA EM EQUIPE · META {s.targetScore ?? 75} PONTOS</b>
                <span>
                  Arsenal livre <kbd>B</kbd> · Deslizar em corrida{" "}
                  <kbd>CTRL / C</kbd> · Mirar <kbd>BOTÃO DIREITO</kbd>
                </span>
              </>
            ) : s.objective.planted ? (
              <>
                <b>DISPOSITIVO ATIVO · SETOR {s.objective.site}</b>
                <span>
                  {a.team === s.attacking
                    ? "Proteja o setor até a ativação."
                    : "Aproxime-se e segure E para desativar."}
                </span>
              </>
            ) : (
              <span>
                {a.team === s.attacking
                  ? "Avance ao setor A ou B. Segure E para ativar o dispositivo."
                  : "Defenda os setores A e B."}
              </span>
            )}
            {s.objective.progress > 0 && (
              <div className="progress">
                <i style={{ width: `${s.objective.progress * 100}%` }} />
              </div>
            )}
          </div>
          <div className="hud-bottom">
            <div className="health">
              <span className="hud-label">
                {a.name} <em>{a.team}</em>
              </span>
              <div>
                <Icon name="bolt" size={22} />
                <strong>{Math.ceil(a.health)}</strong>
                <span className="divider" />
                <Icon name="shield" />
                <b>{Math.ceil(a.armor)}</b>
              </div>
              <div className="healthbar">
                <i style={{ width: `${a.health}%` }} />
              </div>
            </div>
            <div className="hud-shortcuts">
              <span>
                <kbd>TAB</kbd> PLACAR
              </span>
              <span>
                <kbd>B</kbd> LOJA <b>₡ {a.credits.toLocaleString("pt-BR")}</b>
              </span>
              <span>
                <kbd>ESC</kbd> PAUSA
              </span>
            </div>
            <div className="weapon-hud">
              <span className="hud-label">{WEAPONS[a.weapon].label}</span>
              <div>
                <b>{WEAPONS[a.weapon].name}</b>
                <strong>
                  {a.weapon === "edge"
                    ? "—"
                    : gun?.ammo.toString().padStart(2, "0")}
                </strong>
                <span>/ {gun?.reserve}</span>
              </div>
              <small>
                {a.reload > 0
                  ? `RECARREGANDO ${a.reload.toFixed(1)} s`
                  : "1 PRIMÁRIA    2 SECUNDÁRIA    3 LÂMINA"}
                {a.weapon !== "edge" ? " · BOTÃO DIREITO: MIRA ADS" : ""}
              </small>
            </div>
          </div>
          {!a.alive && s.phase === "ROUND_ACTIVE" && (
            <div className="spectator">
              <small>
                {mode === "tdm" ? "REAPARECIMENTO TÁTICO" : "ELIMINADO"}
              </small>
              <b>
                {mode === "tdm"
                  ? `RETORNANDO EM ${Math.max(0.1, a.respawn ?? 3).toFixed(1)}s`
                  : "OBSERVANDO SUA EQUIPE"}
              </b>
              <span>
                {mode === "tdm"
                  ? "Pressione B para trocar de equipamento antes de reaparecer."
                  : "Você retorna na próxima rodada."}
              </span>
            </div>
          )}
          {(s.phase === "ROUND_END" || s.phase === "MATCH_END") && (
            <div className="round-result">
              <div className="eyebrow">
                {s.phase === "MATCH_END"
                  ? "PARTIDA ENCERRADA"
                  : `RODADA ${s.round} CONCLUÍDA`}
              </div>
              <h2>{s.winner === a.team ? "VITÓRIA" : "DERROTA"}</h2>
              <p>{s.reason}</p>
              <strong>
                {s.score.VANGUARD} <span>—</span> {s.score.PHANTOM}
              </strong>
              {s.phase === "MATCH_END" && (
                <button className="primary" onClick={backToMenu}>
                  VOLTAR AO MENU <Icon name="arrow" />
                </button>
              )}
            </div>
          )}
          {score && <Scoreboard snapshot={s} localId={a.id} />}
        </>
      )}
      {(panel !== "none" || (error && !ready)) && (
        <div className={`overlay ${panel === "shop" ? "shop-overlay" : ""}`}>
          <section
            className={`dialog ${panel === "shop" || panel === "inventory" ? "wide" : ""} ${panel === "pause" ? "pause-dialog" : ""}`}
            aria-label={panel}
          >
            <div className="dialog-top">
              <span className="eyebrow">
                SPECTRA /{" "}
                {panel === "shop"
                  ? "REQUISIÇÃO"
                  : panel === "settings"
                    ? "PREFERÊNCIAS"
                    : panel === "lobby"
                      ? "PREPARAÇÃO"
                      : "TACTICAL DIVISION"}
              </span>
              <button
                className="icon-button"
                aria-label="Fechar"
                onClick={
                  panel === "pause" ? resume : panel === "shop" ? resume : close
                }
              >
                <Icon name="cross" />
              </button>
            </div>
            {panel === "lobby" && (
              <>
                <h2>
                  {mode === "training"
                    ? "Calibre sua precisão."
                    : mode === "tdm"
                      ? "Combate contínuo em equipe."
                      : mode === "online"
                        ? "Conecte sua equipe."
                        : "Entre na operação."}
                </h2>
                <p className="muted">
                  {mode === "training"
                    ? "Cinco alvos, arsenal livre e espaço para praticar."
                    : mode === "tdm"
                      ? "Partida dinâmica até 7v7 com respawn em 3 segundos, arsenal livre e pontuação em tempo real."
                      : mode === "offline"
                        ? "Partida 5v5 com bots. Primeiro a vencer 4 rodadas. Troca de lados após a terceira."
                        : "Crie uma sala ou entre pelo código. Vagas livres são preenchidas por bots."}
                </p>
                <label className="field-label">ESCOLHA SUA EQUIPE</label>
                <div className="team-select">
                  {(["VANGUARD", "PHANTOM"] as Team[]).map((t) => (
                    <button
                      key={t}
                      className={`${team === t ? "selected" : ""} ${t === "VANGUARD" ? "blue" : "orange"}`}
                      onClick={() => setTeam(t)}
                    >
                      <Icon name="shield" size={30} />
                      <strong>{t}</strong>
                      <small>
                        {t === "VANGUARD" ? "ATAQUE INICIAL" : "DEFESA INICIAL"}
                      </small>
                    </button>
                  ))}
                </div>
                {mode === "online" ? (
                  <div className="online-fields">
                    <label>
                      SEU CODINOME
                      <input
                        maxLength={18}
                        value={online.name}
                        onChange={(e) =>
                          setOnline({ ...online, name: e.target.value })
                        }
                      />
                    </label>
                    <label>
                      SERVIDOR WEBSOCKET
                      <input
                        value={online.url}
                        onChange={(e) =>
                          setOnline({ ...online, url: e.target.value })
                        }
                      />
                    </label>
                    <label>
                      CÓDIGO DA SALA <span>Vazio para criar</span>
                      <input
                        placeholder="Código recebido do anfitrião"
                        value={online.code}
                        onChange={(e) =>
                          setOnline({ ...online, code: e.target.value.trim() })
                        }
                      />
                    </label>
                    <p className="muted">
                      Servidor local: execute <code>npm run server</code>. Para
                      outra máquina, use o endereço do anfitrião. Entrada
                      durante uma rodada aguarda a próxima.
                    </p>
                  </div>
                ) : (
                  <>
                    <label className="setting">
                      Dificuldade dos bots
                      <select
                        value={settings.difficulty}
                        onChange={(e) =>
                          update(
                            "difficulty",
                            e.target.value as Settings["difficulty"],
                          )
                        }
                      >
                        <option value="easy">Recruta</option>
                        <option value="normal">Operador</option>
                        <option value="hard">Veterano</option>
                      </select>
                    </label>
                    {mode === "tdm" && (
                      <>
                        <label className="setting">
                          Meta de pontos
                          <select
                            value={settings.tdmTarget ?? 75}
                            onChange={(e) =>
                              update("tdmTarget", Number(e.target.value))
                            }
                          >
                            <option value={50}>50 eliminações</option>
                            <option value={75}>75 eliminações (Padrão)</option>
                            <option value={100}>100 eliminações</option>
                          </select>
                        </label>
                        <label className="setting">
                          Duração máxima
                          <select
                            value={settings.tdmMinutes ?? 10}
                            onChange={(e) =>
                              update("tdmMinutes", Number(e.target.value))
                            }
                          >
                            <option value={5}>5 minutos</option>
                            <option value={10}>10 minutos (Padrão)</option>
                            <option value={15}>15 minutos</option>
                          </select>
                        </label>
                        <label className="setting">
                          Operadores por equipe
                          <select
                            value={settings.tdmTeamSize ?? 7}
                            onChange={(e) =>
                              update("tdmTeamSize", Number(e.target.value))
                            }
                          >
                            <option value={5}>5 contra 5</option>
                            <option value={6}>6 contra 6</option>
                            <option value={7}>7 contra 7 (Padrão)</option>
                          </select>
                        </label>
                      </>
                    )}
                  </>
                )}
                <button
                  className="primary full"
                  disabled={busy}
                  onClick={() => void start()}
                >
                  {busy
                    ? "PREPARANDO OPERAÇÃO..."
                    : mode === "online"
                      ? online.code
                        ? "ENTRAR NA SALA"
                        : "CRIAR SALA"
                      : "ENTRAR NO MAPA"}
                  <Icon name="arrow" />
                </button>
              </>
            )}
            {panel === "pause" && (
              <>
                <span className="pill">
                  {mode === "online"
                    ? "A PARTIDA ONLINE CONTINUA"
                    : "CONTROLE DO OPERADOR"}
                </span>
                <h2>
                  {game.current?.input.locked
                    ? "Operação pausada."
                    : "Pronto para entrar."}
                </h2>
                <p className="muted">
                  Clique em continuar para capturar o mouse.
                  <br />
                  Pressione Esc para liberar o cursor.
                </p>
                <div className="controls-grid">
                  {[
                    ["W A S D", "Mover"],
                    ["MOUSE", "Olhar / disparar"],
                    ["SHIFT", "Andar silenciosamente"],
                    ["CTRL", "Agachar"],
                    ["ESPAÇO", "Pular"],
                    ["R", "Recarregar"],
                    ["1 / 2 / 3", "Equipamento"],
                    ["E", "Ativar / desativar"],
                    ["F", "Inspecionar"],
                    ["G", "Descartar"],
                  ].map(([key, text]) => (
                    <div key={key}>
                      <kbd>{key}</kbd>
                      <span>{text}</span>
                    </div>
                  ))}
                </div>
                <button className="primary full" onClick={resume}>
                  CONTINUAR <Icon name="play" />
                </button>
                <div className="secondary-row">
                  <button onClick={() => setPanel("settings")}>
                    CONFIGURAÇÕES
                  </button>
                  <button onClick={backToMenu}>SAIR DA OPERAÇÃO</button>
                </div>
              </>
            )}
            {panel === "settings" && (
              <>
                <h2>Ajustes do operador.</h2>
                <p className="muted">
                  Aplicados imediatamente e salvos neste navegador.
                </p>
                <div className="settings-list">
                  <Range
                    label="Sensibilidade do mouse"
                    value={settings.sensitivity}
                    min={0.2}
                    max={3}
                    step={0.1}
                    onChange={(v) => update("sensitivity", v)}
                    suffix="×"
                  />
                  <Range
                    label="Campo de visão"
                    value={settings.fov}
                    min={65}
                    max={110}
                    step={1}
                    onChange={(v) => update("fov", v)}
                    suffix="°"
                  />
                  <Range
                    label="Volume principal"
                    value={Math.round(settings.volume * 100)}
                    min={0}
                    max={100}
                    step={1}
                    onChange={(v) => update("volume", v / 100)}
                    suffix="%"
                  />
                  <Range
                    label="Resolução interna"
                    value={Math.round(settings.resolution * 100)}
                    min={50}
                    max={100}
                    step={5}
                    onChange={(v) => update("resolution", v / 100)}
                    suffix="%"
                  />
                  <label className="setting">
                    Qualidade gráfica
                    <select
                      value={settings.quality}
                      onChange={(e) =>
                        update("quality", e.target.value as Settings["quality"])
                      }
                    >
                      <option value="low">Baixa · sem sombras</option>
                      <option value="medium">Média · sombras 2K</option>
                      <option value="high">Alta · sombras 3K</option>
                      <option value="ultra">
                        Ultra · sombras 4K + nitidez máxima
                      </option>
                    </select>
                  </label>
                  <label className="setting">
                    Mostrar FPS
                    <input
                      type="checkbox"
                      checked={settings.fps}
                      onChange={(e) => update("fps", e.target.checked)}
                    />
                  </label>
                  <label className="setting">
                    Marcador de acerto
                    <input
                      type="checkbox"
                      checked={settings.hitmarker}
                      onChange={(e) => update("hitmarker", e.target.checked)}
                    />
                  </label>
                </div>
                <button
                  className="secondary full"
                  onClick={() => setSettings({ ...defaults })}
                >
                  RESTAURAR PADRÕES
                </button>
              </>
            )}
            {(panel === "shop" || panel === "inventory") && (
              <>
                <div className="arsenal-title">
                  <div>
                    <h2>
                      {panel === "shop"
                        ? "Equipe-se para vencer."
                        : "Engenharia de precisão."}
                    </h2>
                    <p className="muted">
                      {panel === "shop"
                        ? `Créditos virtuais · ${s?.phase === "BUY_PHASE" ? `${Math.ceil(s.time)} s restantes` : "Treinamento"}`
                        : "Cinco equipamentos originais. Cada um com sua função."}
                    </p>
                  </div>
                  {panel === "shop" && (
                    <strong className="balance">
                      ₡ {a?.credits.toLocaleString("pt-BR")}
                    </strong>
                  )}
                </div>
                <div className="arsenal">
                  <div className="weapon-list">
                    {Object.values(WEAPONS).map((w) => (
                      <button
                        key={w.id}
                        onClick={() => setSelection(w.id)}
                        className={selection === w.id ? "selected" : ""}
                      >
                        <span>
                          <strong>{w.name}</strong>
                          <small>{w.label}</small>
                        </span>
                        <span>{w.price ? `₡ ${w.price}` : "PADRÃO"}</span>
                      </button>
                    ))}
                  </div>
                  <div className="weapon-detail">
                    <span className="eyebrow">
                      SPECTRA / {WEAPONS[selection].label}
                    </span>
                    <WeaponArt id={selection} />
                    <h3>{WEAPONS[selection].name}</h3>
                    <div className="weapon-stats">
                      <span>
                        DANO <b>{WEAPONS[selection].damage}</b>
                      </span>
                      <span>
                        PENTE <b>{WEAPONS[selection].capacity}</b>
                      </span>
                      <span>
                        RECARGA <b>{WEAPONS[selection].reload}s</b>
                      </span>
                    </div>
                    {panel === "shop" ? (
                      <button
                        className="primary full"
                        disabled={
                          !a ||
                          (mode !== "training" &&
                            mode !== "tdm" &&
                            a.credits < WEAPONS[selection].price) ||
                          a.inventory.some((g) => g.id === selection) ||
                          (s?.phase !== "BUY_PHASE" &&
                            mode !== "training" &&
                            mode !== "tdm")
                        }
                        onClick={() => game.current?.buy(selection)}
                      >
                        {a?.inventory.some((g) => g.id === selection)
                          ? "NO INVENTÁRIO"
                          : mode === "training" || mode === "tdm"
                            ? `EQUIPAR · ${WEAPONS[selection].name}`
                            : `ADQUIRIR · ₡ ${WEAPONS[selection].price}`}
                        <Icon name="arrow" />
                      </button>
                    ) : (
                      <p className="muted">
                        Experimente no Campo de Treino. Use F para inspecionar o
                        modelo em primeira pessoa.
                      </p>
                    )}
                  </div>
                </div>
                {panel === "shop" && (
                  <div className="armor-buy">
                    <div>
                      <Icon name="shield" />
                      <strong>COLETE TÁTICO</strong>
                      <span>100 de proteção</span>
                    </div>
                    <button
                      className="secondary"
                      disabled={
                        !a ||
                        (mode !== "training" &&
                          mode !== "tdm" &&
                          a.credits < 650) ||
                        a.armor === 100 ||
                        (s?.phase !== "BUY_PHASE" &&
                          mode !== "training" &&
                          mode !== "tdm")
                      }
                      onClick={() => game.current?.buy("armor")}
                    >
                      {a?.armor === 100 ? "EQUIPADO" : "ADQUIRIR · ₡ 650"}
                    </button>
                  </div>
                )}
              </>
            )}
            {panel === "credits" && (
              <>
                <h2>Um novo campo de jogo.</h2>
                <p className="muted">
                  SPECTRA é um FPS tático original desenvolvido com Three.js,
                  React, TypeScript, Rapier e Colyseus.
                </p>
                <div className="credit-block">
                  <span>ARTE & ÁUDIO</span>
                  <p>
                    Arquitetura, armas, operadores, materiais e efeitos sonoros
                    gerados proceduralmente para este projeto.
                  </p>
                  <span>BUILD 0.1</span>
                  <p>
                    Versão de desenvolvimento. Modelos procedurais e áudio
                    sintetizado; não representa acabamento de produção AAA.
                    Multiplayer requer o servidor Node.js.
                  </p>
                </div>
              </>
            )}
            {error && (
              <div className="error" role="alert">
                {error}
              </div>
            )}
          </section>
        </div>
      )}
      {toast && (
        <div className="toast" role="status">
          <span className="status-dot" />
          {toast}
        </div>
      )}
      {!playing && error && ready && panel === "none" && (
        <div className="toast error">{error}</div>
      )}
    </main>
  );
}
function Range({
  label,
  value,
  min,
  max,
  step,
  onChange,
  suffix,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (v: number) => void;
  suffix: string;
}) {
  return (
    <label className="range-setting">
      <span>
        {label}
        <b>
          {value}
          {suffix}
        </b>
      </span>
      <input
        aria-label={label}
        type="range"
        value={value}
        min={min}
        max={max}
        step={step}
        onChange={(e) => onChange(Number(e.target.value))}
      />
    </label>
  );
}
function formatTime(time: number) {
  return `${Math.floor(time / 60)
    .toString()
    .padStart(2, "0")}:${Math.ceil(time % 60)
    .toString()
    .padStart(2, "0")}`;
}
function MiniMap({
  snapshot,
  localId,
}: {
  snapshot?: Snapshot;
  localId: string;
}) {
  const a = snapshot?.actors.find((a) => a.id === localId);
  return (
    <div className="minimap">
      <svg viewBox="-35 -41 70 82" aria-label="Mapa de Industrial District">
        <rect x="-33" y="-39" width="66" height="78" rx="1" fill="#182a2c" />
        {obstacles.map((o, i) => (
          <rect
            key={i}
            x={o.x - o.w / 2}
            y={o.z - o.d / 2}
            width={o.w}
            height={o.d}
            fill={o.kind === "crate" ? "#697771" : "#4d5e5b"}
            stroke="#82908a"
            strokeWidth=".15"
          />
        ))}
        {Object.entries(MAP.sites).map(([key, p]) => (
          <g key={key}>
            <circle
              cx={p.x}
              cy={p.z}
              r="4"
              fill="#c6a37025"
              stroke="#e2b974"
              strokeWidth=".4"
            />
            <text
              x={p.x}
              y={p.z + 1.5}
              textAnchor="middle"
              fill="#e9c48c"
              fontSize="4.5"
              fontFamily="sans-serif"
            >
              {key}
            </text>
          </g>
        ))}
        {snapshot?.actors
          .filter(
            (b) =>
              b.alive && (b.team === a?.team || snapshot.mode === "training"),
          )
          .map((b) =>
            b.id === localId ? (
              <g
                key={b.id}
                transform={`translate(${b.position.x} ${b.position.z}) rotate(${(-b.yaw * 180) / Math.PI})`}
              >
                <path d="M0 -2.5 1.8 1.5 0 .6 -1.8 1.5Z" fill="#fff6d9" />
                <path d="M0 0-4-8Q0-11 4-8Z" fill="#ffffff17" />
              </g>
            ) : (
              <circle
                key={b.id}
                cx={b.position.x}
                cy={b.position.z}
                r="1.1"
                fill={b.team === a?.team ? "#75d8c7" : "#e9a568"}
              />
            ),
          )}
      </svg>
      {snapshot && <span>INDUSTRIAL DISTRICT</span>}
    </div>
  );
}
function Scoreboard({
  snapshot: s,
  localId,
}: {
  snapshot: Snapshot;
  localId: string;
}) {
  return (
    <div className="score-overlay">
      <section className="scoreboard">
        <div className="eyebrow">INDUSTRIAL DISTRICT / PLACAR</div>
        <h2>
          {s.score.VANGUARD} <span>:</span> {s.score.PHANTOM}
        </h2>
        {(["VANGUARD", "PHANTOM"] as const).map((t) => (
          <div key={t}>
            <h3 className={t === "VANGUARD" ? "blue" : "orange"}>{t}</h3>
            <table>
              <thead>
                <tr>
                  <th>OPERADOR</th>
                  <th>ELIMINAÇÕES</th>
                  <th>MORTES</th>
                  <th>CRÉDITOS</th>
                </tr>
              </thead>
              <tbody>
                {s.actors
                  .filter((a) => a.team === t)
                  .sort((a, b) => b.kills - a.kills)
                  .map((a) => (
                    <tr key={a.id} className={a.id === localId ? "you" : ""}>
                      <td>
                        <span className={a.alive ? "alive-dot" : "dead-dot"} />
                        {a.name}
                        <small>
                          {a.bot ? "BOT" : a.id === localId ? "VOCÊ" : "ONLINE"}
                        </small>
                      </td>
                      <td>{a.kills}</td>
                      <td>{a.deaths}</td>
                      <td>₡ {a.credits}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        ))}
      </section>
    </div>
  );
}
