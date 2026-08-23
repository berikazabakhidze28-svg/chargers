create table if not exists public.site_settings (
  id smallint primary key default 1 check (id = 1),
  whatsapp text,
  viber text,
  tiktok text,
  facebook text,
  updated_at timestamptz not null default now()
);
alter table public.site_settings enable row level security;
drop policy if exists "Public can read site settings" on public.site_settings;
create policy "Public can read site settings" on public.site_settings for select using (true);
drop policy if exists "Authenticated admin can insert site settings" on public.site_settings;
create policy "Authenticated admin can insert site settings" on public.site_settings for insert to authenticated with check (true);
drop policy if exists "Authenticated admin can update site settings" on public.site_settings;
create policy "Authenticated admin can update site settings" on public.site_settings for update to authenticated using (true) with check (true);
insert into public.site_settings (id,whatsapp,viber,tiktok,facebook) values (1,'995551546446','995551546446','https://www.tiktok.com/@www.chargerx.ge','https://www.facebook.com/profile.php?id=61565142430707') on conflict (id) do nothing;