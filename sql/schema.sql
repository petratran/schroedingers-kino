-- =====================================================================
-- Schrödingers Kino — Datenmodell für Supabase (Postgres)
-- Einspielen: Supabase → SQL Editor → einfügen → Run.
-- Ist idempotent, kann also gefahrlos zweimal laufen.
-- =====================================================================

-- --- Filme ------------------------------------------------------------
create table if not exists film (
  tmdb_id      integer primary key,
  title_orig   text,
  title_de     text,
  year         integer,
  runtime_min  integer,
  director     text,
  poster_path  text,
  updated_at   timestamptz not null default now()
);

-- --- Watchlist (Letterboxd-Export) ------------------------------------
create table if not exists watchlist (
  tmdb_id        integer primary key references film(tmdb_id) on delete cascade,
  letterboxd_uri text,
  title_raw      text not null,      -- Titel wie im Export, für Nachvollziehbarkeit
  year_raw       text,
  added_on       date,               -- Spalte "Date" aus dem Export
  synced_at      timestamptz not null default now()
);

-- --- Kinos ------------------------------------------------------------
create table if not exists cinema (
  id            text primary key,     -- 'delphi', 'atelier', …
  name          text not null,
  ort           text not null default 'Stuttgart',   -- Ort in der Region
  district      text,
  group_id      text not null,        -- 'arthaus', 'innenstadt', 'cinemaxx', …
  group_name    text not null,
  mubi_partner  boolean not null default false,
  kinozeit_node text,                 -- Kino-ID bei kino-zeit.de
  source_url    text
);

-- --- Titel-Cache: der Kern der Kaskade --------------------------------
-- Schlüssel ist die stabile kino-zeit-node-ID des Films. Quellen ohne
-- eigene ID bekommen 'titel:<normalisierter titel>' als Ersatzschlüssel.
create table if not exists title_alias (
  source_key  text primary key,
  raw_title   text not null,
  tmdb_id     integer references film(tmdb_id) on delete set null,
  confidence  numeric(4,3) not null default 0,
  resolved_by text not null check (resolved_by in ('tmdb','llm','manual','offen')),
  status      text not null check (status in ('sicher','unscharf','offen')),
  reason      text,
  checked_at  timestamptz not null default now()
);
comment on table title_alias is
  'Einmal aufgelöst, nie wieder gefragt. resolved_by = manual wird von der Pipeline nie überschrieben.';

-- --- Vorstellungen ----------------------------------------------------
create table if not exists showing (
  id          bigserial primary key,
  cinema_id   text not null references cinema(id) on delete cascade,
  source      text not null default 'kino-zeit',
  source_key  text,                  -- verweist auf title_alias.source_key
  raw_title   text not null,
  version     text,                  -- OmU, OF, OV, DF
  format      text,                  -- MXP, PLF, IMAX, 3D
  genre       text,
  runtime_min integer,
  starts_at   timestamptz not null,
  booking_url text,
  fetched_at  timestamptz not null default now(),
  unique (cinema_id, starts_at, raw_title)
);
create index if not exists showing_starts_idx on showing (starts_at);
create index if not exists showing_source_key_idx on showing (source_key);
create index if not exists showing_cinema_idx on showing (cinema_id);

-- --- MUBI-GO-Film der Woche ------------------------------------------
create table if not exists mubi_go (
  valid_from date primary key,
  raw_title  text not null,
  tmdb_id    integer references film(tmdb_id) on delete set null,
  source     text default 'https://mubi.com/de/de/go'
);

-- --- Benachrichtigungen (vorerst ungenutzt, Kanal nachrüstbar) --------
create table if not exists notification_log (
  tmdb_id   integer not null,
  cinema_id text not null,
  sent_at   timestamptz not null default now(),
  primary key (tmdb_id, cinema_id)
);

-- =====================================================================
-- Sicht für Workflow 5: genau das, was ins Dashboard-JSON gehört.
-- =====================================================================
create or replace view v_programm as
select
  s.id,
  s.cinema_id,
  c.name         as cinema_name,
  c.district,
  c.group_id,
  c.group_name,
  c.mubi_partner,
  s.raw_title,
  s.version,
  s.format,
  s.genre,
  s.runtime_min,
  s.starts_at,
  s.booking_url,
  a.tmdb_id,
  a.confidence,
  a.resolved_by,
  a.status                                   as match_status,
  (w.tmdb_id is not null)                    as auf_watchlist,
  w.title_raw                                as watchlist_titel,
  w.added_on                                 as watchlist_seit,
  (m.tmdb_id is not null and m.tmdb_id = a.tmdb_id) as mubi_go,
  -- Ab hier fuer Workflow 5 ergaenzt. Neue Spalten muessen bei
  -- "create or replace view" hinten stehen, sonst lehnt Postgres ab.
  s.source_key,
  c.ort,
  c.kinozeit_node,
  w.letterboxd_uri                           as watchlist_uri,
  w.year_raw                                 as watchlist_jahr,
  f.title_de,
  f.title_orig,
  f.year                                     as film_jahr,
  f.runtime_min                              as film_runtime_min,
  f.director,
  f.poster_path
