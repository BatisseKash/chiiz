insert into public.category_suggestions (user_id, category_name, category_type, is_default)
values
  (null, 'Salary', 'income', true),
  (null, 'Bonus', 'income', true),
  (null, 'Scholarship / Fellowship', 'income', true),
  (null, 'Gifts & Prizes', 'income', true),
  (null, 'Other', 'income', true),
  (null, 'Gamblings', 'income', true),
  (null, 'Gamblings', 'expense', true)
on conflict do nothing;
