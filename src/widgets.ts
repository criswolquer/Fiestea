import { floatingPanel, h, icon, iconButton } from "./ui";

/* ---------- calculator ---------- */

/** Safe arithmetic evaluator (no eval): + - * / ^ %, parentheses, sqrt, sin, cos, tan, log, ln, pi, e. */
export function evaluate(expr: string): number {
  const src = expr.replace(/×/g, "*").replace(/÷/g, "/").replace(/,/g, ".").replace(/π/g, "pi").replace(/√/g, "sqrt");
  let i = 0;
  const peek = () => src[i];
  const skip = () => {
    while (src[i] === " ") i++;
  };
  function parseExpr(): number {
    let v = parseTerm();
    for (;;) {
      skip();
      if (peek() === "+") (i++, (v += parseTerm()));
      else if (peek() === "-") (i++, (v -= parseTerm()));
      else return v;
    }
  }
  function parseTerm(): number {
    let v = parseFactor();
    for (;;) {
      skip();
      if (peek() === "*") (i++, (v *= parseFactor()));
      else if (peek() === "/") (i++, (v /= parseFactor()));
      else if (peek() === "%") (i++, (v = v / 100));
      else return v;
    }
  }
  function parseFactor(): number {
    const base = parseUnary();
    skip();
    if (peek() === "^") {
      i++;
      return Math.pow(base, parseFactor());
    }
    return base;
  }
  function parseUnary(): number {
    skip();
    if (peek() === "-") return (i++, -parseUnary());
    if (peek() === "+") return (i++, parseUnary());
    return parsePrimary();
  }
  function parsePrimary(): number {
    skip();
    if (peek() === "(") {
      i++;
      const v = parseExpr();
      skip();
      if (peek() !== ")") throw new Error("Falta )");
      i++;
      return v;
    }
    const num = /^\d*\.?\d+(e[+-]?\d+)?/i.exec(src.slice(i));
    if (num) {
      i += num[0].length;
      return parseFloat(num[0]);
    }
    const id = /^[a-z]+/i.exec(src.slice(i));
    if (id) {
      i += id[0].length;
      const name = id[0].toLowerCase();
      if (name === "pi") return Math.PI;
      if (name === "e") return Math.E;
      const fns: Record<string, (x: number) => number> = {
        sqrt: Math.sqrt,
        sin: (x) => Math.sin((x * Math.PI) / 180),
        cos: (x) => Math.cos((x * Math.PI) / 180),
        tan: (x) => Math.tan((x * Math.PI) / 180),
        log: Math.log10,
        ln: Math.log,
        abs: Math.abs,
      };
      const fn = fns[name];
      if (!fn) throw new Error(`Desconocido: ${name}`);
      return fn(parsePrimary());
    }
    throw new Error("Expresión no válida");
  }
  const v = parseExpr();
  skip();
  if (i < src.length) throw new Error("Expresión no válida");
  return v;
}

export function openCalculator(): void {
  const display = h("input", { class: "calc-display", inputmode: "decimal", "aria-label": "Expresión" });
  const result = h("div", { class: "calc-result" }, "0");
  const history = h("div", { class: "calc-history" });
  const update = () => {
    try {
      const v = evaluate(display.value || "0");
      result.textContent = Number.isFinite(v) ? String(+v.toPrecision(12)) : "Error";
    } catch {
      result.textContent = "…";
    }
  };
  const press = (k: string) => {
    if (k === "C") display.value = "";
    else if (k === "⌫") display.value = display.value.slice(0, -1);
    else if (k === "=") {
      try {
        const v = +evaluate(display.value).toPrecision(12);
        history.prepend(h("div", {}, `${display.value} = ${v}`));
        display.value = String(v);
      } catch {
        result.textContent = "Error";
        return;
      }
    } else display.value += k;
    update();
  };
  display.addEventListener("input", update);
  display.addEventListener("keydown", (e) => {
    if (e.key === "Enter") press("=");
  });
  const keys = ["C", "(", ")", "⌫", "sin(", "cos(", "tan(", "^", "√(", "7", "8", "9", "÷", "π", "4", "5", "6", "×", "%", "1", "2", "3", "-", "ln(", "0", ".", "=", "+", "log("];
  const pad = h(
    "div",
    { class: "calc-pad" },
    keys.map((k) => h("button", { class: `calc-key ${k === "=" ? "eq" : /[0-9.]/.test(k) ? "num" : ""}`, type: "button", onclick: () => press(k) }, k.replace("(", ""))),
  );
  floatingPanel("Calculadora", h("div", { class: "calc" }, display, result, pad, history), { width: 300 });
  setTimeout(() => display.focus(), 30);
}

/* ---------- timer / stopwatch ---------- */

