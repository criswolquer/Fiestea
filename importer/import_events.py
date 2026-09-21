#!/usr/bin/env python3
"""
Fiestea · Importador automático de fiestas con IA
=================================================

Qué hace cada vez que se ejecuta:
  1. Elige unas cuantas provincias (rota por toda España día a día).
  2. Para cada provincia, pide a Claude que BUSQUE EN INTERNET (por defecto, ocio nocturno):
     - discotecas y clubs: la programación de cada local y las webs de entradas
     - noche: fiestas temáticas, universitarias, salas y conciertos
     - (opcional) fiestas populares y fiestas de pueblos
     y las devuelva en JSON.
  3b. Saca la foto/cartel de cada fiesta de su página de origen.
  3. Sitúa cada fiesta en el mapa (OpenStreetMap / Nominatim).
  4. Quita duplicados y las guarda en Supabase (si ya existía, la actualiza).
  5. Borra de la base de datos las fiestas que ya terminaron.

Variables de entorno:
  ANTHROPIC_API_KEY      (obligatoria) clave de la API de Claude
  SUPABASE_URL           (obligatoria salvo --dry-run) p. ej. https://xxxx.supabase.co
  SUPABASE_SERVICE_KEY   (obligatoria salvo --dry-run) clave "service_role" de Supabase
  CLAUDE_MODEL           (opcional) por defecto claude-haiku-4-5-20251001 (barato); más preciso: claude-sonnet-5
  MAX_SEARCHES           (opcional) máximo de búsquedas web por consulta (menos = más barato)
  PROVINCES              (opcional) lista separada por comas; si se da, procesa solo esas
  PROVINCES_PER_RUN      (opcional) cuántas provincias por ejecución en modo rotación (def. 3)
  DAYS_AHEAD             (opcional) cuántos días hacia delante buscar (def. 21)
  CONTACT_EMAIL          (opcional) se envía a Nominatim como contacto (lo piden sus normas)
  SEARCH_FOCUSES         (opcional) "discotecas,noche" (def.). Opciones:
                         "discotecas" = programación de cada discoteca/club + webs de entradas;
                         "noche" = fiestas temáticas, universitarias, salas y conciertos;
                         "fiestas" = agendas oficiales, fiestas de capital y ciudades grandes;
                         "pueblos" = fiestas de pueblos pequeños, comarca por comarca

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
from html import unescape
from urllib.parse import urljoin

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

MAX_EVENTS_PER_PROVINCE = 30


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
    "source_url": "https://…",
    "image_url": "URL de la imagen o cartel del evento si la has visto en la fuente, o null"
  }}
]
</json>

Si no encuentras nada fiable, devuelve <json>[]</json>."""

