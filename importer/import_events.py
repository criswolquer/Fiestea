#!/usr/bin/env python3
"""
Fiestea · Importador automático de fiestas con IA
=================================================

Qué hace cada vez que se ejecuta:
  1. Elige unas cuantas provincias (rota por toda España día a día).
  2. Para cada provincia, pide a Claude que BUSQUE EN INTERNET, en dos pasadas:
     - fiestas patronales, ferias, verbenas, festivales…
     - ocio nocturno: fiestas de discoteca, sesiones DJ, fiestas temáticas, salas…
     y las devuelva en JSON.
  3. Sitúa cada fiesta en el mapa (OpenStreetMap / Nominatim).
  4. Quita duplicados y las guarda en Supabase (si ya existía, la actualiza).
  5. Borra de la base de datos las fiestas que ya terminaron.

Variables de entorno:
  ANTHROPIC_API_KEY      (obligatoria) clave de la API de Claude
  SUPABASE_URL           (obligatoria salvo --dry-run) p. ej. https://xxxx.supabase.co
  SUPABASE_SERVICE_KEY   (obligatoria salvo --dry-run) clave "service_role" de Supabase
  CLAUDE_MODEL           (opcional) por defecto claude-sonnet-5
  PROVINCES              (opcional) lista separada por comas; si se da, procesa solo esas
  PROVINCES_PER_RUN      (opcional) cuántas provincias por ejecución en modo rotación (def. 10)
  DAYS_AHEAD             (opcional) cuántos días hacia delante buscar (def. 21)
  CONTACT_EMAIL          (opcional) se envía a Nominatim como contacto (lo piden sus normas)
  SEARCH_FOCUSES         (opcional) "fiestas,noche" (def.). "fiestas" = patronales, ferias, verbenas…;
                         "noche" = discotecas, sesiones DJ, fiestas temáticas, salas

Uso:
  python import_events.py                    # ejecución normal
  python import_events.py --dry-run          # no escribe en Supabase, imprime el resultado
  python import_events.py --provinces "Zamora,León"
"""

from __future__ import annotations

import argparse
import datetime as dt
import json
import os
import re
import sys
import time
import unicodedata
from dataclasses import dataclass, field

import requests

# ---------------------------------------------------------------------------
# Configuración
# ---------------------------------------------------------------------------

PROVINCIAS = [
    "A Coruña", "Álava", "Albacete", "Alicante", "Almería", "Asturias", "Ávila", "Badajoz",
    "Barcelona", "Bizkaia", "Burgos", "Cáceres", "Cádiz", "Cantabria", "Castellón", "Ciudad Real",
    "Córdoba", "Cuenca", "Gipuzkoa", "Girona", "Granada", "Guadalajara", "Huelva", "Huesca",
    "Illes Balears", "Jaén", "La Rioja", "Las Palmas", "León", "Lleida", "Lugo", "Madrid",
    "Málaga", "Murcia", "Navarra", "Ourense", "Palencia", "Pontevedra", "Salamanca",
    "Santa Cruz de Tenerife", "Segovia", "Sevilla", "Soria", "Tarragona", "Teruel", "Toledo",
    "Valencia", "Valladolid", "Zamora", "Zaragoza", "Ceuta", "Melilla",
]

CATEGORIAS = {"FIESTA_PUEBLO", "FERIA", "CONCIERTO", "CLUB", "FESTIVAL", "QUEDADA"}

# Caja aproximada que contiene España (península, Baleares, Canarias, Ceuta y Melilla)
SPAIN_BBOX = (27.4, 44.0, -18.5, 4.6)  # lat_min, lat_max, lon_min, lon_max

MAX_EVENTS_PER_PROVINCE = 25


def env(name: str, default: str | None = None) -> str | None:
    v = os.environ.get(name, "").strip()
    return v or default


# ---------------------------------------------------------------------------
# Utilidades
# ---------------------------------------------------------------------------

def slug(text: str) -> str:
    text = unicodedata.normalize("NFKD", text or "").encode("ascii", "ignore").decode()
    text = re.sub(r"[^a-z0-9]+", "-", text.lower()).strip("-")
    # Quitamos palabras de relleno para que "Fiestas de San Roque 2026" ≈ "Fiesta San Roque"
    stop = {"de", "del", "la", "las", "el", "los", "en", "y", "fiesta", "fiestas", "the"}
    words = [w for w in text.split("-") if w and w not in stop and not re.fullmatch(r"20\d\d", w)]
    return "-".join(words)


