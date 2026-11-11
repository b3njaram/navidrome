import pg from 'pg';

const { Pool } = pg;
let pool;
let ready;
const schema = `
CREATE TABLE IF NOT EXISTS social_profiles (
  username TEXT PRIMARY KEY,
  display_name TEXT NOT NULL CHECK (length(display_name) BETWEEN 1 AND 80),
  bio TEXT NOT NULL DEFAULT '' CHECK (length(bio) <= 300),
  discoverable BOOLEAN NOT NULL DEFAULT TRUE,
  blend_opt_in BOOLEAN NOT NULL DEFAULT FALSE,
  avatar_mime TEXT,
  avatar_bytes BYTEA,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS social_friend_requests (
  requester TEXT NOT NULL REFERENCES social_profiles(username) ON DELETE CASCADE,
  recipient TEXT NOT NULL REFERENCES social_profiles(username) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','accepted','declined')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY(requester,recipient),
  CHECK(requester <> recipient)
);
CREATE TABLE IF NOT EXISTS social_friends (
  a TEXT NOT NULL REFERENCES social_profiles(username) ON DELETE CASCADE,
  b TEXT NOT NULL REFERENCES social_profiles(username) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY(a,b),
  CHECK(a < b)
);
CREATE TABLE IF NOT EXISTS social_playlists (
  id UUID PRIMARY KEY,
  owner TEXT NOT NULL REFERENCES social_profiles(username) ON DELETE CASCADE,
  title TEXT NOT NULL CHECK(length(title) BETWEEN 1 AND 100),
  description TEXT NOT NULL DEFAULT '' CHECK(length(description) <= 300),
  visibility TEXT NOT NULL DEFAULT 'private' CHECK(visibility IN ('private','public')),
  kind TEXT NOT NULL DEFAULT 'manual' CHECK(kind IN ('manual','blend')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK(kind <> 'blend' OR visibility = 'private')
);
ALTER TABLE social_playlists ADD COLUMN IF NOT EXISTS source_navidrome_id TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS social_playlist_native_copy_uniq ON social_playlists(owner,source_navidrome_id) WHERE source_navidrome_id IS NOT NULL;
CREATE TABLE IF NOT EXISTS social_members (
  playlist_id UUID NOT NULL REFERENCES social_playlists(id) ON DELETE CASCADE,
  username TEXT NOT NULL REFERENCES social_profiles(username) ON DELETE CASCADE,
  can_edit BOOLEAN NOT NULL DEFAULT FALSE,
  joined_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY(playlist_id,username)
);
CREATE TABLE IF NOT EXISTS social_playlist_invitations (
  id UUID PRIMARY KEY,
  playlist_id UUID NOT NULL REFERENCES social_playlists(id) ON DELETE CASCADE,
  sender TEXT NOT NULL REFERENCES social_profiles(username) ON DELETE CASCADE,
  recipient TEXT NOT NULL REFERENCES social_profiles(username) ON DELETE CASCADE,
  can_edit BOOLEAN NOT NULL DEFAULT TRUE,
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','accepted','declined','revoked')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK(sender <> recipient)
);
CREATE UNIQUE INDEX IF NOT EXISTS social_playlist_pending_invite
  ON social_playlist_invitations(playlist_id,recipient) WHERE status='pending';
CREATE INDEX IF NOT EXISTS social_playlist_inbox
  ON social_playlist_invitations(recipient,status,created_at DESC);
CREATE TABLE IF NOT EXISTS social_tracks (
  id BIGSERIAL PRIMARY KEY,
  playlist_id UUID NOT NULL REFERENCES social_playlists(id) ON DELETE CASCADE,
  track_id TEXT NOT NULL CHECK(length(track_id) BETWEEN 1 AND 180),
  title TEXT NOT NULL CHECK(length(title) BETWEEN 1 AND 200),
  artist TEXT NOT NULL DEFAULT '' CHECK(length(artist) <= 200),
  album TEXT NOT NULL DEFAULT '' CHECK(length(album) <= 200),
  cover_art TEXT NOT NULL DEFAULT '' CHECK(length(cover_art) <= 180),
  duration INTEGER NOT NULL DEFAULT 0 CHECK(duration BETWEEN 0 AND 100000),
  added_by TEXT NOT NULL REFERENCES social_profiles(username) ON DELETE CASCADE,
  added_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(playlist_id,track_id)
);
CREATE TABLE IF NOT EXISTS social_blend_picks (
  username TEXT NOT NULL REFERENCES social_profiles(username) ON DELETE CASCADE,
  track_id TEXT NOT NULL CHECK(length(track_id) BETWEEN 1 AND 180),
  title TEXT NOT NULL CHECK(length(title) BETWEEN 1 AND 200),
  artist TEXT NOT NULL DEFAULT '' CHECK(length(artist) <= 200),
  album TEXT NOT NULL DEFAULT '' CHECK(length(album) <= 200),
  cover_art TEXT NOT NULL DEFAULT '' CHECK(length(cover_art) <= 180),
  duration INTEGER NOT NULL DEFAULT 0 CHECK(duration BETWEEN 0 AND 100000),
  PRIMARY KEY(username,track_id)
);
CREATE TABLE IF NOT EXISTS music_import_requests (
  id UUID PRIMARY KEY,
  requester TEXT NOT NULL REFERENCES social_profiles(username) ON DELETE CASCADE,
  peer_username TEXT NOT NULL CHECK(length(peer_username) BETWEEN 1 AND 100),
  filename TEXT NOT NULL CHECK(length(filename) BETWEEN 1 AND 900),
  size_bytes BIGINT NOT NULL CHECK(size_bytes BETWEEN 1024 AND 2147483648),
  artist TEXT NOT NULL CHECK(length(artist) BETWEEN 1 AND 180),
  title TEXT NOT NULL CHECK(length(title) BETWEEN 1 AND 180),
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK(status IN ('pending','processing','queued','rejected','needs_review')),
  reviewed_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE music_import_requests ADD COLUMN IF NOT EXISTS downloader_job_id TEXT;
ALTER TABLE music_import_requests ADD COLUMN IF NOT EXISTS already_on_nas BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE music_import_requests ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ;
ALTER TABLE music_import_requests ADD COLUMN IF NOT EXISTS import_error TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS music_requests_unique_pending
  ON music_import_requests(requester,peer_username,filename) WHERE status='pending';
CREATE INDEX IF NOT EXISTS music_requests_status_created
  ON music_import_requests(status,created_at DESC);
CREATE INDEX IF NOT EXISTS music_requests_user
  ON music_import_requests(requester,created_at DESC);
CREATE TABLE IF NOT EXISTS invidious_imports (
  id UUID PRIMARY KEY,
  requester TEXT NOT NULL REFERENCES social_profiles(username) ON DELETE CASCADE,
  video_id TEXT NOT NULL CHECK(length(video_id) = 11),
  title TEXT NOT NULL CHECK(length(title) BETWEEN 1 AND 200),
  artist TEXT NOT NULL CHECK(length(artist) BETWEEN 1 AND 140),
  status TEXT NOT NULL DEFAULT 'processing'
    CHECK(status IN ('processing','queued','needs_review','failed')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS invidious_imports_user_idx
  ON invidious_imports(requester,created_at DESC);
CREATE TABLE IF NOT EXISTS personalized_cover_art (
  username TEXT NOT NULL REFERENCES social_profiles(username) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK(kind IN ('album','playlist')),
  entity_id TEXT NOT NULL CHECK(length(entity_id) BETWEEN 1 AND 150),
  mime TEXT NOT NULL CHECK(mime IN ('image/jpeg','image/png','image/webp')),
  bytes BYTEA NOT NULL CHECK(octet_length(bytes) BETWEEN 16 AND 1048576),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY(username,kind,entity_id)
);
-- Per-user listening events used for Jobbi's weekly, monthly and contextual
-- recommendations. Do not share this table with community or other users.
CREATE TABLE IF NOT EXISTS jobbi_listens (
  id BIGSERIAL PRIMARY KEY,
  username TEXT NOT NULL CHECK(length(username) BETWEEN 1 AND 120),
  song_id TEXT NOT NULL CHECK(length(song_id) BETWEEN 1 AND 150),
  song_data JSONB NOT NULL,
  local_hour SMALLINT NOT NULL CHECK(local_hour BETWEEN 0 AND 23),
  source TEXT NOT NULL CHECK(source IN ('web','android')),
  played_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS jobbi_listens_user_time_idx ON jobbi_listens(username,played_at DESC);
CREATE INDEX IF NOT EXISTS jobbi_listens_song_time_idx ON jobbi_listens(username,song_id,played_at DESC);
CREATE INDEX IF NOT EXISTS social_playlists_public_idx ON social_playlists(updated_at DESC) WHERE visibility='public';
CREATE INDEX IF NOT EXISTS social_playlists_owner_idx ON social_playlists(owner);
CREATE INDEX IF NOT EXISTS social_members_username_idx ON social_members(username);
CREATE INDEX IF NOT EXISTS social_tracks_playlist_idx ON social_tracks(playlist_id,id);
CREATE INDEX IF NOT EXISTS social_tracks_added_by_idx ON social_tracks(added_by);
CREATE INDEX IF NOT EXISTS social_requests_incoming_idx ON social_friend_requests(recipient,status);
`;