# Enfoques de búsqueda: cada uno es una consulta distinta a la IA por provincia.
# "discotecas" y "noche" cubren el ocio nocturno; "fiestas" y "pueblos", las fiestas populares.
SEARCH_FOCUSES = {
    "fiestas": """Busca fiestas en la provincia de {provincia} (España) que se celebren entre el {desde} y el {hasta}.

Qué buscar: fiestas patronales, ferias, verbenas, romerías, fiestas populares, festivales de música \
y conciertos de fiestas, en la capital y en las ciudades grandes de la provincia.

Empieza por las AGENDAS OFICIALES, que reúnen muchos eventos juntos: agenda de la diputación provincial, \
web de turismo de la provincia y de la comunidad autónoma, agenda cultural del ayuntamiento de la capital \
y de las ciudades principales. Luego completa con prensa local. Haz varias búsquedas distintas \
(por ejemplo "agenda {provincia} {mes} {anio}", "fiestas patronales {mes} {provincia}", \
"ferias {provincia} {anio}", "programa de fiestas {mes} {anio} {provincia}").

""",
    "pueblos": """Busca fiestas de PUEBLOS PEQUEÑOS en la provincia de {provincia} (España) entre el {desde} y el {hasta}.

Primero piensa qué comarcas tiene la provincia de {provincia}. Después busca comarca por comarca \
(por ejemplo "fiestas {mes} {anio} <comarca>", "feria <pueblo> {anio}", "romería <comarca> {mes}"), \
cubriendo el mayor número posible de comarcas distintas. Busca fiestas patronales, ferias de pueblo, \
romerías, verbenas, fiestas de la vendimia, de la cosecha y fiestas tradicionales. \
NO incluyas la capital de la provincia (ya se busca aparte): céntrate en municipios pequeños y medianos. \
Las webs de los ayuntamientos pequeños y la prensa comarcal suelen tener el programa de fiestas.

""",
    "discotecas": """Busca la programación de DISCOTECAS, CLUBS y SALAS de la provincia de {provincia} (España) \
entre el {desde} y el {hasta}.

Paso 1: averigua cuáles son las discotecas, clubs y salas de fiesta más conocidas de {provincia} \
(capital, zonas de costa u ocio y ciudades grandes).
Paso 2: busca las fiestas y sesiones concretas de cada una en esas fechas: su web, y sobre todo las webs de \
venta de entradas (Fourvenues, Xceed, Dice, Entradium, Ticketmaster, Entradas.com, Wegow…), donde cada fiesta \
tiene su página con fecha, hora, precio y cartel. Busca por ejemplo "<discoteca> entradas {mes} {anio}", \
"fourvenues {provincia}", "xceed {provincia} {mes}".

Incluye: sesiones de DJ, fiestas temáticas (reguetón, techno, house, remember, años 80/90/2000, latino…), \
fiestas universitarias, fiestas de apertura o cierre de temporada, artistas invitados y fiestas en fechas señaladas.
No incluyas la apertura normal de un local sin una fiesta concreta. Usa la categoría CLUB.
Como venue pon el nombre de la discoteca o sala. En price_eur pon el precio más barato de la entrada \
anticipada si aparece (0 si es gratis o no se sabe).

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

# Cuántas búsquedas web puede hacer la IA en cada enfoque (más búsquedas = más fiestas, pero más coste)
# (cada búsqueda añade páginas que la IA lee y se cobran; se puede limitar con la variable MAX_SEARCHES)
SEARCHES_PER_FOCUS = {"fiestas": 5, "pueblos": 6, "discotecas": 6, "noche": 4}

# Precios aproximados en $ por millón de tokens (entrada, salida) y por búsqueda web.
# Solo sirven para enseñar una estimación del coste al final; el dato real está en la consola de Anthropic.
PRICES = {"haiku": (1.0, 5.0), "sonnet": (3.0, 15.0), "opus": (5.0, 25.0)}
PRICE_PER_SEARCH = 0.01
USAGE = {"input": 0, "output": 0, "searches": 0}


class OutOfCredit(Exception):
    """Se ha acabado el saldo de la API de Anthropic."""


def estimated_cost(model: str) -> float:
    tier = next((k for k in PRICES if k in model), "sonnet")
    pin, pout = PRICES[tier]
    return USAGE["input"] / 1e6 * pin + USAGE["output"] / 1e6 * pout + USAGE["searches"] * PRICE_PER_SEARCH
# Por defecto: ocio nocturno. Para añadir fiestas populares: SEARCH_FOCUSES=discotecas,noche,fiestas,pueblos
DEFAULT_FOCUSES = "discotecas,noche"


def ask_claude(client, model: str, provincia: str, desde: dt.date, hasta: dt.date,
               focus: str = "fiestas") -> list[dict]:
    meses = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto",
             "septiembre", "octubre", "noviembre", "diciembre"]
    prompt = (SEARCH_FOCUSES[focus] + RESPONSE_FORMAT).format(
        provincia=provincia, desde=desde.isoformat(), hasta=hasta.isoformat(),
        mes=meses[desde.month - 1], anio=desde.year, max_eventos=MAX_EVENTS_PER_PROVINCE,
    )
    messages = [{"role": "user", "content": prompt}]
    tools = [{"type": "web_search_20250305", "name": "web_search",
              "max_uses": min(SEARCHES_PER_FOCUS.get(focus, 5), int(env("MAX_SEARCHES", "99"))),
              "user_location": {"type": "approximate", "country": "ES"}}]

    text_parts: list[str] = []
    assistant_so_far: list = []
    for _ in range(4):  # la búsqueda web puede "pausar" el turno; lo continuamos
        try:
            resp = client.messages.create(
                model=model, max_tokens=12000, system=SYSTEM_PROMPT, tools=tools, messages=messages,
            )
        except Exception as e:  # noqa: BLE001
            if "credit balance" in str(e).lower():
                raise OutOfCredit() from e
            raise
        u = getattr(resp, "usage", None)
        if u is not None:
            USAGE["input"] += (getattr(u, "input_tokens", 0) or 0) + (getattr(u, "cache_read_input_tokens", 0) or 0) \
                + (getattr(u, "cache_creation_input_tokens", 0) or 0)
            USAGE["output"] += getattr(u, "output_tokens", 0) or 0
            stu = getattr(u, "server_tool_use", None)
            USAGE["searches"] += (getattr(stu, "web_search_requests", 0) or 0) if stu is not None else 0
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
    image_hint: str | None = None  # imagen que dice haber visto la IA (respaldo)
    image_url: str | None = None


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
    hint = str(raw.get("image_url") or "").strip()
    ev.image_hint = hint if hint.startswith("http") else None
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
# 3b) Fotos: el cartel o imagen principal de la página de origen
# ---------------------------------------------------------------------------

_META_PATTERNS = [
    # <meta property="og:image" content="..."> (en cualquier orden de atributos)
    r'<meta[^>]+(?:property|name)=["\'](?:og:image:secure_url|og:image|twitter:image(?::src)?)["\'][^>]*content=["\']([^"\']+)["\']',
    r'<meta[^>]+content=["\']([^"\']+)["\'][^>]*(?:property|name)=["\'](?:og:image:secure_url|og:image|twitter:image(?::src)?)["\']',
    r'<link[^>]+rel=["\']image_src["\'][^>]*href=["\']([^"\']+)["\']',
]
_BAD_IMAGE = re.compile(r"(favicon|logo[-_.]|/logo|sprite|placeholder|default[-_]?image|blank\.)", re.I)


def extract_image(html: str, page_url: str) -> str | None:
    """Devuelve la imagen principal declarada por la página (og:image, twitter:image…)."""
    for pat in _META_PATTERNS:
        for m in re.finditer(pat, html, re.I):
            url = urljoin(page_url, unescape(m.group(1).strip()))
            if not url.startswith("http"):
                continue
            path = url.split("?")[0].lower()
            if path.endswith((".svg", ".ico")) or _BAD_IMAGE.search(path):
                continue
            return url
    return None


class ImageFinder:
    """Descarga la página de origen de cada fiesta (una vez) y saca su imagen principal."""

    def __init__(self):
        self.cache: dict[str, str | None] = {}
        self.headers = {
            "User-Agent": "Mozilla/5.0 (compatible; FiesteaBot/1.0; +https://github.com)",
            "Accept": "text/html,application/xhtml+xml",
            "Accept-Language": "es-ES,es;q=0.9",
        }

    def find(self, ev: CleanEvent) -> str | None:
        url = ev.source_url
        if url not in self.cache:
            self.cache[url] = self._from_page(url)
        return self.cache[url] or self._valid_hint(ev.image_hint)

    def _from_page(self, url: str) -> str | None:
        try:
            with requests.get(url, headers=self.headers, timeout=12, stream=True) as r:
                if r.status_code >= 400 or "html" not in r.headers.get("Content-Type", "html"):
                    return None
                chunks, size = [], 0
                for chunk in r.iter_content(65536):
                    chunks.append(chunk)
                    size += len(chunk)
                    if size > 700_000:  # la imagen va en el <head>; no hace falta la página entera
                        break
                html = b"".join(chunks).decode(r.encoding or "utf-8", errors="ignore")
            return extract_image(html, url)
        except Exception:  # noqa: BLE001
            return None

    @staticmethod
    def _valid_hint(hint: str | None) -> str | None:
        if not hint or _BAD_IMAGE.search(hint):
            return None
        return hint if re.search(r"\.(jpe?g|png|webp|gif)(\?|$)", hint, re.I) else None


# ---------------------------------------------------------------------------
# 4) Supabase
# ---------------------------------------------------------------------------

def normalize_supabase_url(raw: str) -> str | None:
    """Acepta la dirección aunque se haya pegado con errores típicos:
    comillas, espacios, 'supabase.url=...', sin https://, con barra final
    o solo el código del proyecto. Devuelve https://xxxx.supabase.co o None."""
    s = (raw or "").strip().strip('"').strip("'").strip()
    m = re.search(r"https?://[A-Za-z0-9.-]+", s)
    if m:
        return m.group(0).replace("http://", "https://", 1)
    m = re.search(r"([a-z0-9]{15,30})\.supabase\.co", s)
    if m:
        return f"https://{m.group(1)}.supabase.co"
    m = re.fullmatch(r"[a-z0-9]{15,30}", s)
    if m:
        return f"https://{s}.supabase.co"
    return None


def clean_key(raw: str) -> str:
    """Quita comillas, espacios y saltos de línea que se cuelan al pegar la llave."""
    s = (raw or "").strip().strip('"').strip("'").strip()
    if "=" in s and s.split("=", 1)[0].lower().startswith(("supabase", "service")):
        s = s.split("=", 1)[1].strip()
    return re.sub(r"\s+", "", s)


class Supabase:
    def __init__(self, url: str, service_key: str):
        self.base = url.rstrip("/") + "/rest/v1"
        self.h = {"apikey": service_key, "Authorization": f"Bearer {service_key}",
                  "Content-Type": "application/json"}

    def check(self) -> str | None:
        """Prueba la conexión antes de gastar saldo en la IA. Devuelve un mensaje de error o None."""
        try:
            r = requests.get(f"{self.base}/events", params={"select": "id", "limit": "1"},
                             headers=self.h, timeout=20)
        except Exception as e:  # noqa: BLE001
            return f"No se puede conectar con Supabase ({type(e).__name__}). Revisa el secreto SUPABASE_URL."
        if r.status_code in (401, 403):
            return ("Supabase rechaza la llave. Revisa que SUPABASE_SERVICE_KEY sea la clave "
                    "'service_role' (pestaña Legacy API keys), completa y sin espacios.")
        if r.status_code == 404:
            return ("No existe la tabla 'events'. Ejecuta supabase/schema.sql en el SQL Editor de Supabase.")
        r2 = requests.get(f"{self.base}/events", params={"select": "image_url", "limit": "1"},
                          headers=self.h, timeout=20)
        if r2.status_code >= 300:
            return ("A la base de datos le falta la columna de fotos (image_url). Vuelve a ejecutar "
                    "supabase/schema.sql en el SQL Editor de Supabase (es seguro, no borra nada).")
        if r.status_code >= 300:
            return f"Supabase respondió {r.status_code}: {r.text[:200]}"
        return None

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
        "image_url": ev.image_url,
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
        raw_url, raw_key = env("SUPABASE_URL"), env("SUPABASE_SERVICE_KEY")
        if not raw_url or not raw_key:
            log("Faltan los secretos SUPABASE_URL / SUPABASE_SERVICE_KEY en GitHub (o usa --dry-run)")
            return 2
        url = normalize_supabase_url(raw_url)
        if not url:
            log("El secreto SUPABASE_URL no parece una dirección de Supabase. "
                "Debe ser como https://abcdefghijklmnopqrst.supabase.co "
                f"(el valor guardado tiene {len(raw_url)} caracteres"
                f"{', empieza por https' if raw_url.strip().startswith('https') else ', NO empieza por https://'}).")
            return 2
        sb = Supabase(url, clean_key(raw_key))
        problem = sb.check()
        if problem:
            log("✗ " + problem)
            return 2
        log("Conexión con Supabase OK ✔")

    import anthropic  # importado aquí para que --help funcione sin la librería
    client = anthropic.Anthropic(api_key=api_key)
    # Haiku: bastante más barato y suficiente para encontrar y ordenar eventos.
    model = env("CLAUDE_MODEL", "claude-haiku-4-5-20251001")

    today = dt.date.today()
    desde, hasta = today, today + dt.timedelta(days=int(env("DAYS_AHEAD", "21")))
    chosen = args.provinces or env("PROVINCES")
    provincias = [p.strip() for p in chosen.split(",") if p.strip()] if chosen else \
        provinces_for_today(int(env("PROVINCES_PER_RUN", "3")), today)

    focuses = [f.strip() for f in (env("SEARCH_FOCUSES", DEFAULT_FOCUSES) or "").split(",")
               if f.strip() in SEARCH_FOCUSES] or ["fiestas"]
    log(f"Buscando ({', '.join(focuses)}) del {desde} al {hasta} en: {', '.join(provincias)}")
    geo = Geocoder(env("CONTACT_EMAIL"))
    images = ImageFinder()
    all_rows: dict[str, dict] = {}
    failures = 0
    out_of_credit = False

    for prov in provincias:
        if out_of_credit:
            break
        log(f"\n→ {prov}")
        raw: list = []
        errors = 0
        for focus in focuses:
            try:
                found = ask_claude(client, model, prov, desde, hasta, focus)
                log(f"  [{focus}] {len(found)} candidatos")
                raw += found
            except OutOfCredit:
                out_of_credit = True
                log("\n✗ SE HA ACABADO EL SALDO de Anthropic. Añade saldo en console.anthropic.com → Billing.\n"
                    "  Se guardan las fiestas encontradas hasta ahora y se para aquí.")
                break
            except Exception as e:  # noqa: BLE001
                errors += 1
                log(f"  ! Error consultando a Claude ({focus}): {e}")
        if out_of_credit and not raw:
            break
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
            ev.image_url = images.find(ev)
            all_rows[ev.key] = to_row(ev)
            ok += 1
            log(f"  + {ev.start_at:%d/%m} {ev.title} — {ev.town}{'  📷' if ev.image_url else ''}")
        log(f"  {ok} válidos")

    rows = list(all_rows.values())
    log(f"\nTotal: {len(rows)} eventos ({sum(1 for r in rows if r.get('image_url'))} con foto)")
    log(f"Consumo IA: {USAGE['input']:,} tokens de entrada, {USAGE['output']:,} de salida, "
        f"{USAGE['searches']} búsquedas web → coste aproximado ${estimated_cost(model):.2f} "
        f"(modelo {model}; el dato exacto está en console.anthropic.com → Usage)")

    if args.dry_run:
        print(json.dumps(rows, ensure_ascii=False, indent=2))
        return 0

    if rows:
        sb.upsert(rows)
        log("Guardados en Supabase ✔")
    sb.delete_finished(dt.datetime.now())
    log("Fiestas terminadas eliminadas ✔")
    # Falla (❌ en GitHub) si se acabó el saldo o no ha funcionado ninguna provincia, para que se note
    return 1 if out_of_credit or failures == len(provincias) else 0


if __name__ == "__main__":
    sys.exit(main())