def dedupe_key(title: str, town: str, start_date: str) -> str:
    return f"{slug(title)}|{slug(town)}|{start_date}"


def provinces_for_today(per_run: int, today: dt.date) -> list[str]:
    n = len(PROVINCIAS)
    per_run = max(1, min(per_run, n))
    start = (today.toordinal() * per_run) % n
    return [PROVINCIAS[(start + i) % n] for i in range(per_run)]


def log(*args):
    print(*args, file=sys.stderr, flush=True)


# ---------------------------------------------------------------------------
# 1) Buscar con Claude + búsqueda web
# ---------------------------------------------------------------------------

SYSTEM_PROMPT = """Eres el buscador de fiestas de la app Fiestea. Tu trabajo es encontrar en internet \
fiestas y eventos festivos REALES y CONFIRMADOS en una provincia de España y devolverlos como datos estructurados.

Reglas:
- Usa la búsqueda web. Prioriza fuentes oficiales: webs de ayuntamientos, diputaciones, oficinas de turismo, \
programas de fiestas, prensa local y agendas culturales.
- Incluye solo eventos con fechas concretas publicadas dentro del periodo pedido. Si no estás seguro de la fecha, NO lo incluyas.
- Nunca inventes datos. Si un campo no aparece en la fuente, déjalo vacío o null.
- Cada evento debe tener la URL de la página donde lo has comprobado (source_url).
- Una fiesta de varios días es UN solo evento con start_date y end_date.
- No incluyas eventos cancelados, eventos ya terminados, ni eventos privados.
"""

RESPONSE_FORMAT = """Devuelve como máximo {max_eventos} eventos, los más relevantes. Responde al final EXCLUSIVAMENTE con un bloque así:

<json>
[
  {{
    "title": "Nombre del evento",
    "description": "Resumen breve y atractivo (máx. 300 caracteres): artistas, DJs, actividades destacadas…",
    "category": "FIESTA_PUEBLO | FERIA | CONCIERTO | CLUB | FESTIVAL | QUEDADA",
    "town": "Municipio",
    "venue": "Lugar (Plaza Mayor, recinto ferial, nombre de la discoteca o sala…) o vacío",
    "address": "Dirección si aparece, o vacío",
    "start_date": "AAAA-MM-DD",
    "end_date": "AAAA-MM-DD o null si es un solo día",
    "start_time": "HH:MM o null si no se sabe",
    "end_time": "HH:MM o null",
    "price_eur": 0,
    "organizer": "Ayuntamiento, promotora, discoteca… o vacío",
    "source_url": "https://…"
  }}
]
</json>

Si no encuentras nada fiable, devuelve <json>[]</json>."""

# Cada provincia se busca con estos dos enfoques (dos consultas distintas a la IA)
SEARCH_FOCUSES = {
    "fiestas": """Busca fiestas en la provincia de {provincia} (España) que se celebren entre el {desde} y el {hasta}.

Qué buscar: fiestas patronales y de pueblo, ferias, verbenas, romerías, fiestas populares, \
festivales de música y conciertos de fiestas. Busca tanto en la capital como en los pueblos. \
Haz varias búsquedas distintas (por ejemplo "fiestas patronales {mes} {provincia}", \
"ferias {provincia} {anio}", "programa de fiestas {mes} {anio} {provincia}").

""",
    "noche": """Busca planes de ocio nocturno en la provincia de {provincia} (España) entre el {desde} y el {hasta}.

Qué buscar: fiestas de discoteca, sesiones de DJ, fiestas temáticas (años 80/90/2000, reguetón, \
techno, remember…), fiestas universitarias, noches especiales en salas y clubs, fiestas de \
Halloween/Nochevieja u otras fechas señaladas si caen en el periodo, y conciertos en salas. \
Céntrate en la capital y las ciudades con más vida nocturna de la provincia. Busca en webs de \
discotecas y salas, venta de entradas (Fourvenues, Entradas.com, Ticketmaster, Dice, Xceed…), \
agendas de ocio y prensa local. Haz varias búsquedas distintas (por ejemplo \
"fiesta discoteca {provincia} {mes} {anio}", "sesión DJ {provincia} {mes}", "entradas fiesta {provincia} este fin de semana").

Usa la categoría CLUB para fiestas de discoteca y sesiones de DJ, y CONCIERTO para conciertos en salas. \
Incluye solo eventos con fecha concreta; no incluyas la apertura habitual de un local sin evento especial.

""",
}


