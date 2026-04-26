insert into public.category_suggestions (user_id, category_name, category_type, is_default)
values
  (null, 'Gambling (Income)', 'income', true),
  (null, 'Gambling (Expense)', 'expense', true)
on conflict do nothing;

delete from public.category_suggestions
where user_id is null
  and (
    (category_type = 'income' and lower(category_name) in ('gamblings', 'gambling winning', 'gambling winnings'))
    or
    (category_type = 'expense' and lower(category_name) in ('gamblings', 'gambling', 'gambling expense'))
  );
