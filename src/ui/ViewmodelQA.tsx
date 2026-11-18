import { useEffect, useState } from "react";
import type { Game } from "../core/Game";
import { emptyInput, type WeaponId } from "../shared/types";
import { WEAPONS } from "../shared/weapons";
import "./viewmodel-qa.css";

/** Drives the real training simulation, renderer, arms and scope for repeatable visual QA. */
export function ViewmodelQA({
  game,
  start,
}: {
  game: Game;
  start: () => Promise<void>;
}) {
  const [active, setActive] = useState(false),
    [aim, setAim] = useState(false),
    [motion, setMotion] = useState("idle");
  useEffect(
    () => () => {
      game.debugInput = undefined;
      game.input.aimHeld = false;
    },
    [game],
  );
  function equip(id: WeaponId) {
    if (!game.getLocal()?.inventory.some((g) => g.id === id)) game.buy(id);
    if (game.debugInput) game.debugInput.slot = WEAPONS[id].slot;
    game.input.inspectTime = 0;
  }
  function move(value: string) {
    setMotion(value);
    if (game.debugInput) {
      game.debugInput.z = value === "idle" ? 0 : 1;
      game.debugInput.walk = value === "walk";
      game.debugInput.crouch = value === "crouch";
    }
  }
  return (
    <aside className="viewmodel-qa" aria-label="Validação de viewmodels">
      <b>V5 / QA LOCAL</b>
      {!active ? (
        <button
          onClick={async () => {
            await start();
            game.debugInput = emptyInput();
            setActive(true);
          }}
        >
          Iniciar validação
        </button>
      ) : (
        <>
          <div>
            {(["vx47", "viper", "p9", "s1", "edge"] as WeaponId[]).map((id) => (
              <button key={id} onClick={() => equip(id)}>
                {WEAPONS[id].name}
              </button>
            ))}
          </div>
          <div>
            <button
              onClick={() => {
                if (game.debugInput) game.debugInput.fire = true;
              }}
            >
              Disparo / ataque
            </button>
            <button
              onClick={() => {
                if (game.debugInput) game.debugInput.reload = true;
              }}
            >
              Recarga
            </button>
            <button onClick={() => (game.input.inspectTime = 2.2)}>
              Inspeção
            </button>
          </div>
          <div>
            <button
              aria-pressed={aim}
              onClick={() => {
                game.input.aimHeld = !aim;
                setAim(!aim);
              }}
            >
              ADS {aim ? "soltar" : "segurar"}
            </button>
            <select
              aria-label="Locomoção QA"
              value={motion}
              onChange={(e) => move(e.target.value)}
            >
              <option value="idle">Parado</option>
              <option value="walk">Caminhar</option>
              <option value="run">Correr</option>
              <option value="crouch">Agachar</option>
            </select>
            <button
              onClick={() => {
                if (game.debugInput) game.debugInput.jump = true;
              }}
            >
              Salto
            </button>
          </div>
          <output>
            {game.weapon.id} · {game.weapon.anim.state} · FOV{" "}
            {game.camera.fov.toFixed(1)} · {Math.round(game.fps)} FPS
            <br />
            Viewmodel: {game.ads.hideViewmodel ? "oculto no scope" : "visível"}
          </output>
        </>
      )}
    </aside>
  );
}