def ask_claude(client, model: str, provincia: str, desde: dt.date, hasta: dt.date,
               focus: str = "fiestas") -> list[dict]:
    meses = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto",
             "septiembre", "octubre", "noviembre", "diciembre"]
    prompt = (SEARCH_FOCUSES[focus] + RESPONSE_FORMAT).format(
        provincia=provincia, desde=desde.isoformat(), hasta=hasta.isoformat(),
        mes=meses[desde.month - 1], anio=desde.year, max_eventos=MAX_EVENTS_PER_PROVINCE,
    )
    messages = [{"role": "user", "content": prompt}]
    tools = [{"type": "web_search_20250305", "name": "web_search", "max_uses": 8,
              "user_location": {"type": "approximate", "country": "ES"}}]

    text_parts: list[str] = []
    assistant_so_far: list = []
    for _ in range(4):  # la búsqueda web puede "pausar" el turno; lo continuamos
        resp = client.messages.create(
            model=model, max_tokens=8000, system=SYSTEM_PROMPT, tools=tools, messages=messages,
        )
        text_parts += [b.text for b in resp.content if getattr(b, "type", "") == "text"]
        if resp.stop_reason == "pause_turn":
            assistant_so_far += list(resp.content)
            messages = [messages[0], {"role": "assistant", "content": assistant_so_far}]
            continue
        break

    return parse_events_json("\n".join(text_parts))


def parse_events_json(text: str) -> list[dict]:
    m = re.search(r"<json>\s*(.*?)\s*</json>", text, re.S)
    raw = m.group(1) if m else None
    if raw is None:  # plan B: primer array JSON que aparezca
        m2 = re.search(r"\[\s*(?:\{.*\}\s*)?\]", text, re.S)
        raw = m2.group(0) if m2 else "[]"
    raw = re.sub(r"^```(?:json)?|```$", "", raw.strip(), flags=re.M).strip()
    try:
        data = json.loads(raw)
    except json.JSONDecodeError:
        log("  ! No se pudo leer el JSON de la respuesta")
        return []
    return data if isinstance(data, list) else []


# ---------------------------------------------------------------------------
# 2) Validar y normalizar
# ---------------------------------------------------------------------------

@dataclass
class CleanEvent:
    title: str
    description: str
    category: str
    town: str
    province: str
    venue: str
    address: str
    start_at: dt.datetime
    end_at: dt.datetime | None
    price_eur: float
    organizer: str
    source_url: str
    lat: float = 0.0
    lon: float = 0.0
    key: str = field(default="")


def _date(v) -> dt.date | None:
    try:
        return dt.date.fromisoformat(str(v)[:10]) if v else None
    except ValueError:
        return None


def _time(v) -> dt.time | None:
    if not v:
        return None
    m = re.match(r"^(\d{1,2}):(\d{2})", str(v))
    if not m:
        return None
    h, mi = int(m.group(1)), int(m.group(2))
    return dt.time(h, mi) if h < 24 and mi < 60 else None


