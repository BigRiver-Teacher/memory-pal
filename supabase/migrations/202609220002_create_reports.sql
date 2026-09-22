create table if not exists public.reports (
    id uuid primary key default gen_random_uuid(),
    patient_id uuid not null
        references public.patients(id)
        on delete cascade,
    report_date date not null,
    advice text not null,
    created_at timestamptz not null default now(),
    constraint reports_patient_date_key
        unique (patient_id, report_date)
);

create index if not exists reports_patient_date_idx
    on public.reports (patient_id, report_date desc);

alter table public.reports enable row level security;

drop policy if exists "reports_owner_policy" on public.reports;
create policy "reports_owner_policy"
on public.reports
for all
to authenticated
using (
    exists (
        select 1
        from public.patients as p
        where p.id = reports.patient_id
          and p.owner_id = (select auth.uid())
    )
)
with check (
    exists (
        select 1
        from public.patients as p
        where p.id = reports.patient_id
          and p.owner_id = (select auth.uid())
    )
);

grant select, insert, update, delete
on public.reports
to authenticated;

grant select, insert, update, delete
on public.reports
to service_role;