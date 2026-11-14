-- Anonymous site statistics (netlify/functions/stats.mjs). Applied automatically on deploy.
-- Nothing here identifies a person: no IP addresses, no cookies, no names. A visitor is a salted hash
-- that changes every day, so the same person can't be followed from one day to the next.

-- One row per page visit (one open of the game page).
CREATE TABLE stats_sessions (
  id            uuid PRIMARY KEY,            -- made up by the page when it opens; never stored on the device
  edition       text NOT NULL,
  day           date NOT NULL,               -- UK date the visit started
  started_at    timestamptz NOT NULL DEFAULT now(),
  last_seen     timestamptz NOT NULL DEFAULT now(),
  active_ms     integer NOT NULL DEFAULT 0,  -- time the page was on screen
  visitor       text NOT NULL,               -- daily salted hash, for counting unique visitors per day
  device        text NOT NULL,               -- phone | tablet | desktop
  source        text NOT NULL,               -- where they came from (site name, ?utm_source, or Direct)
  country       text,
  region        text,
  events        integer NOT NULL DEFAULT 0   -- events recorded, to cap junk
);
CREATE INDEX stats_sessions_day ON stats_sessions (edition, day);

-- Things that happen during a visit: games, adverts, Top 100 entries.
CREATE TABLE stats_events (
  id          integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  session_id  uuid NOT NULL,
  edition     text NOT NULL,
  day         date NOT NULL,
  at          timestamptz NOT NULL DEFAULT now(),
  type        text NOT NULL,     -- game_start | game_end | advert_shown | advert_click | advert_skip | advert_complete | top100_entry
  advert      text,              -- advert id, for advert events
  stage       integer,           -- game_end: stage reached (0-based; = number of stages for a win)
  season      integer,           -- game_end: season of the run
  value       integer,           -- advert_skip: ms watched; game_end: cups won
  detail      text               -- game_end: won | eliminated; advert_click: video | button
);
CREATE INDEX stats_events_day ON stats_events (edition, day, type);
