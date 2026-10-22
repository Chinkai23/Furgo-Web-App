-- Add a staff role for order-only portal access. Grant staff roles only through a trusted process.
alter type public.app_role add value if not exists 'staff';