export function openTimer(): void {
  let mode: "timer" | "stopwatch" = "timer";
  let total = 25 * 60 * 1000;
  let remaining = total;
  let elapsed = 0;
  let startedAt = 0;
  let running = false;
  let raf = 0;

  const time = h("div", { class: "timer-time" });
  const fmt = (ms: number) => {
    const s = Math.max(0, Math.ceil(ms / 1000));
    const hh = Math.floor(s / 3600);
    const mm = Math.floor((s % 3600) / 60);
    const ss = s % 60;
    return `${hh ? hh + ":" : ""}${String(mm).padStart(2, "0")}:${String(ss).padStart(2, "0")}`;
  };
  const current = () => (running ? Date.now() - startedAt : 0);
  const render = () => {
    time.textContent = mode === "timer" ? fmt(remaining - current()) : fmt(elapsed + current());
    if (mode === "timer" && running && remaining - current() <= 0) {
      running = false;
      remaining = 0;
      time.textContent = "00:00";
      time.classList.add("done");
      beep();
      playBtn.replaceChildren(icon("play"));
      return;
    }
    if (running) raf = requestAnimationFrame(render);
  };
  const playBtn = iconButton("play", "Iniciar / pausar", () => {
    if (running) {
      if (mode === "timer") remaining -= current();
      else elapsed += current();
      running = false;
      cancelAnimationFrame(raf);
      playBtn.replaceChildren(icon("play"));
    } else {
      if (mode === "timer" && remaining <= 0) remaining = total;
      time.classList.remove("done");
      startedAt = Date.now();
      running = true;
      playBtn.replaceChildren(icon("pause"));
      render();
    }
  });
  const reset = () => {
    running = false;
    cancelAnimationFrame(raf);
    remaining = total;
    elapsed = 0;
    time.classList.remove("done");
    playBtn.replaceChildren(icon("play"));
    render();
  };
  const presets = h(
    "div",
    { class: "chips" },
    [5, 10, 15, 25, 45, 60].map((m) =>
      h(
        "button",
        {
          class: "chip",
          type: "button",
          onclick: () => {
            total = m * 60 * 1000;
            reset();
          },
        },
        `${m} min`,
      ),
    ),
  );
  const tabs = h(
    "div",
    { class: "seg" },
    h("button", { class: "seg-btn active", type: "button", onclick: (e: Event) => setMode("timer", e) }, "Temporizador"),
    h("button", { class: "seg-btn", type: "button", onclick: (e: Event) => setMode("stopwatch", e) }, "Cronómetro"),
  );
  function setMode(m: typeof mode, e: Event) {
    mode = m;
    tabs.querySelectorAll(".seg-btn").forEach((b) => b.classList.toggle("active", b === e.currentTarget));
    presets.style.display = m === "timer" ? "" : "none";
    reset();
  }
  const panel = floatingPanel(
    "Temporizador",
    h("div", { class: "timer" }, tabs, time, h("div", { class: "row center" }, playBtn, iconButton("undo", "Reiniciar", reset)), presets),
    { width: 280, onClose: () => cancelAnimationFrame(raf) },
  );
  void panel;
  render();
}

function beep(): void {
  try {
    const ac = new AudioContext();
    for (let k = 0; k < 3; k++) {
      const o = ac.createOscillator();
      const g = ac.createGain();
      o.frequency.value = 880;
      o.connect(g).connect(ac.destination);
      const t = ac.currentTime + k * 0.35;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.3, t + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.25);
      o.start(t);
      o.stop(t + 0.3);
    }
  } catch {
    /* audio unavailable */
  }
  if ("vibrate" in navigator) navigator.vibrate?.([200, 100, 200]);
}

/* ---------- web browser panel ---------- */

export function openBrowser(): void {
  const frame = h("iframe", { class: "web-frame", referrerpolicy: "no-referrer", sandbox: "allow-scripts allow-same-origin allow-forms allow-popups" });
  const input = h("input", { class: "input", placeholder: "Busca o escribe una dirección", enterkeyhint: "go" });
  const note = h("p", { class: "muted small" }, "Algunas webs no permiten mostrarse dentro de otra app; en ese caso usa «Abrir fuera».");
  const go = () => {
    const v = input.value.trim();
    if (!v) return;
    const url = /^https?:\/\//i.test(v)
      ? v
      : /^[\w-]+(\.[\w-]+)+(\/.*)?$/.test(v)
        ? `https://${v}`
        : `https://es.wikipedia.org/w/index.php?search=${encodeURIComponent(v)}`;
    input.value = url;
    frame.src = url;
  };
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") go();
  });
  const bar = h(
    "div",
    { class: "row" },
    input,
    h("button", { class: "btn primary", type: "button", onclick: go }, "Ir"),
    h("button", { class: "btn", type: "button", onclick: () => input.value && window.open(input.value, "_blank", "noopener") }, "Abrir fuera"),
  );
  const p = floatingPanel("Navegador", h("div", { class: "web" }, bar, note, frame), {
    width: Math.min(560, window.innerWidth - 16),
    x: 8,
    y: 80,
  });
  p.el.classList.add("resizable");
  setTimeout(() => input.focus(), 30);
}

/* ---------- tiny Markdown renderer for AI output ---------- */

function esc(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

function inline(s: string): string {
  return esc(s)
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/(^|[^*])\*([^*\s][^*]*)\*/g, "$1<em>$2</em>");
}

export function markdown(md: string): string {
  const out: string[] = [];
  let list: "ul" | "ol" | null = null;
  const close = () => {
    if (list) out.push(`</${list}>`);
    list = null;
  };
  for (const raw of md.split("\n")) {
    const line = raw.trimEnd();
    let m: RegExpExecArray | null;
    if ((m = /^(#{1,4})\s+(.*)$/.exec(line))) {
      close();
      const lvl = Math.min(4, m[1].length + 1);
      out.push(`<h${lvl}>${inline(m[2])}</h${lvl}>`);
    } else if ((m = /^\s*[-*•]\s+(.*)$/.exec(line))) {
      if (list !== "ul") (close(), out.push("<ul>"), (list = "ul"));
      out.push(`<li>${inline(m[1])}</li>`);
    } else if ((m = /^\s*\d+[.)]\s+(.*)$/.exec(line))) {
      if (list !== "ol") (close(), out.push("<ol>"), (list = "ol"));
      out.push(`<li>${inline(m[1])}</li>`);
    } else if (!line.trim()) {
      close();
    } else {
      close();
      out.push(`<p>${inline(line)}</p>`);
    }
  }
  close();
  return out.join("");
}
