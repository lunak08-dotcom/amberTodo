-- Run once in the new dedicated Supabase project's SQL Editor.
-- Transactional and non-destructive: an existing table of this name aborts the
-- transaction rather than replacing or changing existing data.
begin;

create table public.ambertodo_memos (
    user_id uuid not null references auth.users (id) on delete cascade,
    id bigint not null,
    content jsonb not null,
    primary key (user_id, id),
    constraint ambertodo_safe_id check (id > 0 and id <= 9007199254740991),
    constraint ambertodo_content_matches_id check (
        jsonb_typeof(content) = 'object'
        and content ? 'id'
        and jsonb_typeof(content -> 'id') = 'number'
        and (content ->> 'id') = id::text
    )
);

comment on column public.ambertodo_memos.content is
    'Original memo JSON, including legacy metadata and absent or invalid createdAt values.';

alter table public.ambertodo_memos enable row level security;
alter table public.ambertodo_memos force row level security;

revoke all on table public.ambertodo_memos from public, anon, authenticated;
grant select, insert, update, delete on table public.ambertodo_memos to authenticated;

create policy "Owners can read their memos"
on public.ambertodo_memos for select to authenticated
using ((select auth.uid()) = user_id);

create policy "Owners can add their memos"
on public.ambertodo_memos for insert to authenticated
with check ((select auth.uid()) = user_id);

create policy "Owners can update their memos"
on public.ambertodo_memos for update to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

create policy "Owners can delete their memos"
on public.ambertodo_memos for delete to authenticated
using ((select auth.uid()) = user_id);

commit;
