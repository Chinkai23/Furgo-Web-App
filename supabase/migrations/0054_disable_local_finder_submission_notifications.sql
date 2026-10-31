-- Keep the Local Finder review queue available without notifying admins for
-- each new customer-submitted place. Edit suggestion notifications remain on.

drop trigger if exists local_finder_place_review_notification
  on public.local_finder_places;

delete from public.portal_notifications
where event_type = 'local_finder_submission';