export function socialPool() {
  if(!pool){
    const connectionString=process.env.SOCIAL_DATABASE_URL;
    if(!connectionString)throw new Error('SOCIAL_DATABASE_URL is not configured');
    pool=new Pool({connectionString,max:8,connectionTimeoutMillis:4000,idleTimeoutMillis:30000,
      statement_timeout:8000,query_timeout:10000,application_name:'jobbi_social'});
    pool.on('error',err=>console.error('Social database connection error:',err.code||err.name));
  }
  return pool;
}
export function socialReady(){
  if(!ready)ready=(async()=>{
    const p=socialPool(),client=await p.connect();
    try{
      // Serialize schema creation across application processes. Concurrent
      // CREATE TABLE IF NOT EXISTS can otherwise conflict in pg_class/pg_type.
      await client.query('SELECT pg_advisory_lock(90280643)');
      await client.query(schema);
      return p;
    }finally{
      try{await client.query('SELECT pg_advisory_unlock(90280643)')}catch{}
      client.release();
    }
  })().catch(err=>{if(process.env.CI)console.error('Social schema test diagnostic:',err.code||err.name,String(err.message||'').slice(0,300));ready=null;throw err});
  return ready;
}
export async function withSocialTransaction(fn){
  const p=await socialReady();
  const client=await p.connect();
  try{
    await client.query('BEGIN');
    const output=await fn(client);
    await client.query('COMMIT');
    return output;
  }catch(err){
    try{await client.query('ROLLBACK')}catch{}
    throw err;
  }finally{client.release()}
}
export async function socialQuery(sql,params=[]){
  const p=await socialReady();
  return p.query(sql,params);
}
export function normalUsername(username){
  if(typeof username!=='string')return null;
  const clean=username.trim().toLowerCase();
  return /^[\p{L}\p{M}\p{N}_.@-]{1,80}$/u.test(clean)?clean:null;
}
export async function ensureSocialProfile(username){
  const name=normalUsername(username);
  if(!name)throw new Error('Account name is not supported by social features');
  await socialQuery(`INSERT INTO social_profiles(username,display_name) VALUES($1,$2)
    ON CONFLICT(username) DO NOTHING`,[name,username.trim().slice(0,80)]);
  return name;
}
