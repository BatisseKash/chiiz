update public.category_suggestions
set
  category_name = 'Gambling Winnings',
  updated_at = now()
where user_id is null
  and category_type = 'income'
  and lower(category_name) = 'gamblings';

insert into public.category_suggestions (user_id, category_name, category_type, is_default)
values
  (null, 'Gambling Winnings', 'income', true)
on conflict do nothing;