from showing s
join cinema c        on c.id = s.cinema_id
left join title_alias a on a.source_key = s.source_key
left join watchlist  w on w.tmdb_id = a.tmdb_id
left join film       f on f.tmdb_id = a.tmdb_id
left join mubi_go    m on m.valid_from = (select max(valid_from) from mubi_go)
where s.starts_at >= now() - interval '6 hours'
order by s.starts_at, c.name;

comment on view v_programm is
  'Ein Select für das Dashboard-JSON. auf_watchlist ist nur true, wenn die Kaskade eine TMDb-ID gefunden hat.';

-- =====================================================================
-- Kino-Stammdaten (entspricht pipeline/import-capture.js)
-- =====================================================================
-- >>> kinos aus data/kinos.json — erzeugt, nicht von Hand pflegen
-- Region Stuttgart · 16 Haeuser · Stand 2026-09-20
insert into cinema (id, name, ort, district, group_id, group_name, mubi_partner, kinozeit_node) values
  ('delphi', 'Delphi Arthaus Kino', 'Stuttgart', 'Stuttgart-Süd', 'arthaus', 'Arthaus Filmtheater', true, '2354'),
  ('atelier', 'atelier am bollwerk', 'Stuttgart', 'Stuttgart-Mitte', 'arthaus', 'Arthaus Filmtheater', true, '2357'),
  ('gloria', 'Gloria', 'Stuttgart', 'Marquardtbau, Mitte', 'innenstadt', 'Innenstadtkinos', true, '2356'),
  ('em', 'EM', 'Stuttgart', 'Marquardtbau, Mitte', 'innenstadt', 'Innenstadtkinos', true, '2355'),
  ('cinema', 'Cinema', 'Stuttgart', 'Marquardtbau, Mitte', 'innenstadt', 'Innenstadtkinos', true, '2812'),
  ('metropol', 'Das Metropol', 'Stuttgart', 'Stuttgart-Mitte', 'metropol', 'Das Metropol', false, '2586'),
  ('corso', 'Corso Cinema International', 'Stuttgart', 'Stuttgart-Vaihingen', 'corso', 'Corso', false, '2359'),
  ('cinemaxx-liederhalle', 'CinemaxX Liederhalle', 'Stuttgart', 'Stuttgart-Mitte', 'cinemaxx', 'CinemaxX', false, '2667'),
  ('cinemaxx-si', 'CinemaxX SI-Centrum', 'Stuttgart', 'Stuttgart-Möhringen', 'cinemaxx', 'CinemaxX', false, '2448'),
  ('komm-es', 'Kommunales Kino Esslingen', 'Esslingen', 'Esslingen', 'esslingen', 'Esslingen', false, '2194'),
  ('traumpalast-es', 'Traumpalast Esslingen', 'Esslingen', 'Esslingen', 'esslingen', 'Esslingen', false, '2741'),
  ('caligari', 'Caligari Kino', 'Ludwigsburg', 'Ludwigsburg', 'ludwigsburg', 'Ludwigsburg', false, '2246'),
  ('central-lb', 'Central Kino', 'Ludwigsburg', 'Ludwigsburg', 'ludwigsburg', 'Ludwigsburg', false, '2248'),
  ('luna', 'Luna Lichtspieltheater', 'Ludwigsburg', 'Ludwigsburg', 'ludwigsburg', 'Ludwigsburg', false, '2598'),
  ('union-lb', 'Union Kino', 'Ludwigsburg', 'Ludwigsburg', 'ludwigsburg', 'Ludwigsburg', false, '2249'),
  ('traumpalast-imax', 'Traumpalast IMAX Leonberg', 'Leonberg', 'Leonberg', 'leonberg', 'Leonberg · IMAX', false, '53864')
on conflict (id) do update set
  name = excluded.name, ort = excluded.ort, district = excluded.district,
  group_id = excluded.group_id, group_name = excluded.group_name,
  mubi_partner = excluded.mubi_partner, kinozeit_node = excluded.kinozeit_node;

-- bewusst nicht aufgenommen: node 3321 (Traumpalast Kino, Leonberg) — Für Leonberg sollen nur IMAX-Vorstellungen erscheinen. kino-zeit führt den IMAX-Saal als eigenes Kino (node 53864); der reguläre Traumpalast bleibt deshalb bewusst draußen. Ein Format-Filter wäre hier der falsche Weg — die Ortsseite vergibt für Leonberg gar keine Formatkürzel.
-- <<< Ende erzeugter Block

