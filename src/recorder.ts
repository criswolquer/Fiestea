import { db, uid } from "./db";
import type { Notebook, Recording } from "./types";
import { confirmDialog, floatingPanel, formatDate, formatDuration, h, icon, iconButton, toast } from "./ui";
import { openTextSummary } from "./aiviews";

/* Voice recording with live transcription (where the browser supports speech recognition). */

interface SpeechRecognitionLike {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  start(): void;
  stop(): void;
  onresult: ((e: { resultIndex: number; results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }> }) => void) | null;
  onend: (() => void) | null;
  onerror: ((e: { error: string }) => void) | null;
}

function speechRecognition(): SpeechRecognitionLike | null {
  const w = window as unknown as Record<string, new () => SpeechRecognitionLike>;
  const Ctor = w.SpeechRecognition ?? w.webkitSpeechRecognition;
  return Ctor ? new Ctor() : null;
}

function pickMime(): string {
  for (const t of ["audio/mp4", "audio/webm;codecs=opus", "audio/webm", "audio/ogg"]) if (MediaRecorder.isTypeSupported?.(t)) return t;
  return "";
}

export function openRecorder(nb: Notebook): void {
  let rec: MediaRecorder | null = null;
  let stream: MediaStream | null = null;
  let chunks: Blob[] = [];
  let started = 0;
  let tick = 0;
  let recognition: SpeechRecognitionLike | null = null;
  let finalText = "";
  let interim = "";

  const status = h("div", { class: "rec-status" }, "Listo para grabar");
  const live = h("div", { class: "rec-live muted small" });
  const list = h("div", { class: "rec-list" });
  const recBtn = h("button", { class: "rec-btn", type: "button", title: "Grabar", "aria-label": "Grabar" }, icon("mic"));

  recBtn.addEventListener("click", () => (rec ? stop() : start()));

  async function start() {
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
      toast("Este navegador no permite grabar audio.");
      return;
    }
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      toast("Necesito permiso para usar el micrófono.");
      return;
    }
    const mime = pickMime();
    rec = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
    chunks = [];
    finalText = "";
    interim = "";
    rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
    rec.onstop = save;
    rec.start(1000);
    started = Date.now();
    recBtn.classList.add("on");
    recBtn.replaceChildren(icon("stop"));
    tick = window.setInterval(() => (status.textContent = `● Grabando ${formatDuration((Date.now() - started) / 1000)}`), 500);

    recognition = speechRecognition();
    if (recognition) {
      recognition.lang = navigator.language || "es-ES";
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.onresult = (e) => {
        interim = "";
        for (let i = e.resultIndex; i < e.results.length; i++) {
          const r = e.results[i];
          if (r.isFinal) finalText += r[0].transcript + " ";
          else interim += r[0].transcript;
        }
        live.textContent = (finalText + interim).slice(-280);
      };
      // Safari stops recognition after silences; restart while still recording.
      recognition.onend = () => {
        if (rec && recognition) {
          try {
            recognition.start();
          } catch {
            /* already started */
          }
        }
      };
      recognition.onerror = () => {};
      try {
        recognition.start();
      } catch {
        recognition = null;
      }
    } else live.textContent = "Tu navegador no ofrece transcripción en vivo; se guardará solo el audio.";
  }

  function stop() {
    const r = recognition;
    recognition = null;
    r?.stop();
    rec?.stop();
    stream?.getTracks().forEach((t) => t.stop());
    clearInterval(tick);
    recBtn.classList.remove("on");
    recBtn.replaceChildren(icon("mic"));
    status.textContent = "Listo para grabar";
  }

  async function save() {
    const blob = new Blob(chunks, { type: rec?.mimeType || "audio/webm" });
    rec = null;
    const blobId = uid();
    await db.blobs.put(blobId, blob);
    const r: Recording = {
      id: uid(),
      notebookId: nb.id,
      blobId,
      duration: (Date.now() - started) / 1000,
      transcript: (finalText + interim).trim(),
      createdAt: Date.now(),
    };
    await db.recordings.put(r);
    live.textContent = "";
    toast("Grabación guardada");
    refresh();
  }

  async function refresh() {
    const recs = (await db.recordings.ofNotebook(nb.id)).sort((a, b) => b.createdAt - a.createdAt);
    list.replaceChildren();
    if (!recs.length) list.append(h("p", { class: "muted small" }, "Sin grabaciones en este cuaderno."));
    for (const r of recs) {
      const audio = h("audio", { controls: true, preload: "none" });
      db.blobs.get(r.blobId).then((b) => b && (audio.src = URL.createObjectURL(b)));
      const transcript = h("textarea", { class: "input small", rows: 3, placeholder: "Transcripción (puedes escribirla o corregirla)" });
      transcript.value = r.transcript;
      transcript.addEventListener("change", async () => {
        r.transcript = transcript.value;
        await db.recordings.put(r);
      });
      list.append(
        h(
          "div",
          { class: "rec-item" },
          h("div", { class: "row between" }, h("strong", {}, `${formatDate(r.createdAt)} · ${formatDuration(r.duration)}`), h("div", { class: "row" },
            iconButton("sparkle", "Resumir con IA", () => {
              if (transcript.value.trim().length < 40) return toast("La transcripción está vacía o es muy corta.");
              openTextSummary(nb, transcript.value, "transcripcion");
            }),
            iconButton("trash", "Eliminar", async () => {
              if (!(await confirmDialog("Eliminar grabación", "¿Seguro?", "Eliminar", true))) return;
              await db.recordings.delete(r.id);
              await db.blobs.delete(r.blobId);
              refresh();
            }),
          )),
          audio,
          transcript,
        ),
      );
    }
  }

  floatingPanel("Grabación de voz", h("div", { class: "rec" }, h("div", { class: "row" }, recBtn, status), live, list), {
    width: 340,
    onClose: () => rec && stop(),
  });
  refresh();
}