def clean(raw: dict, provincia: str, desde: dt.date, hasta: dt.date) -> CleanEvent | None:
    title = str(raw.get("title") or "").strip()
    town = str(raw.get("town") or "").strip()
    source = str(raw.get("source_url") or "").strip()
    start_d = _date(raw.get("start_date"))
    if not title or not town or not start_d or not source.startswith("http"):
        return None
    end_d = _date(raw.get("end_date"))
    if end_d and end_d < start_d:
        end_d = None
    # Debe tocar el periodo buscado (con margen de un día)
    last_day = end_d or start_d
    if last_day < desde - dt.timedelta(days=1) or start_d > hasta + dt.timedelta(days=1):
        return None
    # Descarta cosas absurdas (p. ej. "fiesta" de 3 meses)
    if end_d and (end_d - start_d).days > 20:
        return None

    st = _time(raw.get("start_time"))
    et = _time(raw.get("end_time"))
    start_at = dt.datetime.combine(start_d, st or dt.time(12, 0))
    if end_d:
        end_at = dt.datetime.combine(end_d, et or dt.time(23, 59))
    elif et:
        end_at = dt.datetime.combine(start_d, et)
        if end_at <= start_at:  # 22:00 → 03:00 = día siguiente
            end_at += dt.timedelta(days=1)
    else:
        end_at = None if st else dt.datetime.combine(start_d, dt.time(23, 59))

    category = str(raw.get("category") or "").upper().strip()
    if category not in CATEGORIAS:
        category = "FIESTA_PUEBLO"
    try:
        price = max(0.0, float(str(raw.get("price_eur") or 0).replace("€", "").replace(",", ".").strip()))
    except (TypeError, ValueError):
        price = 0.0

    ev = CleanEvent(
        title=title[:120], description=str(raw.get("description") or "").strip()[:500],
        category=category, town=town[:80], province=provincia,
        venue=str(raw.get("venue") or "").strip()[:120], address=str(raw.get("address") or "").strip()[:200],
        start_at=start_at, end_at=end_at, price_eur=round(price, 2),
        organizer=str(raw.get("organizer") or "").strip()[:120], source_url=source[:500],
    )
    ev.key = dedupe_key(ev.title, ev.town, start_d.isoformat())
    return ev


# ---------------------------------------------------------------------------
# 3) Geocodificar con Nominatim (OpenStreetMap)
# ---------------------------------------------------------------------------

class Geocoder:
    URL = "https://nominatim.openstreetmap.org/search"

    def __init__(self, contact: str | None):
        self.cache: dict[str, tuple[float, float] | None] = {}
        self.headers = {"User-Agent": f"FiesteaImporter/1.0 ({contact or 'sin-contacto'})"}
        self.last = 0.0

    def _query(self, q: str) -> tuple[float, float] | None:
        if q in self.cache:
            return self.cache[q]
        wait = 1.1 - (time.time() - self.last)  # Nominatim: máximo 1 petición por segundo
        if wait > 0:
            time.sleep(wait)
        self.last = time.time()
        try:
            r = requests.get(self.URL, params={"q": q, "format": "json", "limit": 1, "countrycodes": "es"},
                             headers=self.headers, timeout=20)
            r.raise_for_status()
            res = r.json()
            point = (float(res[0]["lat"]), float(res[0]["lon"])) if res else None
        except Exception as e:  # noqa: BLE001
            log(f"  ! Geocodificación falló para '{q}': {e}")
            point = None
        if point:
            lat, lon = point
            la0, la1, lo0, lo1 = SPAIN_BBOX
            if not (la0 <= lat <= la1 and lo0 <= lon <= lo1):
                point = None
        self.cache[q] = point
        return point

    def locate(self, ev: CleanEvent) -> tuple[float, float] | None:
        attempts = []
        if ev.venue:
            attempts.append(f"{ev.venue}, {ev.town}, {ev.province}")
        if ev.address:
            attempts.append(f"{ev.address}, {ev.town}, {ev.province}")
        attempts.append(f"{ev.town}, {ev.province}")
        for q in attempts:
            p = self._query(q)
            if p:
                return p
        return None


# ---------------------------------------------------------------------------
# 4) Supabase
# ---------------------------------------------------------------------------

class Supabase:
    def __init__(self, url: str, service_key: str):
        self.base = url.rstrip("/") + "/rest/v1"
        self.h = {"apikey": service_key, "Authorization": f"Bearer {service_key}",
                  "Content-Type": "application/json"}

    def upsert(self, rows: list[dict]) -> None:
        for i in range(0, len(rows), 200):
            r = requests.post(
                f"{self.base}/events?on_conflict=dedupe_key",
                headers={**self.h, "Prefer": "resolution=merge-duplicates,return=minimal"},
                data=json.dumps(rows[i:i + 200]), timeout=30,
            )
            if r.status_code >= 300:
                raise RuntimeError(f"Supabase upsert {r.status_code}: {r.text}")

    def delete_finished(self, now: dt.datetime) -> None:
        cutoff = (now - dt.timedelta(days=2)).replace(microsecond=0).isoformat()
        flt = f'(end_at.lt."{cutoff}",and(end_at.is.null,start_at.lt."{cutoff}"))'
        r = requests.delete(f"{self.base}/events", params={"or": flt},
                            headers={**self.h, "Prefer": "return=minimal"}, timeout=30)
        if r.status_code >= 300:
            raise RuntimeError(f"Supabase delete {r.status_code}: {r.text}")