-- MUBI-GO-Partnerschaft am 18.09.2026 von Petra in der MUBI-App geprüft.

-- =====================================================================
-- Sicht fuer Workflow 3: welche Titel noch aufzuloesen sind.
-- Ein Titel je source_key, mit dem naechsten Termin als Kontext fuer die
-- Datumspruefung in 02-score-decide.js.
--
-- Wiedervorlage: Was einmal sicher oder unscharf aufgeloest ist, wird nie
-- wieder gefragt. Ein 'offen' gebliebener Titel dagegen schon — aber
-- fruehestens nach sieben Tagen, und niemals ein von Hand gesetzter.
-- Ohne diese Ausnahme bliebe ein Film, den TMDb zum Zeitpunkt des Laufs noch
-- nicht kannte, fuer immer unaufgeloest.
-- =====================================================================
create or replace view v_offene_titel as
select distinct on (s.source_key)
       s.source_key,
       s.raw_title,
       s.cinema_id,
       c.name  as cinema_name,
       s.starts_at
  from showing s
  join cinema c on c.id = s.cinema_id
  left join title_alias a on a.source_key = s.source_key
 where s.starts_at >= now()
   and (a.source_key is null
        or (a.status = 'offen'
            and a.resolved_by <> 'manual'
            and a.checked_at < now() - interval '7 days'))
 order by s.source_key, s.starts_at;

-- --- Fehlerprotokoll --------------------------------------------------
-- Ziel des Error Workflows in n8n. Ohne ein solches Protokoll merkt man
-- nicht, wenn ein zeitgesteuerter Lauf still bricht.
create table if not exists error_log (
  id            bigserial primary key,
  workflow      text,
  message       text,
  node          text,
  execution_url text,
  occurred_at   timestamptz not null default now()
);

-- =====================================================================
-- Rechte für die API-Rolle.
-- Neuere Supabase-Projekte vergeben die Default-Privilegien nicht mehr
-- durchgängig; ohne diesen Block antwortet PostgREST mit
-- 42501 "permission denied for table film" — obwohl der service_role-Key
-- stimmt. Das ist kein RLS: service_role umgeht RLS ohnehin, hier fehlen
-- die GRANTs auf Tabellenebene.
-- Die beiden alter-default-privileges-Anweisungen sorgen dafür, dass auch
-- künftig angelegte Tabellen und Sequenzen erreichbar sind.
-- =====================================================================
grant usage on schema public to service_role;
grant select, insert, update, delete on all tables in schema public to service_role;
grant usage, select on all sequences in schema public to service_role;

alter default privileges in schema public
  grant select, insert, update, delete on tables to service_role;
alter default privileges in schema public
  grant usage, select on sequences to service_role;

-- =====================================================================
-- Qualitätssicherung: Titelkollisionen zwischen den Quellen
--
-- Angelegt am 22.09.2026 nach dem Fall "Primetime". Delphi zeigt ab dem
-- 24.09. den Film "Primetime" (2026, Lance Oppenheim). kino-zeit hat diese
-- Vorstellungen seinem eigenen Filmknoten 14975 zugeordnet — und der gehört
-- zu "Prime Time (2008)", einem spanischen Thriller. Die Kaskade hat den
-- Knoten korrekt aufgelöst: Sie bekam den alten Film und fand den alten
-- Film. Die Innenstadtkinos liefern über schema.org die Kennung des neuen.
-- Ergebnis: derselbe Film steht zweimal auf der Seite, und keine Stufe der
-- Pipeline hat einen Fehler gemacht.
--
-- Gegen einen falsch verknüpften Aushang ist kein Matching gewachsen — wohl
-- aber gegen das stille Nebeneinander. Diese View zeigt Titel, die sich nach
-- dem Normalisieren gleichen, aber auf verschiedene TMDb-Kennungen zeigen.
-- Sie korrigiert nichts; sie legt den Widerspruch auf den Tisch.
-- =====================================================================
create or replace view v_titel_kollisionen as
select lower(regexp_replace(s.raw_title, '[^a-zA-Z0-9]+', '', 'g')) as schluessel,
       array_agg(distinct s.raw_title order by s.raw_title)          as schreibweisen,
       array_agg(distinct a.tmdb_id)                                 as kennungen,
       array_agg(distinct s.source)                                  as quellen,
       count(*)                                                      as vorstellungen
  from showing s
  join title_alias a on a.source_key = s.source_key
 where a.tmdb_id is not null
   and s.starts_at >= now()
 group by 1
having count(distinct a.tmdb_id) > 1;

comment on view v_titel_kollisionen is
  'Gleicher Titel, verschiedene TMDb-Kennungen. Kein Fehler der Pipeline, sondern ein Widerspruch zwischen den Quellen — zur Sichtprüfung.';
