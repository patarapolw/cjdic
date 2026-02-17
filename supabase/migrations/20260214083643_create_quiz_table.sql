create table public.quiz (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null,
  created_at  timestamptz default now(),
  v           text not null,
  lang        text not null,
  srs         json not null,

  unique(user_id, v, lang)
);

create index quiz_user_v_lang_idx on public.quiz(user_id, v, lang);
