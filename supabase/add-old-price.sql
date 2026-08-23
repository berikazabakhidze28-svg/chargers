alter table public.products
add column if not exists old_price numeric(10,2)
check (old_price is null or old_price >= 0);