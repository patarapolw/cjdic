alter table public.quiz enable row level security;

-- layouts policies
create policy "quiz select by user"
on public.quiz
for SELECT
to authenticated
using ((select auth.uid()) = user_id);

create policy "quiz insert by user"
on public.quiz
for INSERT
to authenticated
with check ((select auth.uid()) = user_id);

create policy "quiz update by user"
on public.quiz
for UPDATE
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

create policy "quiz delete by user"
on public.quiz
for DELETE
to authenticated
using ((select auth.uid()) = user_id);
