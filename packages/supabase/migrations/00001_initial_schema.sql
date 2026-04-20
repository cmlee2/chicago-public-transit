-- Routes (bus and train)
CREATE TABLE routes (
  route_id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  color TEXT NOT NULL DEFAULT '#888888',
  type TEXT NOT NULL CHECK (type IN ('bus', 'train'))
);

-- Stops
CREATE TABLE stops (
  stop_id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  lat DOUBLE PRECISION NOT NULL,
  lng DOUBLE PRECISION NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('bus', 'train')),
  route_id TEXT NOT NULL REFERENCES routes(route_id) ON DELETE CASCADE
);

CREATE INDEX idx_stops_type ON stops(type);
CREATE INDEX idx_stops_route_id ON stops(route_id);

-- Arrivals (real-time predictions)
CREATE TABLE arrivals (
  id TEXT PRIMARY KEY,
  stop_id TEXT NOT NULL REFERENCES stops(stop_id) ON DELETE CASCADE,
  route TEXT NOT NULL,
  direction TEXT NOT NULL,
  eta TIMESTAMPTZ NOT NULL,
  vehicle_id TEXT,
  is_delayed BOOLEAN NOT NULL DEFAULT FALSE,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_arrivals_stop_id ON arrivals(stop_id);
CREATE INDEX idx_arrivals_eta ON arrivals(eta);

-- User favorites
CREATE TABLE user_favorites (
  user_id TEXT NOT NULL,
  stop_id TEXT NOT NULL REFERENCES stops(stop_id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, stop_id)
);

CREATE INDEX idx_user_favorites_user_id ON user_favorites(user_id);

-- Enable Realtime on arrivals table
ALTER PUBLICATION supabase_realtime ADD TABLE arrivals;

-- RLS Policies

-- Routes: anyone can read
ALTER TABLE routes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Routes are viewable by everyone"
  ON routes FOR SELECT
  USING (true);

-- Stops: anyone can read
ALTER TABLE stops ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Stops are viewable by everyone"
  ON stops FOR SELECT
  USING (true);

-- Arrivals: anyone can read, service role inserts/updates
ALTER TABLE arrivals ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Arrivals are viewable by everyone"
  ON arrivals FOR SELECT
  USING (true);

-- User favorites: users can manage their own
ALTER TABLE user_favorites ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view their own favorites"
  ON user_favorites FOR SELECT
  USING (auth.jwt() ->> 'sub' = user_id);

CREATE POLICY "Users can insert their own favorites"
  ON user_favorites FOR INSERT
  WITH CHECK (auth.jwt() ->> 'sub' = user_id);

CREATE POLICY "Users can delete their own favorites"
  ON user_favorites FOR DELETE
  USING (auth.jwt() ->> 'sub' = user_id);
