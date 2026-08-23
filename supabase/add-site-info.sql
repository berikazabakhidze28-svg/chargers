alter table public.site_settings add column if not exists phone text;
alter table public.site_settings add column if not exists email text;
alter table public.site_settings add column if not exists address text;
alter table public.site_settings add column if not exists map_embed_url text;
update public.site_settings set phone=coalesce(phone,'+995 551 54 64 46'),email=coalesce(email,'info@chargerx.ge') where id=1;