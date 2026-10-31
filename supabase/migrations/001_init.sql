-- Jeopardy Party schema.
-- Hosts (Google sign-in) own games and rooms. Players are anonymous: every
-- player action goes through a SECURITY DEFINER function authorised by the
-- team token handed out at join time. Room state is pushed to clients with
-- Realtime "broadcast from database" on the public topic room-<CODE>.

create table public.games (
  id uuid primary key default gen_random_uuid(),
  owner uuid not null default auth.uid() references auth.users on delete cascade,
  title text not null default 'Untitled game',
  board jsonb not null,
  settings jsonb not null default '{"penalty": true, "dailyDoubles": true}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index games_owner_idx on public.games (owner);
alter table public.games enable row level security;
create policy "hosts manage own games" on public.games for all to authenticated
  using (owner = (select auth.uid())) with check (owner = (select auth.uid()));

create table public.rooms (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  host uuid not null default auth.uid() references auth.users on delete cascade,
  game_id uuid references public.games on delete set null,
  state jsonb not null,
  version int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index rooms_host_idx on public.rooms (host);
create index rooms_game_idx on public.rooms (game_id);
alter table public.rooms enable row level security;
create policy "hosts manage own rooms" on public.rooms for all to authenticated
  using (host = (select auth.uid())) with check (host = (select auth.uid()));

-- Secrets for a running room: Daily Double positions, correct responses.
create table public.room_private (
  room_id uuid primary key references public.rooms on delete cascade,
  data jsonb not null default '{}'
);
alter table public.room_private enable row level security;
create policy "hosts manage own room secrets" on public.room_private for all to authenticated
  using (exists (select 1 from public.rooms r where r.id = room_id and r.host = (select auth.uid())))
  with check (exists (select 1 from public.rooms r where r.id = room_id and r.host = (select auth.uid())));

-- Teams and their secret tokens. No client policies: functions only.
create table public.room_teams (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.rooms on delete cascade,
  token uuid not null default gen_random_uuid(),
  name text not null,
  early_until timestamptz,
  created_at timestamptz not null default now()
);
create index room_teams_room_idx on public.room_teams (room_id);
alter table public.room_teams enable row level security;

-- Final Jeopardy wagers and responses, readable only by the host.
create table public.room_submissions (
  room_id uuid not null references public.rooms on delete cascade,
  team_id uuid not null references public.room_teams on delete cascade,
  kind text not null check (kind in ('final_wager', 'final_response')),
  value text not null,
  created_at timestamptz not null default now(),
  primary key (room_id, team_id, kind)
);
create index room_submissions_team_idx on public.room_submissions (team_id);
alter table public.room_submissions enable row level security;
create policy "hosts read own room submissions" on public.room_submissions for select to authenticated
  using (exists (select 1 from public.rooms r where r.id = room_id and r.host = (select auth.uid())));

-- Push every room change to its public broadcast topic.
create function public.rooms_broadcast() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  perform realtime.send(
    jsonb_build_object('state', new.state, 'version', new.version),
    'state', 'room-' || new.code, false);
  return null;
end $$;
create trigger rooms_broadcast after insert or update on public.rooms
  for each row execute function public.rooms_broadcast();

create function public.server_now() returns bigint
language sql stable set search_path = '' as $$
  select (extract(epoch from clock_timestamp()) * 1000)::bigint
$$;

create function public.get_room(p_code text) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('roomId', r.id, 'state', r.state, 'version', r.version)
  from public.rooms r where r.code = upper(p_code)
$$;

create function public.join_room(p_code text, p_name text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  r public.rooms;
  v_name text := left(btrim(p_name), 24);
  v_color text;
  v_team public.room_teams;
begin
  select * into r from public.rooms where code = upper(p_code) for update;
  if not found then raise exception 'Room not found'; end if;
  if v_name = '' then raise exception 'Enter a team name'; end if;
  if jsonb_array_length(r.state->'teams') >= 6 then raise exception 'This game already has 6 teams'; end if;
  if exists (select 1 from jsonb_array_elements(r.state->'teams') t where lower(t->>'name') = lower(v_name)) then
    raise exception 'That team name is taken';
  end if;
  select c into v_color from unnest(array['#e85d04','#2a9d8f','#e63946','#8338ec','#3a86ff','#ff006e']) c
    where not exists (select 1 from jsonb_array_elements(r.state->'teams') t where t->>'color' = c) limit 1;
  insert into public.room_teams (room_id, name) values (r.id, v_name) returning * into v_team;
  update public.rooms set
    state = jsonb_set(state, '{teams}', (state->'teams') || jsonb_build_array(
      jsonb_build_object('id', v_team.id, 'name', v_name, 'color', v_color, 'score', 0))),
    version = version + 1, updated_at = now()
  where id = r.id;
  return jsonb_build_object('teamId', v_team.id, 'token', v_team.token);
end $$;

create function public.rejoin_room(p_code text, p_token uuid) returns uuid
language sql stable security definer set search_path = '' as $$
  select t.id from public.room_teams t join public.rooms r on r.id = t.room_id
  where r.code = upper(p_code) and t.token = p_token
$$;

-- Returns 'won' | 'early' | 'late' | 'locked' | 'ignored'.
create function public.buzz(p_code text, p_token uuid) returns text
language plpgsql security definer set search_path = '' as $$
declare
  r public.rooms;
  t public.room_teams;
  b jsonb;
begin
  select * into r from public.rooms where code = upper(p_code) for update;
  if not found then return 'ignored'; end if;
  select * into t from public.room_teams where room_id = r.id and token = p_token;
  if not found or r.state->>'phase' <> 'clue' then return 'ignored'; end if;
  b := r.state->'current'->'buzz';
  if t.early_until is not null and t.early_until > clock_timestamp() then return 'early'; end if;
  if not coalesce((b->>'open')::boolean, false) then
    if b->>'winner' is null then
      update public.room_teams set early_until = clock_timestamp() + interval '250 milliseconds' where id = t.id;
      return 'early';
    end if;
    return 'late';
  end if;
  if b->>'winner' is not null then return 'late'; end if;
  if (b->'lockedOut') ? t.id::text then return 'locked'; end if;
  update public.rooms set
    state = jsonb_set(jsonb_set(state, '{current,buzz,winner}', to_jsonb(t.id::text)), '{current,buzz,open}', 'false'),
    version = version + 1, updated_at = now()
  where id = r.id;
  return 'won';
end $$;

-- Daily Double wager from the team that picked the clue.
create function public.dd_wager(p_code text, p_token uuid, p_amount int) returns text
language plpgsql security definer set search_path = '' as $$
declare
  r public.rooms;
  t public.room_teams;
  v_score int;
  v_max int;
begin
  select * into r from public.rooms where code = upper(p_code) for update;
  if not found then return 'ignored'; end if;
  select * into t from public.room_teams where room_id = r.id and token = p_token;
  if not found or r.state->>'phase' <> 'dd_wager' or r.state->>'control' <> t.id::text then return 'ignored'; end if;
  select (x->>'score')::int into v_score from jsonb_array_elements(r.state->'teams') x where x->>'id' = t.id::text;
  v_max := greatest(coalesce(v_score, 0), (r.state->>'maxValue')::int);
  if p_amount < 5 or p_amount > v_max then return 'invalid'; end if;
  update public.rooms set
    state = jsonb_set(jsonb_set(state, '{current,ddWager}', to_jsonb(p_amount)), '{phase}', '"dd_clue"'),
    version = version + 1, updated_at = now()
  where id = r.id;
  return 'ok';
end $$;

create function public.final_wager(p_code text, p_token uuid, p_amount int) returns text
language plpgsql security definer set search_path = '' as $$
declare
  r public.rooms;
  t public.room_teams;
  v_score int;
  v_amount int := p_amount;
begin
  select * into r from public.rooms where code = upper(p_code) for update;
  if not found then return 'ignored'; end if;
  select * into t from public.room_teams where room_id = r.id and token = p_token;
  if not found or r.state->>'phase' <> 'final_wager' then return 'ignored'; end if;
  select (x->>'score')::int into v_score from jsonb_array_elements(r.state->'teams') x where x->>'id' = t.id::text;
  if coalesce(v_score, 0) <= 0 then v_amount := 0; end if;
  if v_amount < 0 or v_amount > greatest(v_score, 0) then return 'invalid'; end if;
  insert into public.room_submissions (room_id, team_id, kind, value) values (r.id, t.id, 'final_wager', v_amount::text)
    on conflict (room_id, team_id, kind) do update set value = excluded.value, created_at = now();
  if not ((r.state->'final'->'locked') ? t.id::text) then
    update public.rooms set
      state = jsonb_set(state, '{final,locked}', (state->'final'->'locked') || to_jsonb(t.id::text)),
      version = version + 1, updated_at = now()
    where id = r.id;
  end if;
  return 'ok';
end $$;

create function public.final_response(p_code text, p_token uuid, p_text text) returns text
language plpgsql security definer set search_path = '' as $$
declare
  r public.rooms;
  t public.room_teams;
begin
  select * into r from public.rooms where code = upper(p_code) for update;
  if not found then return 'ignored'; end if;
  select * into t from public.room_teams where room_id = r.id and token = p_token;
  if not found or r.state->>'phase' <> 'final_answer' then return 'ignored'; end if;
  if public.server_now() > (r.state->'final'->>'endsAt')::bigint + 3000 then return 'late'; end if;
  insert into public.room_submissions (room_id, team_id, kind, value) values (r.id, t.id, 'final_response', left(p_text, 200))
    on conflict (room_id, team_id, kind) do update set value = excluded.value, created_at = now();
  if not ((r.state->'final'->'answered') ? t.id::text) then
    update public.rooms set
      state = jsonb_set(state, '{final,answered}', (state->'final'->'answered') || to_jsonb(t.id::text)),
      version = version + 1, updated_at = now()
    where id = r.id;
  end if;
  return 'ok';
end $$;

revoke execute on function public.rooms_broadcast() from public, anon, authenticated;
grant execute on function public.server_now(), public.get_room(text), public.join_room(text, text),
  public.rejoin_room(text, uuid), public.buzz(text, uuid), public.dd_wager(text, uuid, int),
  public.final_wager(text, uuid, int), public.final_response(text, uuid, text) to anon, authenticated;

-- Clue photos: private bucket, each host writes under their own user-id folder.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('clue-images', 'clue-images', false, 2097152, array['image/jpeg', 'image/png', 'image/webp', 'image/gif']);
create policy "hosts manage own clue images" on storage.objects for all to authenticated
  using (bucket_id = 'clue-images' and (storage.foldername(name))[1] = (select auth.uid())::text)
  with check (bucket_id = 'clue-images' and (storage.foldername(name))[1] = (select auth.uid())::text);
