create extension if not exists pgcrypto;

create table if not exists public.stroop_results (
  id uuid primary key default gen_random_uuid(),
  participant_id text not null,
  study_day text not null,
  session_label text not null,
  summary jsonb not null,
  interference_score integer,
  overall_accuracy integer not null check (overall_accuracy between 0 and 100),
  vas_fatigue_score integer check (vas_fatigue_score between 0 and 100),
  trials jsonb not null,
  client_submitted_at timestamptz,
  user_agent text,
  viewport text,
  received_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists stroop_results_participant_idx on public.stroop_results (participant_id);
create index if not exists stroop_results_created_at_idx on public.stroop_results (created_at desc);

alter table public.stroop_results
add column if not exists vas_fatigue_score integer check (vas_fatigue_score between 0 and 100);

alter table public.stroop_results enable row level security;

create policy "service role full access"
on public.stroop_results
as permissive
for all
to service_role
using (true)
with check (true);
