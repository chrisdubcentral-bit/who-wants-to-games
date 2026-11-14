-- Online Top 100. Netlify applies this automatically on deploy (netlify/database/migrations).
-- Never edit a migration that has already been deployed: add a new numbered file instead.

-- One row per game started. The token proves an entry came from a real game, and created_at
-- lets the server check the game took as long as it claims.
CREATE TABLE top100_runs (
  token       uuid PRIMARY KEY,
  edition     text NOT NULL,
  ip_hash     text NOT NULL,           -- salted hash, for rate limiting only; never the IP itself
  created_at  timestamptz NOT NULL DEFAULT now(),
  submits     integer NOT NULL DEFAULT 0
);
CREATE INDEX top100_runs_ip ON top100_runs (ip_hash, created_at);
CREATE INDEX top100_runs_age ON top100_runs (created_at);

-- One row per run on the board. A champion who plays on updates their row.
CREATE TABLE top100_entries (
  id                   integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  edition              text NOT NULL,
  board                text NOT NULL,   -- change BOARD in server/top100/handlers.js to start a fresh board
  run_token            uuid NOT NULL UNIQUE,
  name                 text NOT NULL,
  town                 text NOT NULL,
  result               text NOT NULL,
  cups                 integer NOT NULL,
  season               integer NOT NULL,
  stage_key            text,
  stage_reached_index  integer NOT NULL,
  correct_count        integer NOT NULL,
  rounds_played        integer NOT NULL,
  lifeline_used        boolean NOT NULL,
  duration_ms          integer NOT NULL,
  hidden               boolean NOT NULL DEFAULT false,   -- hidden by the admin
  ip_hash              text NOT NULL,
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now()
);
-- Same order as compareEntries in engine/js/game/ranking.js.
CREATE INDEX top100_entries_rank ON top100_entries
  (edition, board, hidden, cups DESC, correct_count DESC, lifeline_used, duration_ms, updated_at);