def to_row(ev: CleanEvent) -> dict:
    return {
        "dedupe_key": ev.key, "title": ev.title, "description": ev.description,
        "category": ev.category, "start_at": ev.start_at.isoformat(),
        "end_at": ev.end_at.isoformat() if ev.end_at else None,
        "venue": ev.venue, "address": ev.address, "town": ev.town, "province": ev.province,
        "lat": round(ev.lat, 6), "lon": round(ev.lon, 6), "price_eur": ev.price_eur,
        "organizer": ev.organizer, "source_url": ev.source_url, "origin": "ai",
    }


# ---------------------------------------------------------------------------
# Programa principal
# ---------------------------------------------------------------------------

def main() -> int:
    ap = argparse.ArgumentParser(description="Importador automático de fiestas con IA")
    ap.add_argument("--dry-run", action="store_true", help="no escribe en Supabase; imprime el JSON")
    ap.add_argument("--provinces", help="lista separada por comas (anula la rotación)")
    args = ap.parse_args()

    api_key = env("ANTHROPIC_API_KEY")
    if not api_key:
        log("Falta ANTHROPIC_API_KEY")
        return 2
    sb = None
    if not args.dry_run:
        url, key = env("SUPABASE_URL"), env("SUPABASE_SERVICE_KEY")
        if not url or not key:
            log("Faltan SUPABASE_URL / SUPABASE_SERVICE_KEY (o usa --dry-run)")
            return 2
        sb = Supabase(url, key)

    import anthropic  # importado aquí para que --help funcione sin la librería
    client = anthropic.Anthropic(api_key=api_key)
    model = env("CLAUDE_MODEL", "claude-sonnet-5")

    today = dt.date.today()
    desde, hasta = today, today + dt.timedelta(days=int(env("DAYS_AHEAD", "21")))
    chosen = args.provinces or env("PROVINCES")
    provincias = [p.strip() for p in chosen.split(",") if p.strip()] if chosen else \
        provinces_for_today(int(env("PROVINCES_PER_RUN", "10")), today)

    focuses = [f.strip() for f in (env("SEARCH_FOCUSES", "fiestas,noche") or "").split(",")
               if f.strip() in SEARCH_FOCUSES] or ["fiestas"]
    log(f"Buscando ({', '.join(focuses)}) del {desde} al {hasta} en: {', '.join(provincias)}")
    geo = Geocoder(env("CONTACT_EMAIL"))
    all_rows: dict[str, dict] = {}
    failures = 0

    for prov in provincias:
        log(f"\n→ {prov}")
        raw: list = []
        errors = 0
        for focus in focuses:
            try:
                found = ask_claude(client, model, prov, desde, hasta, focus)
                log(f"  [{focus}] {len(found)} candidatos")
                raw += found
            except Exception as e:  # noqa: BLE001
                errors += 1
                log(f"  ! Error consultando a Claude ({focus}): {e}")
        if errors == len(focuses):
            failures += 1
            continue
        log(f"  {len(raw)} candidatos")
        ok = 0
        for item in raw[:MAX_EVENTS_PER_PROVINCE * len(focuses)]:
            if not isinstance(item, dict):
                continue
            ev = clean(item, prov, desde, hasta)
            if not ev or ev.key in all_rows:
                continue
            point = geo.locate(ev)
            if not point:
                log(f"  - Sin ubicación: {ev.title} ({ev.town})")
                continue
            ev.lat, ev.lon = point
            all_rows[ev.key] = to_row(ev)
            ok += 1
            log(f"  + {ev.start_at:%d/%m} {ev.title} — {ev.town}")
        log(f"  {ok} válidos")

    rows = list(all_rows.values())
    log(f"\nTotal: {len(rows)} eventos")

    if args.dry_run:
        print(json.dumps(rows, ensure_ascii=False, indent=2))
        return 0

    if rows:
        sb.upsert(rows)
        log("Guardados en Supabase ✔")
    sb.delete_finished(dt.datetime.now())
    log("Fiestas terminadas eliminadas ✔")
    # Falla la ejecución solo si no ha funcionado ninguna provincia
    return 1 if failures == len(provincias) else 0


if __name__ == "__main__":
    sys.exit(main())
